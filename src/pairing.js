export async function pairWithMagi({ magiHttpUrl, code, name = "NERV Node" }) {
  if (!magiHttpUrl) {
    throw new Error("MAGI HTTP URL is required");
  }

  if (!code) {
    throw new Error("MAGI pairing code is required");
  }

  const url = new URL("/api/local/pair", magiHttpUrl);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      name,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? `MAGI pairing failed (${response.status})`);
  }

  if (!data.deviceId || !data.credential) {
    throw new Error("MAGI returned incomplete device credentials");
  }

  return {
    deviceId: data.deviceId,
    credential: data.credential,
  };
}
