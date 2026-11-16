# ── Stage 1: install dependencies ───────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install only production + build dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Default: non-hosted.  Set HOSTED_DEMO=true in docker run / compose to enable.
ENV HOSTED_DEMO=false

# Non-root user for least privilege
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid  1001 nextjs

# Copy standalone server output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create data directory owned by the non-root user
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

VOLUME ["/app/data"]

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/config || exit 1

CMD ["node", "server.js"]
