import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { createWorkspaceSchema } from '@ledgerguard/contracts';
import { pool, withTenant } from '../../db/pool.js';
import { audit } from '../../lib/audit.js';

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: app.requireAuth }, async (request) => {
    const result = await pool.query(
      `SELECT
         t.id,
         t.name,
         t.slug,
         t.timezone,
         t.currency,
         m.role
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1
         AND m.status = 'ACTIVE'
         AND t.status = 'ACTIVE'
       ORDER BY t.name`,
      [request.authUser!.id]
    );

    return result.rows;
  });

  app.post('/', { preHandler: app.requireAuth }, async (request, reply) => {
    const body = createWorkspaceSchema.parse(request.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const tenant = (
        await client.query(
          `INSERT INTO tenants(name, slug, timezone, currency)
           VALUES($1, $2, $3, $4)
           RETURNING *`,
          [body.name, body.slug, body.timezone, body.currency]
        )
      ).rows[0];

      await client.query(
        `INSERT INTO memberships(tenant_id, user_id, role, status)
         VALUES($1, $2, 'OWNER', 'ACTIVE')`,
        [tenant.id, request.authUser!.id]
      );

      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);
      const accounts = [
        ['PAYMENTS_RECEIVABLE', 'Contas a receber', 'ASSET'],
        ['TRANSACTION_REVENUE', 'Receita de transações', 'REVENUE'],
        ['REFUND_EXPENSE', 'Despesa de reembolso', 'EXPENSE'],
        ['CHARGEBACK_EXPENSE', 'Despesa de chargeback', 'EXPENSE'],
        ['SETTLEMENT_CLEARING', 'Liquidação a compensar', 'ASSET']
      ];
      for (const account of accounts) {
        await client.query(
          `INSERT INTO ledger_accounts(tenant_id, code, name, account_type)
           VALUES($1,$2,$3,$4)`,
          [tenant.id, ...account]
        );
      }

      const defaultRules = [
        ['Duplicidade', 'DUPLICATE', 'HIGH', 60, { threshold: 2 }],
        ['Velocidade de uso', 'VELOCITY', 'HIGH', 45, { maxCount: 3, windowMinutes: 10 }],
        ['Valor atípico', 'AMOUNT', 'MEDIUM', 30, { maxAmount: 1000 }],
        ['Sequência TSN', 'TSN', 'HIGH', 55, { maxDelta: 10 }]
      ] as const;

      for (const [name, kind, severity, score, config] of defaultRules) {
        const rule = (
          await client.query(
            `INSERT INTO fraud_rules(
               tenant_id, name, description, kind, enabled, created_by
             )
             VALUES($1,$2,'Regra padrão do LedgerGuard',$3,true,$4)
             RETURNING id`,
            [tenant.id, name, kind, request.authUser!.id]
          )
        ).rows[0];

        const version = (
          await client.query(
            `INSERT INTO fraud_rule_versions(
               tenant_id, rule_id, version, config, score, severity, created_by
             )
             VALUES($1,$2,1,$3,$4,$5,$6)
             RETURNING id`,
            [
              tenant.id,
              rule.id,
              JSON.stringify(config),
              score,
              severity,
              request.authUser!.id
            ]
          )
        ).rows[0];

        await client.query(
          `UPDATE fraud_rules SET active_version_id = $2 WHERE id = $1`,
          [rule.id, version.id]
        );
      }

      await client.query('COMMIT');
      reply.code(201);
      return tenant;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch('/:id', { preHandler: app.requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const allowed = await pool.query(
      `SELECT 1
       FROM memberships
       WHERE tenant_id = $1
         AND user_id = $2
         AND role IN ('OWNER', 'ADMIN')
         AND status = 'ACTIVE'`,
      [id, request.authUser!.id]
    );

    if (!allowed.rowCount) {
      throw app.httpErrors.forbidden('Sem permissão para alterar o workspace');
    }

    const body = request.body as {
      name?: string;
      slug?: string;
      timezone?: string;
      currency?: string;
    };

    return withTenant(id, async (client) => {
      const before = (
        await client.query('SELECT * FROM tenants WHERE id = $1', [id])
      ).rows[0];

      const after = (
        await client.query(
          `UPDATE tenants
           SET
             name = COALESCE($2, name),
             slug = COALESCE($3, slug),
             timezone = COALESCE($4, timezone),
             currency = COALESCE($5, currency),
             updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [id, body.name, body.slug, body.timezone, body.currency]
        )
      ).rows[0];

      await audit(client, {
        tenantId: id,
        userId: request.authUser!.id,
        action: 'WORKSPACE_UPDATED',
        entityType: 'tenant',
        entityId: id,
        before,
        after
      });

      return after;
    });
  });


  app.post(
    '/:id/rotate-webhook-secret',
    { preHandler: app.requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const allowed = await pool.query(
        `SELECT 1
         FROM memberships
         WHERE tenant_id = $1
           AND user_id = $2
           AND role IN ('OWNER','ADMIN')
           AND status = 'ACTIVE'`,
        [id, request.authUser!.id]
      );

      if (!allowed.rowCount) {
        throw app.httpErrors.forbidden('Sem permissão para alterar o webhook');
      }

      const secret = crypto.randomBytes(32).toString('base64url');
      const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

      await pool.query(
        `UPDATE tenants
         SET webhook_secret_hash = $2, updated_at = now()
         WHERE id = $1`,
        [id, secretHash]
      );

      return {
        secret,
        endpoint: `/api/v1/transactions/webhook/${id}`,
        warning: 'O segredo é exibido somente nesta resposta.'
      };
    }
  );
};
