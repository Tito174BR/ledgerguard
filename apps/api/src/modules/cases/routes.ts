import type { FastifyPluginAsync } from 'fastify';
import { withTenant } from '../../db/pool.js';
import { audit } from '../../lib/audit.js';

export const caseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const query = request.query as { status?: string };
      const values: unknown[] = [];
      let where = 'WHERE 1 = 1';

      if (query.status) {
        values.push(query.status);
        where += ` AND fraud_cases.status = $${values.length}`;
      }

      const result = await client.query(
        `SELECT
           fraud_cases.*,
           transactions.external_id,
           transactions.amount_cents,
           transactions.card_last4,
           transactions.occurred_at
         FROM fraud_cases
         JOIN transactions
           ON transactions.id = fraud_cases.transaction_id
         ${where}
         ORDER BY fraud_cases.created_at DESC
         LIMIT 200`,
        values
      );

      return result.rows;
    });
  });

  app.get('/:id', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const { id } = request.params as { id: string };

      const item = (
        await client.query(
          `SELECT
             fraud_cases.*,
             transactions.external_id,
             transactions.amount_cents,
             transactions.metadata AS transaction_metadata
           FROM fraud_cases
           JOIN transactions
             ON transactions.id = fraud_cases.transaction_id
           WHERE fraud_cases.id = $1`,
          [id]
        )
      ).rows[0];

      if (!item) {
        throw app.httpErrors.notFound('Caso não encontrado');
      }

      const events = await client.query(
        `SELECT
           case_events.*,
           users.name AS user_name
         FROM case_events
         LEFT JOIN users ON users.id = case_events.user_id
         WHERE case_events.case_id = $1
         ORDER BY case_events.created_at`,
        [id]
      );

      return {
        case: item,
        events: events.rows
      };
    });
  });

  app.patch('/:id', { preHandler: app.requireTenant }, async (request) => {
    const tenantId = request.authUser!.tenantId!;
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: string;
      assignedTo?: string;
      resolution?: string;
    };

    return withTenant(tenantId, async (client) => {
      const before = (
        await client.query(
          'SELECT * FROM fraud_cases WHERE id = $1',
          [id]
        )
      ).rows[0];

      if (!before) {
        throw app.httpErrors.notFound('Caso não encontrado');
      }

      const after = (
        await client.query(
          `UPDATE fraud_cases
           SET
             status = COALESCE($2, status),
             assigned_to = COALESCE($3, assigned_to),
             resolution = COALESCE($4, resolution),
             updated_at = now(),
             closed_at = CASE
               WHEN $2 IN ('APPROVED','REJECTED','BLOCKED','CLOSED')
                 THEN now()
               ELSE closed_at
             END
           WHERE id = $1
           RETURNING *`,
          [id, body.status ?? null, body.assignedTo ?? null, body.resolution ?? null]
        )
      ).rows[0];

      await client.query(
        `INSERT INTO case_events(
           tenant_id,
           case_id,
           user_id,
           event_type,
           payload
         )
         VALUES($1,$2,$3,'STATUS_CHANGED',$4)`,
        [
          tenantId,
          id,
          request.authUser!.id,
          JSON.stringify(body)
        ]
      );

      await audit(client, {
        tenantId,
        userId: request.authUser!.id,
        action: 'CASE_UPDATED',
        entityType: 'fraud_case',
        entityId: id,
        before,
        after,
        correlationId: request.id
      });

      return after;
    });
  });

  app.post(
    '/:id/events',
    { preHandler: app.requireTenant },
    async (request) => {
      return withTenant(request.authUser!.tenantId!, async (client) => {
        const { id } = request.params as { id: string };
        const body = request.body as {
          type?: string;
          message?: string;
        };

        const event = await client.query(
          `INSERT INTO case_events(
             tenant_id,
             case_id,
             user_id,
             event_type,
             payload
           )
           VALUES($1,$2,$3,$4,$5)
           RETURNING *`,
          [
            request.authUser!.tenantId,
            id,
            request.authUser!.id,
            body.type ?? 'COMMENT',
            JSON.stringify({ message: body.message ?? '' })
          ]
        );

        return event.rows[0];
      });
    }
  );
};
