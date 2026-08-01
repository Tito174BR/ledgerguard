import type pg from 'pg';

interface AuditInput {
  tenantId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
}

export async function audit(client: pg.PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `INSERT INTO audit_log(
      tenant_id, user_id, action, entity_type, entity_id,
      before_data, after_data, correlation_id
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.tenantId,
      input.userId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.correlationId ?? null
    ]
  );
}
