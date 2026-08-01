# Relatório de validação

Data da geração: 2026-08-01.

## Executado com sucesso

- 65 arquivos TypeScript/TSX transpilados para validação sintática.
- 95 imports relativos resolvidos.
- 25 arquivos JSON analisados.
- 8 arquivos YAML analisados.
- links relativos dos Markdown verificados.
- 5 migrations incrementais revisadas estruturalmente.
- 21 tabelas de domínio identificadas.
- 130 arquivos no repositório.
- integridade do pacote ZIP verificada.

## Fluxos cobertos pelo smoke test

- healthcheck;
- login e seleção do workspace;
- rotação da chave e ingestão por webhook;
- ingestão autenticada;
- processamento assíncrono;
- ledger de dupla entrada balanceado;
- lote de conciliação;
- fechamento diário;
- upload, checksum e exclusão no MinIO;
- dashboard.

## Não executado neste ambiente

O ambiente de geração não possui Docker. A tentativa de baixar o pnpm pelo registro npm falhou por indisponibilidade de rede. Portanto, os seguintes itens precisam ser executados no Mac ou na CI:

```bash
docker compose up -d --build
node scripts/smoke-test.mjs
```

A workflow de CI incluída executa instalação, typecheck, testes, build, Compose e smoke test.
