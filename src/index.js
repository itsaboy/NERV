import "./env.js";

import { loadConfig } from "./config.js";
import { getMagiUrls } from "./magiUrls.js";
import { connectToMagi } from "./magiConnection.js";
import { inspectOllama } from "./endpoints/ollama.js";
import { logEvent } from "./logger.js";

console.log("");
console.log("NERV // NODE ENDPOINT RELAY VERIFICATION");
console.log("");

const { wsUrl: magiUrl } = getMagiUrls();
const { deviceId, credential } = await loadConfig();

if (!deviceId || !credential) {
  console.log("DEVICE.............. NOT PAIRED");
  console.log("");
  console.log("Pair this NERV device with MAGI before starting.");
  console.log("");
  console.log("Usage: npm run pair -- <PAIRING_CODE>");
  console.log("");

  process.exit(1);
}

const ollama = await inspectOllama();

if (ollama.available) {
  logEvent("OLLAMA ONLINE", {
    primary: "ollama-default",
    models: ollama.models.length,
  });

  for (const model of ollama.models) {
    console.log(`               └─ ${model}`);
  }
} else {
  logEvent("OLLAMA OFFLINE", {
    primary: "ollama-default",
    models: 0,
    error: ollama.error,
  });
}

console.log("");

connectToMagi({
  magiUrl,
  deviceId,
  credential,
  inspectOllama,
});
