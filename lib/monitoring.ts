export type MonitorLevel = "info" | "warn" | "error";

export function monitor(level: MonitorLevel, event: string, metadata: Record<string, unknown> = {}) {
  const payload = {
    level,
    event,
    metadata,
    timestamp: new Date().toISOString()
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}
