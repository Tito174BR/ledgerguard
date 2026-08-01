.PHONY: up down logs build rebuild ps migrate seed smoke check doctor
up:
	docker compose up -d --build
down:
	docker compose down
logs:
	docker compose logs -f api ingestion-worker fraud-worker reconciliation-worker settlement-worker web nginx
build:
	docker compose build
rebuild:
	docker compose build --no-cache api ingestion-worker fraud-worker reconciliation-worker settlement-worker web
ps:
	docker compose ps
migrate:
	docker compose exec api pnpm --filter @ledgerguard/api db:migrate
seed:
	docker compose exec api pnpm --filter @ledgerguard/api db:seed
smoke:
	node scripts/smoke-test.mjs
check:
	corepack pnpm check
doctor:
	docker version && docker compose version && node --version
