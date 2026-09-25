import WebSocket from "ws";

export function connectToMagi({ magiUrl, deviceId, credential }) {
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

  ws.on("message", (data) => {
    let message;

    try {
      message = JSON.parse(data.toString());
    } catch {
      console.error("MAGI MESSAGE......... INVALID JSON");
      return;
    }

    switch (message.type) {
      case "ready":
        console.log("PAIRING............. VERIFIED");
        console.log(`DEVICE.............. ${message.deviceId}`);
        console.log("");
        console.log("NERV READY");
        break;

      default:
        console.log(`MAGI MESSAGE......... ${message.type ?? "UNKNOWN"}`);
    }
  });

  ws.on("close", (code, reason) => {
    const reasonText = reason.toString();

    console.log(
      `MAGI CONNECTION..... CLOSED (${code}${
        reasonText ? `: ${reasonText}` : ""
      })`,
    );
  });

  ws.on("error", (error) => {
    console.error(`MAGI CONNECTION..... ERROR: ${error.message}`);
  });

  return ws;
}
