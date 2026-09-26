import "./env.js";

import { loadConfig } from "./config.js";
import { getMagiUrls } from "./magiUrls.js";
import { connectToMagi } from "./magiConnection.js";
import { localEndpoints } from "./endpoints/index.js";
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

for (const endpoint of localEndpoints) {
  const inspection = await endpoint.inspect();

  const providerLabel = endpoint.provider.toUpperCase();

  if (inspection.available) {
    logEvent(`${providerLabel} ONLINE`, {
      primary: endpoint.endpointId,
      models: inspection.models.length,
    });

    for (const model of inspection.models) {
      console.log(`               └─ ${model}`);
    }
  } else {
    logEvent(`${providerLabel} OFFLINE`, {
      primary: endpoint.endpointId,
      models: 0,
      error: inspection.error,
    });
  }

  console.log("");
}

connectToMagi({
  magiUrl,
  deviceId,
  credential,
});
