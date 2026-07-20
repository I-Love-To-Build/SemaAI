export type MonitorLevel = "info" | "warn" | "error";

export async function monitor(level: MonitorLevel, event: string, metadata: Record<string, unknown> = {}) {
  const payload = {
    level,
    event,
    metadata,
    timestamp: new Date().toISOString()
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }

  const webhookUrl = process.env.SEMA_ALERT_WEBHOOK_URL;
  if (webhookUrl && level !== "info") {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `[Sema AI] ${level.toUpperCase()}: ${event}`,
          ...payload
        })
      });
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "alert_webhook_failed",
        metadata: { message: error instanceof Error ? error.message : "Unknown webhook error" },
        timestamp: new Date().toISOString()
      }));
    }
  }
}
