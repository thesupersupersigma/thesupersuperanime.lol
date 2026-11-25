# syntax=docker/dockerfile:1
# Debian bookworm-slim (glibc). Nothing is compiled for the build machine's CPU, so the image runs on any baseline
# x86-64 CPU (no AVX needed) and on arm64. Configured entirely by env at runtime: one image for every self-hoster.

FROM node:26-bookworm-slim AS build
RUN npm install -g pnpm@11.13.0
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma prisma
COPY patches patches
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Plain Debian + only the official Node binary: no npm, corepack or headers at runtime. Migrations run through
# server/migrate.mjs (pg, already in the app), which keeps Prisma's _prisma_migrations table, so no Prisma CLI here.
FROM debian:bookworm-slim AS runtime
COPY --from=build /usr/local/bin/node /usr/local/bin/node
# libatomic1: the one library the official Node binary needs that Debian slim lacks
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home --shell /bin/sh node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /src/.next/standalone ./
COPY --from=build --chown=node:node /src/.next/static ./.next/static
COPY --from=build --chown=node:node /src/server/client-ip.mjs /src/server/migrate.mjs ./
COPY --from=build --chown=node:node /src/prisma/migrations ./prisma/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "-c", "node migrate.mjs prisma/migrations && exec node --import ./client-ip.mjs server.js"]
