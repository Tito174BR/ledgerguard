import type { FastifyPluginAsync } from 'fastify';
import { createRuleSchema } from '@ledgerguard/contracts';
import { withTenant } from '../../db/pool.js';
import { audit } from '../../lib/audit.js';

export const fraudRoutes: FastifyPluginAsync = async (app) => {
  app.get('/rules', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const result = await client.query(
        `SELECT
           fraud_rules.*,
           fraud_rule_versions.version,
           fraud_rule_versions.config,
           fraud_rule_versions.score,
           fraud_rule_versions.severity
         FROM fraud_rules
         JOIN fraud_rule_versions
           ON fraud_rule_versions.id = fraud_rules.active_version_id
         ORDER BY fraud_rules.created_at DESC`
      );

      return result.rows;
    });
  });

  app.post(
    '/rules',
    { preHandler: app.requireTenant },
    async (request, reply) => {
      const tenantId = request.authUser!.tenantId!;
      const body = createRuleSchema.parse(request.body);

      const result = await withTenant(tenantId, async (client) => {
        const rule = (
          await client.query(
            `INSERT INTO fraud_rules(
               tenant_id,
               name,
               description,
               kind,
               enabled,
               created_by
             )
             VALUES($1,$2,$3,$4,$5,$6)
             RETURNING *`,
            [
              tenantId,
              body.name,
              body.description,
              body.kind,
              body.enabled,
              request.authUser!.id
            ]
          )
        ).rows[0];

        const version = (
          await client.query(
            `INSERT INTO fraud_rule_versions(
               tenant_id,
               rule_id,
               version,
               config,
               score,
               severity,
               created_by
             )
             VALUES($1,$2,1,$3,$4,$5,$6)
             RETURNING *`,
            [
              tenantId,
              rule.id,
              JSON.stringify(body.config),
              body.score,
              body.severity,
              request.authUser!.id
            ]
          )
        ).rows[0];

        await client.query(
          `UPDATE fraud_rules
           SET active_version_id = $2
           WHERE id = $1`,
          [rule.id, version.id]
        );

        await audit(client, {
          tenantId,
          userId: request.authUser!.id,
          action: 'FRAUD_RULE_CREATED',
          entityType: 'fraud_rule',
          entityId: rule.id,
          after: { ...rule, ...version },
          correlationId: request.id
        });

        return { ...rule, ...version };
      });

      reply.code(201);
      return result;
    }
  );

  app.patch(
    '/rules/:id',
    { preHandler: app.requireTenant },
    async (request) => {
      const tenantId = request.authUser!.tenantId!;
      const { id } = request.params as { id: string };
      const body = request.body as {
        enabled?: boolean;
        config?: Record<string, unknown>;
        score?: number;
        severity?: string;
      };

      return withTenant(tenantId, async (client) => {
        const rule = (
          await client.query(
            'SELECT * FROM fraud_rules WHERE id = $1 FOR UPDATE',
            [id]
          )
        ).rows[0];

        if (!rule) {
          throw app.httpErrors.notFound('Regra não encontrada');
        }

        if (body.enabled !== undefined) {
          await client.query(
            `UPDATE fraud_rules
             SET enabled = $2, updated_at = now()
             WHERE id = $1`,
            [id, body.enabled]
          );
        }

        if (
          body.config !== undefined ||
          body.score !== undefined ||
          body.severity !== undefined
        ) {
          const currentVersion = (
            await client.query(
              `SELECT
                 coalesce(max(version), 0) + 1 AS next_version
               FROM fraud_rule_versions
               WHERE rule_id = $1`,
              [id]
            )
          ).rows[0];

          const activeVersion = (
            await client.query(
              `SELECT config, score, severity
               FROM fraud_rule_versions
               WHERE id = $1`,
              [rule.active_version_id]
            )
          ).rows[0];

          const version = (
            await client.query(
              `INSERT INTO fraud_rule_versions(
                 tenant_id,
                 rule_id,
                 version,
                 config,
                 score,
                 severity,
                 created_by
               )
               VALUES($1,$2,$3,$4,$5,$6,$7)
               RETURNING *`,
              [
                tenantId,
                id,
                currentVersion.next_version,
                JSON.stringify(body.config ?? activeVersion.config),
                body.score ?? activeVersion.score,
                body.severity ?? activeVersion.severity,
                request.authUser!.id
              ]
            )
          ).rows[0];

          await client.query(
            `UPDATE fraud_rules
             SET active_version_id = $2, updated_at = now()
             WHERE id = $1`,
            [id, version.id]
          );
        }

        const updated = (
          await client.query(
            `SELECT
               fraud_rules.*,
               fraud_rule_versions.version,
               fraud_rule_versions.config,
               fraud_rule_versions.score,
               fraud_rule_versions.severity
             FROM fraud_rules
             JOIN fraud_rule_versions
               ON fraud_rule_versions.id = fraud_rules.active_version_id
             WHERE fraud_rules.id = $1`,
            [id]
          )
        ).rows[0];

        await audit(client, {
          tenantId,
          userId: request.authUser!.id,
          action: 'FRAUD_RULE_UPDATED',
          entityType: 'fraud_rule',
          entityId: id,
          before: rule,
          after: updated,
          correlationId: request.id
        });

        return updated;
      });
    }
  );

  app.get(
    '/evaluations',
    { preHandler: app.requireTenant },
    async (request) => {
      return withTenant(request.authUser!.tenantId!, async (client) => {
        const result = await client.query(
          `SELECT
             fraud_evaluations.*,
             transactions.external_id,
             transactions.amount_cents,
             transactions.card_last4
           FROM fraud_evaluations
           JOIN transactions
             ON transactions.id = fraud_evaluations.transaction_id
           ORDER BY fraud_evaluations.created_at DESC
           LIMIT 200`
        );

        return result.rows;
      });
    }
  );
};
