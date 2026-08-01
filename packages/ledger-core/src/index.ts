export type LedgerSide = 'DEBIT' | 'CREDIT';

export interface LedgerPosting {
  accountCode: string;
  side: LedgerSide;
  amountCents: bigint;
  memo?: string;
}

export function amountToCents(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive finite number');
  }
  return BigInt(Math.round(amount * 100));
}

export function buildTransactionPostings(amount: number): LedgerPosting[] {
  const amountCents = amountToCents(amount);
  return [
    {
      accountCode: 'PAYMENTS_RECEIVABLE',
      side: 'DEBIT',
      amountCents,
      memo: 'Recebível originado pela transação'
    },
    {
      accountCode: 'TRANSACTION_REVENUE',
      side: 'CREDIT',
      amountCents,
      memo: 'Receita reconhecida pela transação'
    }
  ];
}

export function buildRefundPostings(amount: number): LedgerPosting[] {
  const amountCents = amountToCents(amount);
  return [
    {
      accountCode: 'REFUND_EXPENSE',
      side: 'DEBIT',
      amountCents,
      memo: 'Despesa de reembolso'
    },
    {
      accountCode: 'PAYMENTS_RECEIVABLE',
      side: 'CREDIT',
      amountCents,
      memo: 'Baixa do recebível reembolsado'
    }
  ];
}


export function buildChargebackPostings(amount: number): LedgerPosting[] {
  const amountCents = amountToCents(amount);
  return [
    {
      accountCode: 'CHARGEBACK_EXPENSE',
      side: 'DEBIT',
      amountCents,
      memo: 'Despesa reconhecida pelo chargeback'
    },
    {
      accountCode: 'PAYMENTS_RECEIVABLE',
      side: 'CREDIT',
      amountCents,
      memo: 'Baixa do recebível contestado'
    }
  ];
}

export function assertBalanced(postings: LedgerPosting[]): void {
  const debit = postings
    .filter((posting) => posting.side === 'DEBIT')
    .reduce((sum, posting) => sum + posting.amountCents, 0n);
  const credit = postings
    .filter((posting) => posting.side === 'CREDIT')
    .reduce((sum, posting) => sum + posting.amountCents, 0n);

  if (debit !== credit) {
    throw new Error(`Ledger is not balanced: debit=${debit} credit=${credit}`);
  }
}
