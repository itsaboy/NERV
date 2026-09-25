import { loadConfig, saveConfig } from "./config.js";
import { pairWithMagi } from "./pairing.js";

import { connectToMagi } from "./magiConnection.js";
import { inspectOllama } from "./endpoints/ollama.js";

console.log("");
console.log("NERV // NODE ENDPOINT RELAY VERIFICATION");
console.log("");

const magiUrl = process.env.NERV_MAGI_URL;
let { deviceId, credential } = await loadConfig();

if (!deviceId || !credential) {
  const pairingCode = process.env.NERV_PAIRING_CODE;

  if (!pairingCode) {
    console.log("DEVICE.............. NOT PAIRED");
    console.log("");
    console.log(
      "Set NERV_PAIRING_CODE to a MAGI pairing code and restart NERV.",
    );

    process.exit(1);
  }

  console.log("PAIRING............. IN PROGRESS");

  const paired = await pairWithMagi({
    magiHttpUrl: process.env.NERV_MAGI_HTTP_URL,
    code: pairingCode,
    name: process.env.NERV_DEVICE_NAME ?? "NERV Node",
  });

  deviceId = paired.deviceId;
  credential = paired.credential;

  await saveConfig({
    deviceId,
    credential,
  });

  console.log("PAIRING............. VERIFIED");
  console.log(`DEVICE.............. ${deviceId}`);
  console.log("CREDENTIAL.......... STORED");
}

if (!magiUrl) {
  throw new Error("NERV_MAGI_URL is not configured");
}

if (!deviceId) {
  throw new Error("NERV_DEVICE_ID is not configured");
}

if (!credential) {
  throw new Error("NERV_DEVICE_CREDENTIAL is not configured");
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
