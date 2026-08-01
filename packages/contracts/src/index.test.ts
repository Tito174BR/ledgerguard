import { describe, expect, it } from 'vitest';
import { createTransactionSchema } from './index.js';

describe('transaction contract', () => {
  it('accepts a valid transaction', () => {
    const parsed = createTransactionSchema.parse({
      externalId: 'tx-1',
      idempotencyKey: 'idem-0001',
      occurredAt: new Date().toISOString(),
      amount: 10,
      currency: 'BRL',
      paymentMethod: 'PIX',
      metadata: {}
    });
    expect(parsed.amount).toBe(10);
  });
});
