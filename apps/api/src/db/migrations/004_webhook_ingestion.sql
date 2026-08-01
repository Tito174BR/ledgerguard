ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS webhook_secret_hash text;

CREATE INDEX IF NOT EXISTS tenants_slug_active_idx
  ON tenants(slug)
  WHERE status = 'ACTIVE';
