# Changelog

## 1.0.0 — 2026-08-01

- Plataforma SaaS multiempresa com RLS.
- Autenticação segura e administração de workspaces.
- Ingestão por API, webhook e CSV.
- Ledger de dupla entrada imutável.
- Reembolso e chargeback com lançamentos compensatórios.
- Motor antifraude explicável e regras versionadas.
- Casos investigativos com timeline.
- Conciliação e fechamento financeiro diário.
- MinIO com checksum SHA-256.
- Outbox com dispatcher Redis.
- Frontend operacional e responsivo.
- Prometheus, Grafana, Loki, Docker, Codespaces e CI/CD.

## 1.0.1

- Corrige o build TypeScript da API no handler global de erros.
- Adiciona normalização segura para erros tipados como `unknown`.
- Mantém status, código, validação e correlation ID sem casts inseguros.

## 1.0.2

- Corrige a tipagem das transações recentes no dashboard.
- Substitui o `Record<string, string | number>` por interfaces explícitas.
- Torna `formatMoney` seguro para valores nulos, ausentes e inválidos.
- Adiciona estado de atualização ao botão da Visão geral.
- Mantém a moeda da própria transação ao formatar valores recentes.

## 1.0.3 - 2026-08-01

### Corrigido

- Discriminação explícita dos jobs de transação, reembolso e chargeback no ingestion worker.
- Preservação do narrowing TypeScript dentro do callback assíncrono de persistência de falhas.
- Validação de payload por tipo de job antes da execução.
- Atualização segura do status `FAILED` apenas para jobs de transação.
