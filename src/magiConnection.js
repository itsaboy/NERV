import WebSocket from "ws";
import { chatWithOllama } from "./endpoints/ollama.js";

const activeRequests = new Map();

export function connectToMagi({
  magiUrl,
  deviceId,
  credential,
}) {
  if (!magiUrl) {
    throw new Error("MAGI URL is required");
  }

  if (!deviceId) {
    throw new Error("NERV device ID is required");
  }

  if (!credential) {
    throw new Error("NERV device credential is required");
  }

  const url = new URL(magiUrl);

  url.searchParams.set("deviceId", deviceId);
  url.searchParams.set("credential", credential);

  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("MAGI CONNECTION..... CONNECTED");
  });

  ws.on("message", async (data) => {
    let message;

    try {
      message = JSON.parse(data.toString());
    } catch {
      console.error("MAGI MESSAGE......... INVALID JSON");
      return;
    }

    if (message.type === "ready") {
      console.log("PAIRING............. VERIFIED");
      console.log(`DEVICE.............. ${message.deviceId}`);
      console.log("");
      console.log("NERV READY");
      return;
    }

    if (message.type === "chat") {
      await handleChat(ws, message);
      return;
    }

    if (message.type === "cancel") {
      handleCancel(message);
      return;
    }

    console.log(
      `MAGI MESSAGE......... ${message.type ?? "UNKNOWN"}`,
    );
  });

  ws.on("close", (code, reason) => {
    for (const controller of activeRequests.values()) {
      controller.abort();
    }

    activeRequests.clear();

    const reasonText = reason.toString();

    console.log(
      `MAGI CONNECTION..... CLOSED (${code}${
        reasonText ? `: ${reasonText}` : ""
      })`,
    );
  });

  ws.on("error", (error) => {
    console.error(
      `MAGI CONNECTION..... ERROR: ${error.message}`,
    );
  });

  return ws;
}

async function handleChat(ws, message) {
  const {
    requestId,
    endpointId,
    model,
    request,
  } = message;

  if (!requestId) return;

  if (endpointId !== "ollama-default") {
    send(ws, {
      type: "error",
      requestId,
      error: `Unsupported local endpoint: ${endpointId}`,
    });

    return;
  }

  if (!model) {
    send(ws, {
      type: "error",
      requestId,
      error: "Local model is required",
    });

    return;
  }

  if (activeRequests.has(requestId)) {
    send(ws, {
      type: "error",
      requestId,
      error: "Duplicate local request ID",
    });

    return;
  }

  const controller = new AbortController();

  activeRequests.set(requestId, controller);

  console.log(
    `LOCAL REQUEST........ ${model} (${requestId})`,
  );

  try {
    const result = await chatWithOllama({
      model,
      instructions: request?.instructions ?? "",
      input: request?.input ?? "",
      signal: controller.signal,

      onChunk: (chunk) => {
        send(ws, {
          type: "chunk",
          requestId,
          delta: chunk,
        });
      },
    });

    send(ws, {
      type: "metadata",
      requestId,
      metadata: {
        finishReason: "stop",
        usage: result.usage
          ? {
              ...result.usage,
              costModel: "local",
            }
          : null,
      },
    });

    send(ws, {
      type: "complete",
      requestId,
      text: result.text,
    });

    console.log(
      `LOCAL COMPLETE....... ${model} (${requestId})`,
    );
  } catch (error) {
    if (controller.signal.aborted) {
      console.log(
        `LOCAL CANCELLED...... ${model} (${requestId})`,
      );

      return;
    }

    console.error(
      `LOCAL ERROR.......... ${model}: ${error.message}`,
    );

    send(ws, {
      type: "error",
      requestId,
      error: error.message,
    });
  } finally {
    activeRequests.delete(requestId);
  }
}

function handleCancel(message) {
  const controller =
    activeRequests.get(message.requestId);

  if (!controller) return;

  controller.abort();
}

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify(message));
}