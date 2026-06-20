// Run with: node scripts/register-discord-commands.mjs
// Requires DISCORD_BOT_TOKEN and DISCORD_APP_ID env vars (read from .env.local via dotenv)
import { config } from "dotenv";
config({ path: ".env.local" });

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APP_ID;

const commands = [
  {
    name: "watchparty",
    description: "Create a watch party room for an anime episode",
    options: [
      { name: "anime_id", description: "AniList anime ID", type: 4, required: true },
      { name: "episode", description: "Episode number", type: 4, required: true },
    ],
  },
];

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
console.log(res.ok ? "Commands registered!" : await res.text());
