# End-to-end tests

Chromium (Playwright) against the full compose stack, with Mailpit catching the emails.

```sh
# on the machine with Docker, from the repo root (a .env with the four required values):
docker compose -f compose.yaml -f e2e/compose.e2e.yaml --profile mail up -d --build
# where the tests run (the site must be http://localhost:3000 for passkeys: browsers only allow WebAuthn on
# https or localhost — use an SSH tunnel if the stack runs elsewhere):
pnpm exec playwright install chromium
E2E_DATABASE_URL=postgres://anime:<POSTGRES_PASSWORD>@localhost:15432/site pnpm test:e2e
```

`E2E_BASE_URL` (default `http://localhost:3000`) and `E2E_MAILPIT_URL` (default `http://localhost:8025`) point the
tests elsewhere. Without `E2E_DATABASE_URL` the guest-merge test checks the browser side only.
