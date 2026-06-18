# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/ ./packages/
COPY lib/ ./lib/
COPY services/evidence-service/ ./services/evidence-service/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/evidence-service run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache wget

COPY --from=builder /workspace/services/evidence-service/dist ./dist
COPY --from=builder /workspace/services/evidence-service/package.json ./package.json
COPY --from=builder /workspace/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=8006

EXPOSE 8006

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8006/api/healthz || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
