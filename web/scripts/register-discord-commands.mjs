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
      {
        name: "anime",
        description: "Anime name to search for",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "watchparty-join",
    description: "Join a watch party by room code or link",
    options: [
      {
        name: "code",
        description: "Room code (e.g. AB12CD) or full watch party link",
        type: 3, // STRING
        required: true,
      },
    ],
  },
];

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
console.log(res.ok ? "Commands registered!" : await res.text());
