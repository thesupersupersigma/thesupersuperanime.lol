# syntax=docker/dockerfile:1

# ── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY web/package.json web/package-lock.json ./
RUN npm ci

# ── Stage 2: Build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY web/ .

# NEXT_PUBLIC_ vars get inlined into the client bundle at build time.
# Pass them in via Coolify's "Is build variable" checkbox.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ADS_ENABLED
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_ADS_ENABLED=$NEXT_PUBLIC_ADS_ENABLED

RUN npx prisma generate
RUN npm run build

# ── Stage 3: Run ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
