# Arquitetura

## Visão geral

O LedgerGuard é um monorepo orientado a eventos. A API recebe comandos e persiste o estado inicial; os workers executam etapas financeiras de forma assíncrona.

```text
Next.js / Nginx
       |
    Fastify API
       |
 PostgreSQL + RLS ---- MinIO
       |
     BullMQ / Redis
       |
  +----+------+----------------+
  |           |                |
Ingestion   Fraud      Reconciliation    Settlement
  |           |                |              |
Ledger     Cases/score      Matches        Daily close
```

## Serviços

- `api`: autenticação, administração, ingestão e consultas.
- `ingestion-worker`: gera lançamentos de dupla entrada e inicia antifraude.
- `fraud-worker`: calcula score explicável e abre casos.
- `reconciliation-worker`: compara a fonte externa com transações internas.
- `settlement-worker`: consolida a competência financeira.
- `web`: aplicação Next.js.
- `nginx`: gateway same-origin.
- PostgreSQL, Redis, MinIO, Prometheus, Grafana, Loki e Promtail.

## Garantias

- Idempotência por `tenant_id + idempotency_key`.
- Ledger balanceado por domínio antes da persistência.
- RLS obrigatório nas tabelas multiempresa.
- Jobs com retry exponencial.
- Trilha de auditoria e correlation ID.
- Dados de cartão armazenados apenas como hash e últimos quatro dígitos.
