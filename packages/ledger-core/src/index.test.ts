import { describe, expect, it } from 'vitest';
import {
  assertBalanced,
  buildChargebackPostings,
  buildRefundPostings,
  buildTransactionPostings
} from './index.js';

describe('ledger', () => {
  it('creates balanced transaction postings', () => {
    const postings = buildTransactionPostings(10.25);
    expect(() => assertBalanced(postings)).not.toThrow();
    expect(postings[0]?.amountCents).toBe(1025n);
  });

  it('creates balanced compensating postings', () => {
    expect(() => assertBalanced(buildRefundPostings(25))).not.toThrow();
    expect(() => assertBalanced(buildChargebackPostings(25))).not.toThrow();
  });

  it('rejects unbalanced postings', () => {
    expect(() =>
      assertBalanced([
        { accountCode: 'A', side: 'DEBIT', amountCents: 100n },
        { accountCode: 'B', side: 'CREDIT', amountCents: 99n }
      ])
    ).toThrow(/not balanced/);
  });
});
