import "dotenv/config";
import { env } from "../lib/env";

const INTERVAL_MS = 60_000;

async function triggerSentinel(): Promise<void> {
  try {
    const resp = await fetch(`${env.GRADIENT_AGENT_URL_SENTINEL}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GRADIENT_AGENT_KEY_SENTINEL}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "run sentinel check" }],
      }),
    });
    const data = await resp.json();
    console.log(
      `[sentinel-cron] ${new Date().toISOString()} →`,
      data.status ?? "unknown"
    );
  } catch (err) {
    console.error("[sentinel-cron] Error calling DORASentinel:", err);
  }
}

console.log(
  `[sentinel-cron] Starting — polling every ${INTERVAL_MS / 1000}s`
);
triggerSentinel();
setInterval(triggerSentinel, INTERVAL_MS);
