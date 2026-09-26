import WebSocket from "ws";
import { chatWithOllama } from "./endpoints/ollama.js";
import {
  formatDuration,
  logError,
  logEvent,
  logStreamFooter,
  logStreamHeader,
} from "./logger.js";

const activeRequests = new Map();
let consoleStreamOwner = null;
const AUTH_TIMEOUT_MS = 10_000;
const CAPABILITY_REFRESH_MS = 5_000;

export function connectToMagi({
  magiUrl,
  deviceId,
  credential,
  inspectOllama,
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

  if (typeof inspectOllama !== "function") {
    throw new Error("Ollama inspection function is required");
  }

  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let capabilityTimer = null;
  let lastCapabilitiesSignature = null;
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
      logEvent("MAGI CONNECTED", {
        primary: "SOCKET OPEN",
      });

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

        logError("MAGI AUTH TIMEOUT", {
          primary: `${AUTH_TIMEOUT_MS / 1000}s`,
        });

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

        logEvent("MAGI AUTHENTICATED", {
          primary: "YES",
          device: message.deviceId,
        });

        stopCapabilityWatcher();

        lastCapabilitiesSignature = null;

        await refreshCapabilities(connection);

        if (
          !stopped &&
          authenticated &&
          connection === ws &&
          connection.readyState === WebSocket.OPEN
        ) {
          startCapabilityWatcher(connection);
        }

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

      if (connection !== ws) {
        return;
      }

      stopCapabilityWatcher();
      lastCapabilitiesSignature = null;

      const activeRequestCount = activeRequests.size;

      logEvent("MAGI DISCONNECTED", {
        primary: code,
        reason: reasonText || "NONE",
        "active requests": activeRequestCount,
      });

      abortActiveRequests();

      if (code === 1008) {
        logError("NERV AUTH FAILED", {
          primary: "CREDENTIAL REJECTED",
          action: "CHECK CREDENTIALS OR PAIR AGAIN",
        });

        stopped = true;
        return;
      }

      if (!stopped) {
        scheduleReconnect();
      }
    });

    connection.on("error", (error) => {
      logError("MAGI CONNECTION ERROR", {
        primary: error.message,
      });
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer || stopped) return;

    reconnectAttempts += 1;

    const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 30000);

    logEvent("MAGI RECONNECT", {
      primary: `ATTEMPT ${reconnectAttempts}`,
      "next attempt": formatDuration(delay),
    });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  async function refreshCapabilities(connection) {
    if (
      stopped ||
      connection !== ws ||
      connection.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    const ollama = await inspectOllama();

    if (
      stopped ||
      connection !== ws ||
      connection.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    const endpoints = [];

    if (ollama.available) {
      endpoints.push({
        endpointId: "ollama-default",
        provider: "ollama",
        models: [...ollama.models].sort(),
      });
    }

    const signature = JSON.stringify(endpoints);

    if (signature === lastCapabilitiesSignature) {
      return;
    }

    let previousEndpoints = [];

    if (lastCapabilitiesSignature) {
      try {
        previousEndpoints = JSON.parse(lastCapabilitiesSignature);
      } catch {
        previousEndpoints = [];
      }
    }

    const previousModels = new Set(
      previousEndpoints.flatMap((endpoint) => endpoint.models ?? []),
    );

    const currentModels = new Set(ollama.available ? ollama.models : []);

    const addedModels = [...currentModels].filter(
      (model) => !previousModels.has(model),
    );

    const removedModels = [...previousModels].filter(
      (model) => !currentModels.has(model),
    );

    lastCapabilitiesSignature = signature;

    send(connection, {
      type: "capabilities",
      endpoints,
    });

    if (ollama.available) {
      logEvent("CAPABILITIES UPDATED", {
        primary: "OLLAMA",
        models: ollama.models.length,
        added: addedModels.length ? addedModels.join(", ") : "NONE",
        removed: removedModels.length ? removedModels.join(", ") : "NONE",
      });
    } else {
      logEvent("CAPABILITIES UPDATED", {
        primary: "OLLAMA UNAVAILABLE",
        models: 0,
        removed: removedModels.length ? removedModels.join(", ") : "NONE",
      });
    }
  }

  function startCapabilityWatcher(connection) {
    if (capabilityTimer || stopped) return;

    capabilityTimer = setInterval(() => {
      refreshCapabilities(connection).catch((error) => {
        console.error(`CAPABILITY REFRESH... ERROR: ${error.message}`);
      });
    }, CAPABILITY_REFRESH_MS);
  }

  function stopCapabilityWatcher() {
    if (!capabilityTimer) return;

    clearInterval(capabilityTimer);
    capabilityTimer = null;
  }

  function abortActiveRequests() {
    for (const controller of activeRequests.values()) {
      controller.abort();
    }

    activeRequests.clear();
    consoleStreamOwner = null;
  }

  function stop() {
    stopped = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    stopCapabilityWatcher();
    lastCapabilitiesSignature = null;

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
  const requestedAt = performance.now();
  let startedAt = null;

  activeRequests.set(requestId, controller);

  console.log("");

  logEvent("LOCAL REQUEST", {
    primary: model,
    "request id": requestId,
    endpoint: endpointId,
    "magi seat": context?.seat ?? "UNKNOWN",
    "magi phase": formatMagiPhase(context?.phase),
  });

  try {
    const result = await chatWithOllama({
      model,
      instructions: request?.instructions ?? "",
      input: request?.input ?? "",
      signal: controller.signal,

      onStarted: () => {
        if (startedAt !== null) {
          return;
        }

        startedAt = performance.now();

        logEvent("INFERENCE STARTED", {
          primary: model,
          startup: formatDuration(startedAt - requestedAt),
          "request id": requestId,
        });

        if (consoleStreamOwner === null) {
          consoleStreamOwner = requestId;
          logStreamHeader();
        }

        send(ws, {
          type: "started",
          requestId,
        });
      },

      onChunk: (chunk) => {
        if (consoleStreamOwner === requestId) {
          process.stdout.write(chunk);
        }

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

    const completedAt = performance.now();

    if (consoleStreamOwner === requestId) {
      logStreamFooter();
      consoleStreamOwner = null;
    }

    logEvent("LOCAL COMPLETE", {
      primary: model,
      "request id": requestId,
      duration: formatDuration(completedAt - requestedAt),
      startup:
        startedAt !== null
          ? formatDuration(startedAt - requestedAt)
          : "NOT REPORTED",
      generation:
        startedAt !== null ? formatDuration(completedAt - startedAt) : "N/A",
      "input tokens": result.usage?.inputTokens,
      "output tokens": result.usage?.outputTokens,
      "total tokens": result.usage?.totalTokens,
    });

    console.log("");
  } catch (error) {
    if (controller.signal.aborted) {
      const cancelledAt = performance.now();

      if (consoleStreamOwner === requestId) {
        logStreamFooter();
        consoleStreamOwner = null;
      }

      logEvent("LOCAL CANCELLED", {
        primary: model,
        "request id": requestId,
        duration: formatDuration(cancelledAt - requestedAt),
        startup:
          startedAt !== null
            ? formatDuration(startedAt - requestedAt)
            : "NOT STARTED",
        "magi seat": context?.seat ?? "UNKNOWN",
        "magi phase": formatMagiPhase(context?.phase),
      });

      return;
    }

    const failedAt = performance.now();

    if (consoleStreamOwner === requestId) {
      logStreamFooter();
      consoleStreamOwner = null;
    }

    logError("LOCAL ERROR", {
      primary: model,
      "request id": requestId,
      duration: formatDuration(failedAt - requestedAt),
      error: error.message,
    });

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
