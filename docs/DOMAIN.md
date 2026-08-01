# Domínio financeiro

## Transação

Estados principais:

`RECEIVED → PROCESSING → POSTED → FLAGGED/RECONCILED`

Estados complementares: `FAILED`, `REFUNDED` e `CHARGEBACK`.

## Ledger

Cada transação cria dois lançamentos de mesmo valor:

- débito em `PAYMENTS_RECEIVABLE`;
- crédito em `TRANSACTION_REVENUE`.

Reembolsos debitam `REFUND_EXPENSE` e creditam `PAYMENTS_RECEIVABLE`.

## Antifraude

As regras são versionadas. Cada avaliação persiste:

- versão utilizada;
- condição acionada;
- justificativa;
- score;
- severidade.

O score consolidado é limitado a 100 e classificado como LOW, MEDIUM, HIGH ou CRITICAL.

## Conciliação

Cada item de origem pode resultar em:

- `MATCHED`;
- `MISSING_INTERNAL`;
- `AMOUNT_DIVERGENCE`.

## Fechamento

O líquido diário é:

`bruto - reembolsos - chargebacks`.
