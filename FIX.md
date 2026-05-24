## Discord Gate Not Enforcing on Re-login

**Problem:** After a user deauthorizes their Discord connection (from Discord's side or via DB),
signing back in does not redirect them to /account/link-discord. The discord-linked cookie
check in middleware and the nav useEffect redirect both fail to enforce the gate reliably.

**Root cause:** The discord-linked cookie persists from previous sessions, and the nav
useEffect redirect runs client-side after the page loads — too late for server-gated pages.

**Proper fix:** Move the Discord verification into a server-side session check inside
getCurrentUser() or as a middleware DB lookup (requires moving middleware off the edge
runtime to Node.js runtime so it can query Prisma directly).

DO THIS:
a top 10 for like every genre
add the abar thats at the top of the landingpage/homepage to every other page instead of that little back to home button.
add a verification to verify that the user has actually watched the anime for the leaderboard.
check out that git heath check thing
make better search ui