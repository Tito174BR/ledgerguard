FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ledger-core/package.json packages/ledger-core/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @ledgerguard/api... --no-frozen-lockfile
COPY packages/contracts packages/contracts
COPY packages/ledger-core packages/ledger-core
COPY apps/api apps/api
RUN pnpm --filter @ledgerguard/contracts build \
 && pnpm --filter @ledgerguard/ledger-core build \
 && pnpm --filter @ledgerguard/api build
EXPOSE 3333
CMD ["sh","-c","pnpm --filter @ledgerguard/api db:migrate && if [ \"${SEED_INITIAL_DATA:-false}\" = \"true\" ]; then pnpm --filter @ledgerguard/api db:seed; fi && pnpm --filter @ledgerguard/api start"]
