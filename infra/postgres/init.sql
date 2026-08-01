DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerguard_app') THEN
    CREATE ROLE ledgerguard_app LOGIN PASSWORD 'ledgerguard-app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerguard_worker') THEN
    CREATE ROLE ledgerguard_worker LOGIN PASSWORD 'ledgerguard-worker';
  END IF;
END $$;

GRANT CONNECT ON DATABASE ledgerguard TO ledgerguard_app, ledgerguard_worker;
GRANT USAGE ON SCHEMA public TO ledgerguard_app, ledgerguard_worker;
