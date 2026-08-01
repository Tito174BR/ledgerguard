CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ledger_accounts',
    'transactions',
    'ledger_entries',
    'fraud_rules',
    'fraud_rule_versions',
    'fraud_evaluations',
    'fraud_cases',
    'case_events',
    'reconciliation_batches',
    'reconciliation_items',
    'refunds',
    'chargebacks',
    'settlements',
    'files',
    'audit_log',
    'outbox',
    'inbox'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
       USING (tenant_id = app_current_tenant_id())
       WITH CHECK (tenant_id = app_current_tenant_id())',
      table_name
    );
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO ledgerguard_app, ledgerguard_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO ledgerguard_app, ledgerguard_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO ledgerguard_app, ledgerguard_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO ledgerguard_app, ledgerguard_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO ledgerguard_app, ledgerguard_worker;
