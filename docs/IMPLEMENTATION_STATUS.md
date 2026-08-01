# Matriz de implementação

| Área | Estado | Implementação |
|---|---|---|
| Autenticação | Operacional | Argon2id, JWT, refresh HttpOnly e logout |
| Multiempresa | Operacional | memberships, seleção de workspace e PostgreSQL RLS |
| Ingestão por API | Operacional | validação Zod e idempotência |
| Ingestão por webhook | Operacional | segredo rotativo e comparação constante |
| Ingestão CSV | Operacional | upload MinIO, parser e fila por linha |
| Ledger | Operacional | dupla entrada, compensação e imutabilidade |
| Antifraude | Operacional | regras versionadas, score e justificativas |
| Investigação | Operacional | casos, timeline, comentários e decisão |
| Conciliação | Operacional | lotes, match e divergência de valor |
| Reembolso | Operacional | limite financeiro e lançamento compensatório |
| Chargeback | Operacional | evidência, limite e lançamento compensatório |
| Fechamento | Operacional | bruto, reembolso, chargeback e líquido |
| Arquivos | Operacional | upload, checksum, download e exclusão |
| Auditoria | Operacional | registro multiempresa imutável |
| Observabilidade | Operacional | métricas, Grafana, Loki e healthchecks |
| CI/CD | Operacional em código | quality gate, build Compose e smoke test |
| CNAB específico | Extensão planejada | requer layout bancário selecionado |
| Integração bancária real | Extensão planejada | requer credenciais e sandbox do provedor |
