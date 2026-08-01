CREATE OR REPLACE FUNCTION reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_immutable ON ledger_entries;
CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE OR REPLACE VIEW ledger_transaction_balances
WITH (security_invoker = true)
AS
SELECT
  tenant_id,
  transaction_id,
  coalesce(sum(amount_cents) FILTER (WHERE side = 'DEBIT'), 0)::bigint AS debit_cents,
  coalesce(sum(amount_cents) FILTER (WHERE side = 'CREDIT'), 0)::bigint AS credit_cents,
  (
    coalesce(sum(amount_cents) FILTER (WHERE side = 'DEBIT'), 0)
    =
    coalesce(sum(amount_cents) FILTER (WHERE side = 'CREDIT'), 0)
  ) AS balanced
FROM ledger_entries
GROUP BY tenant_id, transaction_id;
