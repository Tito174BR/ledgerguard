CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  email citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  slug varchar(80) UNIQUE NOT NULL,
  timezone varchar(80) NOT NULL DEFAULT 'America/Sao_Paulo',
  currency char(3) NOT NULL DEFAULT 'BRL',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role varchar(20) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  refresh_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code varchar(80) NOT NULL,
  name varchar(160) NOT NULL,
  account_type varchar(30) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  external_id varchar(150) NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  status varchar(30) NOT NULL,
  occurred_at timestamptz NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents > 0),
  currency char(3) NOT NULL,
  payment_method varchar(30) NOT NULL,
  card_token_hash text,
  card_last4 char(4),
  card_tsn bigint,
  terminal_id varchar(100),
  line_id varchar(100),
  latitude numeric(9,6),
  longitude numeric(9,6),
  risk_score integer NOT NULL DEFAULT 0,
  risk_level varchar(20) NOT NULL DEFAULT 'LOW',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, idempotency_key)
);

CREATE INDEX transactions_tenant_created_idx
  ON transactions(tenant_id, created_at DESC);
CREATE INDEX transactions_card_idx
  ON transactions(tenant_id, card_token_hash, occurred_at);
CREATE INDEX transactions_external_idx
  ON transactions(tenant_id, external_id);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid REFERENCES transactions(id),
  account_id uuid NOT NULL REFERENCES ledger_accounts(id),
  side varchar(10) NOT NULL CHECK(side IN ('DEBIT','CREDIT')),
  amount_cents bigint NOT NULL CHECK(amount_cents > 0),
  memo text,
  reference_type varchar(40) NOT NULL DEFAULT 'TRANSACTION',
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fraud_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name varchar(120) NOT NULL,
  description text NOT NULL DEFAULT '',
  kind varchar(30) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  active_version_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE fraud_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  rule_id uuid NOT NULL REFERENCES fraud_rules(id) ON DELETE CASCADE,
  version integer NOT NULL,
  config jsonb NOT NULL,
  score integer NOT NULL,
  severity varchar(20) NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_id, version)
);

ALTER TABLE fraud_rules
  ADD CONSTRAINT fraud_rules_active_version_fk
  FOREIGN KEY(active_version_id) REFERENCES fraud_rule_versions(id);

CREATE TABLE fraud_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL REFERENCES transactions(id),
  rule_id uuid NOT NULL REFERENCES fraud_rules(id),
  rule_version_id uuid NOT NULL REFERENCES fraud_rule_versions(id),
  matched boolean NOT NULL,
  score integer NOT NULL,
  reason text NOT NULL,
  risk_level varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fraud_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL REFERENCES transactions(id),
  status varchar(30) NOT NULL DEFAULT 'OPEN',
  priority varchar(20) NOT NULL,
  risk_score integer NOT NULL,
  risk_level varchar(20) NOT NULL,
  summary text NOT NULL,
  assigned_to uuid REFERENCES users(id),
  resolution text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, transaction_id)
);

CREATE TABLE case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  case_id uuid NOT NULL REFERENCES fraud_cases(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  event_type varchar(40) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name varchar(160) NOT NULL,
  source varchar(80) NOT NULL,
  status varchar(30) NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  total_source_cents bigint NOT NULL DEFAULT 0,
  total_internal_cents bigint NOT NULL DEFAULT 0,
  difference_cents bigint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  batch_id uuid NOT NULL REFERENCES reconciliation_batches(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id),
  external_id varchar(150) NOT NULL,
  source_amount_cents bigint NOT NULL,
  internal_amount_cents bigint,
  difference_cents bigint NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL,
  source_occurred_at timestamptz,
  source_metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL REFERENCES transactions(id),
  amount_cents bigint NOT NULL,
  status varchar(30) NOT NULL,
  reason text,
  requested_by uuid REFERENCES users(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chargebacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL REFERENCES transactions(id),
  amount_cents bigint NOT NULL,
  status varchar(30) NOT NULL,
  reason_code varchar(50),
  evidence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  settlement_date date NOT NULL,
  status varchar(30) NOT NULL,
  total_transactions integer NOT NULL DEFAULT 0,
  gross_amount_cents bigint NOT NULL DEFAULT 0,
  refund_amount_cents bigint NOT NULL DEFAULT 0,
  chargeback_amount_cents bigint NOT NULL DEFAULT 0,
  net_amount_cents bigint NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, settlement_date)
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  file_name text NOT NULL,
  object_name text UNIQUE NOT NULL,
  content_type varchar(160) NOT NULL,
  size_bytes bigint NOT NULL,
  checksum char(64) NOT NULL,
  status varchar(30) NOT NULL,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid REFERENCES users(id),
  action varchar(100) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  correlation_id varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  event_type varchar(100) NOT NULL,
  aggregate_type varchar(80) NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  consumer varchar(80) NOT NULL,
  message_id varchar(200) NOT NULL,
  payload_hash char(64),
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, consumer, message_id)
);
