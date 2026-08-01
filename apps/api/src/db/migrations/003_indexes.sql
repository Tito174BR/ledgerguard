CREATE INDEX IF NOT EXISTS fraud_cases_status_idx
  ON fraud_cases(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_eval_tx_idx
  ON fraud_evaluations(tenant_id, transaction_id);
CREATE INDEX IF NOT EXISTS recon_batch_idx
  ON reconciliation_batches(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_tx_idx
  ON ledger_entries(tenant_id, transaction_id);
CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON outbox(status, available_at);
