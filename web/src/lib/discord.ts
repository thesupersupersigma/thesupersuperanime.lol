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

async function postToChannel(webhookUrl: string, payload: object): Promise<void> {
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

async function postToDiscord(payload: object): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    // error, not warn: this early-return silently disables the entire provider
    // health alerting path, and the variable is easy to miss when provisioning.
    console.error("[discord] DISCORD_WEBHOOK_URL not set — provider alerts are disabled");
    return;
  }
  await postToChannel(webhookUrl, payload);
}

/**
 * Fires when a new episode airs for an anime on someone's watchlist.
 * Posts once per newly-aired episode to the #new-episodes channel.
 */
export async function sendNewEpisodeChannelPost(
  animeTitle: string,
  episodeNum: number,
  animeId: number,
  coverUrl: string
): Promise<void> {
  const webhookUrl = process.env.DISCORD_NEW_EPISODES_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[discord] DISCORD_NEW_EPISODES_WEBHOOK_URL not set — skipping new episode post");
    return;
  }

  await postToChannel(webhookUrl, {
    embeds: [
      {
        color: 0x3b82f6, // blue
        title: `🎬 New Episode — ${animeTitle}`,
        description: `Episode ${episodeNum} is now available`,
        ...(coverUrl ? { thumbnail: { url: coverUrl } } : {}),
        url: `https://www.thesupersuperanime.lol/anime/${animeId}`,
        footer: { text: "thesupersuperanime.lol" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * Fires when a user earns a notable milestone badge. Posts to the #badges
 * channel.
 */
export async function sendBadgeAnnouncementPost(
  displayName: string,
  badgeName: string,
  badgeIcon: string,
  badgeDescription: string,
  profileUrl: string
): Promise<void> {
  const webhookUrl = process.env.DISCORD_BADGES_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[discord] DISCORD_BADGES_WEBHOOK_URL not set — skipping badge announcement");
    return;
  }

  await postToChannel(webhookUrl, {
    embeds: [
      {
        color: 0xa855f7, // purple
        title: `${badgeIcon} ${displayName} earned a badge!`,
        description: `**${badgeName}** — ${badgeDescription}`,
        url: profileUrl,
        footer: { text: "thesupersuperanime.lol" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/**
 * Fires when a new user signs up.
 * Sends a direct message to the owner via the Discord REST API.
 */
export async function sendNewSignupAlert(email: string): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const recipientId = process.env.DISCORD_ALERT_USER_ID;

  if (!botToken || !recipientId) {
    console.warn("[discord] DISCORD_BOT_TOKEN or DISCORD_ALERT_USER_ID not set — skipping signup DM");
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bot ${botToken}`,
  };

  try {
    // Step 1: open (or retrieve) the DM channel with the recipient
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers,
      body: JSON.stringify({ recipient_id: recipientId }),
    });

    if (!dmRes.ok) {
      console.error(`[discord] Failed to create DM channel: ${dmRes.status} ${await dmRes.text()}`);
      return;
    }

    const { id: channelId } = await dmRes.json();

    // Step 2: send the message into that DM channel
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: `📬 New signup: **${email}**` }),
    });

    if (!msgRes.ok) {
      console.error(`[discord] Failed to send signup DM: ${msgRes.status} ${await msgRes.text()}`);
    }
  } catch (err) {
    console.error("[discord] sendNewSignupAlert error:", err);
  }
}

/**
 * Fires when an admin publishes a new changelog entry. Posts to the #updates
 * channel.
 */
export async function sendChangelogPost(
  version: string,
  title: string,
  body: string,
  major: boolean,
  url: string
): Promise<void> {
  const webhookUrl = process.env.DISCORD_UPDATES_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[discord] DISCORD_UPDATES_WEBHOOK_URL not set — skipping changelog post");
    return;
  }

  const description = body.length > 300 ? `${body.slice(0, 300)}…` : body;

  await postToChannel(webhookUrl, {
    embeds: [
      {
        color: major ? 0x22c55e : 0x3b82f6, // green for major, blue for minor
        title: `🆕 ${version} — ${title}`,
        description,
        url,
        footer: { text: "thesupersuperanime.lol" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
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
