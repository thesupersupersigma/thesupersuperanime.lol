# syntax=docker/dockerfile:1
# Debian bookworm-slim (glibc). Nothing is compiled for the build machine's CPU, so the image runs on any baseline
# x86-64 CPU (no AVX needed) and on arm64. Configured entirely by env at runtime: one image for every self-hoster.

FROM node:26-bookworm-slim AS build
RUN npm install -g pnpm@11.13.0
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma prisma
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
# `prisma migrate deploy` at start needs the Prisma CLI, which the standalone output doesn't carry.
RUN mkdir -p /out/migrate \
 && cp -r prisma prisma.config.ts /out/migrate/ \
 && cd /out/migrate \
 && echo '{"private":true,"type":"module"}' > package.json \
 && npm install --omit=dev --no-audit --no-fund prisma@$(node -p "require('/src/package.json').devDependencies.prisma")

FROM node:26-bookworm-slim AS runtime
# openssl: Prisma's schema engine (migrations) links against it; the slim image doesn't ship it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /src/.next/standalone ./
COPY --from=build --chown=node:node /src/.next/static ./.next/static
COPY --from=build --chown=node:node /src/server/client-ip.mjs ./client-ip.mjs
COPY --from=build --chown=node:node /out/migrate ./migrate
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "-c", "cd migrate && node node_modules/prisma/build/index.js migrate deploy && cd .. && exec node --import ./client-ip.mjs server.js"]
