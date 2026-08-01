# Correções de build

## 1.0.1

A API não compilava com `strict` porque o parâmetro recebido pelo handler global de erros era tratado como `unknown` pelo TypeScript.

A correção:

- remove acesso direto a `error.statusCode`, `error.code` e `error.validation`;
- normaliza valores desconhecidos por meio de type guards;
- valida a faixa do status HTTP antes de enviá-lo;
- preserva correlation ID e logging estruturado;
- não expõe mensagens internas em respostas HTTP 5xx.

### Validação local

```bash
cd ~/ledgerguard

docker compose build --no-cache api

docker compose up -d
```

## 1.0.2 — dashboard web

O build do Next.js falhava porque `recentTransactions` usava um `Record` genérico. Dessa forma, o TypeScript inferia que `amount_cents` também poderia ser `undefined`.

Correções:

- criação da interface `RecentTransaction`;
- tipagem explícita de resumo, série, risco, casos e conciliação;
- `formatMoney` tolerante a `null`, `undefined`, string vazia e valor inválido;
- preservação da moeda retornada pela transação;
- tratamento seguro do erro de carregamento;
- estado visual durante atualização do dashboard.

## 1.0.3 — ingestion worker

O `IngestionJob` reúne três payloads diferentes: transação, reembolso e chargeback. O TypeScript perdia o estreitamento de `job.data` quando a propriedade era acessada dentro do callback assíncrono de `withTenant`.

A correção introduz tipos e guards explícitos para cada payload, copia `job.data` para uma constante local e extrai `tenantId` e `transactionId` antes de entrar no callback. Também rejeita nomes de job não suportados em vez de tratá-los silenciosamente como transações.
