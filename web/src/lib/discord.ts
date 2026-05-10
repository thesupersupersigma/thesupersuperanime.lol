// Discord webhook helpers for provider health alerts
// Requires DISCORD_WEBHOOK_URL env variable

export interface DiscordAlert {
  providerId: string;
  displayName: string;
  consecutiveFails: number;
  errorMessage: string;
  lastSuccessAt: Date | null;
}

/** Format a relative time string ("2h ago", "never") */
function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

async function postToDiscord(payload: object): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[discord] DISCORD_WEBHOOK_URL not set — skipping alert");
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(
        `[discord] Webhook failed: ${res.status} ${await res.text()}`
      );
    }
  } catch (err) {
    console.error("[discord] Webhook fetch error:", err);
  }
}

/**
 * Fires when a provider hits 3+ consecutive failures.
 */
export async function sendProviderAlert(alert: DiscordAlert): Promise<void> {
  const lastSuccess = relativeTime(alert.lastSuccessAt);

  await postToDiscord({
    embeds: [
      {
        color: 0xef4444, // red
        title: `🚨 Provider BROKEN: ${alert.displayName}`,
        fields: [
          {
            name: "Consecutive failures",
            value: String(alert.consecutiveFails),
            inline: true,
          },
          {
            name: "Last success",
            value: lastSuccess,
            inline: true,
          },
          {
            name: "Last error",
            value: `\`${alert.errorMessage}\``,
            inline: false,
          },
        ],
        footer: {
          text: "→ Submit a fix: DM @admin or drop a patch in #dev-fixes",
        },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * Fires when a previously broken provider successfully resolves again.
 */
export async function sendProviderRecovery(
  providerId: string,
  displayName: string,
  latencyMs: number,
  downSinceMs: number | null
): Promise<void> {
  const downtimeStr =
    downSinceMs != null
      ? `~${Math.round(downSinceMs / 60_000)} minutes`
      : "unknown";

  await postToDiscord({
    embeds: [
      {
        color: 0x22c55e, // green
        title: `✅ Provider RECOVERED: ${displayName}`,
        fields: [
          {
            name: "Latency",
            value: `${latencyMs}ms`,
            inline: true,
          },
          {
            name: "Downtime",
            value: downtimeStr,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
