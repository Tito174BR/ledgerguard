FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ledger-core/package.json packages/ledger-core/package.json
COPY packages/fraud-engine/package.json packages/fraud-engine/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY apps/reconciliation-worker/package.json apps/reconciliation-worker/package.json
RUN pnpm install --filter @ledgerguard/reconciliation-worker... --no-frozen-lockfile
COPY packages packages
COPY apps/reconciliation-worker apps/reconciliation-worker
RUN pnpm --filter @ledgerguard/contracts build \
 && pnpm --filter @ledgerguard/ledger-core build \
 && pnpm --filter @ledgerguard/fraud-engine build \
 && pnpm --filter @ledgerguard/observability build \
 && pnpm --filter @ledgerguard/reconciliation-worker build
EXPOSE 3336
CMD ["pnpm","--filter","@ledgerguard/reconciliation-worker","start"]
