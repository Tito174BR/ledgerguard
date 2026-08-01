# Ingestão

## API autenticada

`POST /api/v1/transactions`

A chave `idempotencyKey` é obrigatória e única por workspace.

## Webhook público

Gere a chave em **Administração → Gerar chave de webhook**. A chave é exibida uma única vez.

```bash
curl -X POST http://localhost:8080/api/v1/transactions/webhook/SEU_WORKSPACE \
  -H 'Content-Type: application/json' \
  -H 'x-ledgerguard-key: SEU_SEGREDO' \
  -d '{
    "externalId": "TX-1001",
    "idempotencyKey": "external-TX-1001",
    "occurredAt": "2026-08-01T12:00:00.000Z",
    "amount": 53.90,
    "currency": "BRL",
    "paymentMethod": "CARD",
    "cardToken": "token-do-provedor",
    "cardLast4": "1740",
    "cardTsn": 123,
    "terminalId": "BUS-313"
  }'
```

O segredo é armazenado somente como hash SHA-256.

## CSV

Envie o CSV em **Arquivos** e selecione **Importar transações**.

Colunas aceitas:

```csv
externalId;idempotencyKey;occurredAt;amount;currency;paymentMethod;cardToken;cardLast4;cardTsn;terminalId;lineId
TX-1;source-TX-1;2026-08-01T12:00:00.000Z;5.30;BRL;CARD;token-1;1740;10;BUS-313;324
```

Também são reconhecidos aliases em snake_case. O importador limita cada execução a 5.000 linhas e retorna as linhas rejeitadas.
