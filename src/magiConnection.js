import WebSocket from "ws";
import { chatWithOllama } from "./endpoints/ollama.js";

const activeRequests = new Map();
const AUTH_TIMEOUT_MS = 10_000;

export function connectToMagi({ magiUrl, deviceId, credential, ollama }) {
  if (!magiUrl) {
    throw new Error("MAGI URL is required");
  }

  if (!deviceId) {
    throw new Error("NERV device ID is required");
  }

  if (!credential) {
    throw new Error("NERV device credential is required");
  }

  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let stopped = false;

  function connect() {
    if (stopped) return;

    const url = new URL(magiUrl);

    const connection = new WebSocket(url);
    ws = connection;

    let authTimer = null;
    let authenticated = false;

    function clearAuthTimer() {
      if (!authTimer) return;

      clearTimeout(authTimer);
      authTimer = null;
    }

    connection.on("open", () => {
      console.log("MAGI CONNECTION..... CONNECTED");

      send(connection, {
        type: "authenticate",
        deviceId,
        credential,
      });

      authTimer = setTimeout(() => {
        authTimer = null;

        if (
          stopped ||
          authenticated ||
          connection !== ws ||
          connection.readyState !== WebSocket.OPEN
        ) {
          return;
        }

        console.error("MAGI AUTH............ TIMEOUT");

        connection.terminate();
      }, AUTH_TIMEOUT_MS);
    });

    connection.on("message", async (data) => {
      let message;

      try {
        message = JSON.parse(data.toString());
      } catch {
        console.error("MAGI MESSAGE......... INVALID JSON");
        return;
      }

      if (message.type === "ready") {
        if (connection !== ws) {
          return;
        }

        authenticated = true;
        clearAuthTimer();
        reconnectAttempts = 0;

        console.log("PAIRING............. VERIFIED");
        console.log(`DEVICE.............. ${message.deviceId}`);

        const endpoints = [];

        if (ollama?.available) {
          endpoints.push({
            endpointId: "ollama-default",
            provider: "ollama",
            models: ollama.models,
          });
        }

        send(connection, {
          type: "capabilities",
          endpoints,
        });

        console.log("");
        console.log("NERV READY");
        return;
      }

      if (connection !== ws || !authenticated) {
        return;
      }

      if (message.type === "chat") {
        await handleChat(connection, message);
        return;
      }

      if (message.type === "cancel") {
        handleCancel(message);
        return;
      }

      console.log(`MAGI MESSAGE......... ${message.type ?? "UNKNOWN"}`);
    });

    connection.on("close", (code, reason) => {
      clearAuthTimer();

      const reasonText = reason.toString();

      console.log(
        `MAGI CONNECTION..... CLOSED (${code}${
          reasonText ? `: ${reasonText}` : ""
        })`,
      );

      // Ignore lifecycle events from an obsolete connection.
      if (connection !== ws) {
        return;
      }

      abortActiveRequests();

      if (code === 1008) {
        console.error("NERV AUTH............ FAILED");
        console.error("ACTION............... CHECK CREDENTIALS OR PAIR AGAIN");
        stopped = true;
        return;
      }

      if (!stopped) {
        scheduleReconnect();
      }
    });

    connection.on("error", (error) => {
      console.error(`MAGI CONNECTION..... ERROR: ${error.message}`);
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer || stopped) return;

    reconnectAttempts += 1;

    const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 30000);

    console.log(`MAGI RECONNECT....... ${delay / 1000}s`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function abortActiveRequests() {
    for (const controller of activeRequests.values()) {
      controller.abort();
    }

    activeRequests.clear();
  }

  function stop() {
    stopped = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    abortActiveRequests();

    if (
      ws?.readyState === WebSocket.OPEN ||
      ws?.readyState === WebSocket.CONNECTING
    ) {
      ws.close();
    }
  }

  connect();

  return {
    stop,
  };
}

async function handleChat(ws, message) {
  const { requestId, endpointId, model, context, request } = message;

  if (!requestId) return;

  if (endpointId !== "ollama-default") {
    sendError(
      ws,
      requestId,
      `Unsupported local endpoint: ${endpointId}`,
      "LOCAL_ENDPOINT_UNSUPPORTED",
    );

    return;
  }

  if (!model) {
    sendError(ws, requestId, "Local model is required", "LOCAL_MODEL_REQUIRED");

    return;
  }

  if (activeRequests.has(requestId)) {
    sendError(
      ws,
      requestId,
      "Duplicate local request ID",
      "LOCAL_DUPLICATE_REQUEST",
    );

    return;
  }

  const controller = new AbortController();

  activeRequests.set(requestId, controller);

  console.log("");
  console.log(`LOCAL REQUEST........ ${model}`);
  console.log(`MAGI SEAT............ ${context?.seat ?? "UNKNOWN"}`);
  console.log(`MAGI PHASE........... ${formatMagiPhase(context?.phase)}`);
  console.log("");
  console.log("NERV STREAM ────────────────────────────────────────────────");
  console.log("");

  try {
    const result = await chatWithOllama({
      model,
      instructions: request?.instructions ?? "",
      input: request?.input ?? "",
      signal: controller.signal,

      onChunk: (chunk) => {
        process.stdout.write(chunk);

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

    process.stdout.write("\n");
    console.log("");
    console.log("────────────────────────────────────────────────────────────");
    console.log("");
    console.log(`LOCAL COMPLETE....... ${model}`);
    console.log("");
  } catch (error) {
    if (controller.signal.aborted) {
      console.log(`LOCAL CANCELLED...... ${model} (${requestId})`);

      return;
    }

    console.error(`LOCAL ERROR.......... ${model}: ${error.message}`);

    sendError(
      ws,
      requestId,
      error.message || "Local inference failed",
      "LOCAL_INFERENCE_ERROR",
    );
  } finally {
    activeRequests.delete(requestId);
  }
}

function formatMagiPhase(phase) {
  if (!phase) return "UNKNOWN";

  return phase.replaceAll("_", " ");
}

function handleCancel(message) {
  const controller = activeRequests.get(message.requestId);

  if (!controller) return;

  controller.abort();
}

function sendError(ws, requestId, message, code) {
  send(ws, {
    type: "error",
    requestId,
    message,
    code,
  });
}

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify(message));
}
