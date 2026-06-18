# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/ ./packages/
COPY lib/ ./lib/
COPY services/trust-service/ ./services/trust-service/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/trust-service run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache wget

COPY --from=builder /workspace/services/trust-service/dist ./dist
COPY --from=builder /workspace/services/trust-service/package.json ./package.json
COPY --from=builder /workspace/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=8009

EXPOSE 8009

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8009/api/healthz || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
