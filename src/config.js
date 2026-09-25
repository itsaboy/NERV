import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const NERV_DIR = path.join(os.homedir(), ".nerv");
const CONFIG_PATH = path.join(NERV_DIR, "config.json");

export async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf8");
    const config = JSON.parse(data);

    return {
      deviceId: config.deviceId ?? null,
      credential: config.credential ?? null,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        deviceId: null,
        credential: null,
      };
    }

    throw error;
  }
}

export async function saveConfig({ deviceId, credential }) {
  if (!deviceId || !credential) {
    throw new Error("Cannot save incomplete NERV device configuration");
  }

  await fs.mkdir(NERV_DIR, {
    recursive: true,
    mode: 0o700,
  });

  await fs.writeFile(
    CONFIG_PATH,
    JSON.stringify(
      {
        deviceId,
        credential,
      },
      null,
      2,
    ),
    {
      mode: 0o600,
    },
  );
}
