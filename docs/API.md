# API

Swagger: `http://localhost:3333/docs`

Prefixo: `/api/v1`.

Principais recursos:

- `/auth`: login, refresh, logout e usuário atual.
- `/workspaces`: criação, seleção e edição.
- `/transactions`: ingestão, webhook público, consulta, reembolso e chargeback.
- `/fraud/rules`: regras versionadas.
- `/fraud/evaluations`: resultados explicáveis.
- `/cases`: investigação e timeline.
- `/reconciliation/batches`: lotes e itens.
- `/settlements`: cálculo e fechamento.
- `/files`: upload, download e exclusão.
- `/members`: equipe e papéis.
- `/audit`: eventos administrativos.

As rotas protegidas usam `Authorization: Bearer <access-token>`. O refresh token permanece em cookie HttpOnly.

Consulte também [Ingestão](INGESTION.md).
