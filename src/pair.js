import "./env.js";

import { pairWithMagi } from "./pairing.js";
import { saveConfig } from "./config.js";
import { getMagiUrls } from "./magiUrls.js";

const code = process.argv[2];

if (!code) {
  console.error("");
  console.error("PAIRING............. CODE REQUIRED");
  console.error("");
  console.error("Usage: npm run pair -- <PAIRING_CODE>");
  console.error("");
  process.exit(1);
}

const { httpUrl: magiHttpUrl } = getMagiUrls();

console.log("");
console.log("NERV // NODE ENDPOINT RELAY VERIFICATION");
console.log("");
console.log("PAIRING............. IN PROGRESS");

try {
  const paired = await pairWithMagi({
    magiHttpUrl,
    code,
    name: process.env.NERV_DEVICE_NAME ?? "NERV Node",
  });

  await saveConfig({
    deviceId: paired.deviceId,
    credential: paired.credential,
  });

  console.log("PAIRING............. VERIFIED");
  console.log(`DEVICE.............. ${paired.deviceId}`);
  console.log("CREDENTIAL.......... STORED");
  console.log("");
  console.log("Run `npm start` to start NERV.");
  console.log("");
} catch (error) {
  console.error(`PAIRING............. FAILED: ${error.message}`);
  process.exit(1);
}
