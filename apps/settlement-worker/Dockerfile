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
COPY apps/settlement-worker/package.json apps/settlement-worker/package.json
RUN pnpm install --filter @ledgerguard/settlement-worker... --no-frozen-lockfile
COPY packages packages
COPY apps/settlement-worker apps/settlement-worker
RUN pnpm --filter @ledgerguard/contracts build \
 && pnpm --filter @ledgerguard/ledger-core build \
 && pnpm --filter @ledgerguard/fraud-engine build \
 && pnpm --filter @ledgerguard/observability build \
 && pnpm --filter @ledgerguard/settlement-worker build
EXPOSE 3337
CMD ["pnpm","--filter","@ledgerguard/settlement-worker","start"]
