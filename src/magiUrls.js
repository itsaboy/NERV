export function getMagiUrls() {
  const configuredUrl = process.env.NERV_MAGI_URL;

  if (!configuredUrl) {
    throw new Error("NERV_MAGI_URL is not configured");
  }

  const origin = new URL(configuredUrl);

  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("NERV_MAGI_URL must use http:// or https://");
  }

  origin.pathname = "/";
  origin.search = "";
  origin.hash = "";

  const httpUrl = origin.origin;

  const wsUrl = new URL("/api/local/connect", origin);
  wsUrl.protocol = origin.protocol === "https:" ? "wss:" : "ws:";

  return {
    httpUrl,
    wsUrl: wsUrl.toString(),
  };
}
