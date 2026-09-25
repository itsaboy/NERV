import { connectToMagi } from "./magiConnection.js";
import { inspectOllama } from "./endpoints/ollama.js";

console.log("");
console.log("NERV // NODE ENDPOINT RELAY VERIFICATION");
console.log("");

const magiUrl = process.env.NERV_MAGI_URL;
const deviceId = process.env.NERV_DEVICE_ID;
const credential = process.env.NERV_DEVICE_CREDENTIAL;

if (!magiUrl) {
  throw new Error("NERV_MAGI_URL is not configured");
}

if (!deviceId) {
  throw new Error("NERV_DEVICE_ID is not configured");
}

if (!credential) {
  throw new Error(
    "NERV_DEVICE_CREDENTIAL is not configured",
  );
}

const ollama = await inspectOllama();

if (ollama.available) {
  console.log("OLLAMA.............. DETECTED");
  console.log(
    `LOCAL MODELS........ ${ollama.models.length}`,
  );

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
});