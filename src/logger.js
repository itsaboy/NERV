function timestamp() {
  return new Date().toISOString().slice(11, 23);
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return String(value);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "N/A";

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const milliseconds = Math.floor(ms % 1000);

  if (minutes === 0) {
    return `${seconds}.${String(milliseconds).padStart(3, "0")}s`;
  }

  return `${minutes}m ${seconds}.${String(milliseconds).padStart(3, "0")}s`;
}

function formatLabel(label) {
  return `${label.toUpperCase().padEnd(21, ".")} `;
}

export function logEvent(label, details = {}) {
  console.log(
    `[${timestamp()}] ${formatLabel(label)}${formatValue(details.primary)}`,
  );

  for (const [key, value] of Object.entries(details)) {
    if (key === "primary") continue;

    console.log(`               ${formatLabel(key)}${formatValue(value)}`);
  }
}

export function logError(label, details = {}) {
  console.error(
    `[${timestamp()}] ${formatLabel(label)}${formatValue(details.primary)}`,
  );

  for (const [key, value] of Object.entries(details)) {
    if (key === "primary") continue;

    console.error(`               ${formatLabel(key)}${formatValue(value)}`);
  }
}

export { formatDuration };
