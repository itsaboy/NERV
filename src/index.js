import { loadConfig } from "./config.js";
import { getMagiUrls } from "./magiUrls.js";
import { connectToMagi } from "./magiConnection.js";
import { inspectOllama } from "./endpoints/ollama.js";

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
  console.log("OLLAMA.............. DETECTED");
  console.log(`LOCAL MODELS........ ${ollama.models.length}`);

  for (const model of ollama.models) {
    console.log(`  └─ ${model}`);
  }
} else {
  console.log("OLLAMA.............. NOT DETECTED");
  console.log("LOCAL MODELS........ 0");
}

console.log("");

connectToMagi({
  magiUrl,
  deviceId,
  credential,
  ollama,
});
