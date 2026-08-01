import type { FastifyPluginAsync } from 'fastify';
import { withTenant } from '../../db/pool.js';
import { settlementQueue } from '../../lib/queue.js';

export const settlementRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const result = await client.query(
        `SELECT *
         FROM settlements
         ORDER BY settlement_date DESC
         LIMIT 200`
      );

      return result.rows;
    });
  });

  app.post('/', { preHandler: app.requireTenant }, async (request, reply) => {
    const tenantId = request.authUser!.tenantId!;
    const date =
      (request.body as { date?: string } | undefined)?.date ??
      new Date().toISOString().slice(0, 10);

    const settlement = await withTenant(tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO settlements(
           tenant_id,
           settlement_date,
           status,
           created_by
         )
         VALUES($1,$2,'PENDING',$3)
         ON CONFLICT(tenant_id, settlement_date)
         DO UPDATE SET updated_at = now()
         RETURNING *`,
        [tenantId, date, request.authUser!.id]
      );

      return result.rows[0];
    });

    await settlementQueue.add(
      'settle',
      { tenantId, settlementId: settlement.id },
      { jobId: `settle-${settlement.id}-${Date.now()}` }
    );

    reply.code(202);
    return settlement;
  });

  app.post(
    '/:id/close',
    { preHandler: app.requireTenant },
    async (request) => {
      return withTenant(request.authUser!.tenantId!, async (client) => {
        const { id } = request.params as { id: string };
        const result = await client.query(
          `UPDATE settlements
           SET
             status = 'CLOSED',
             closed_at = now(),
             closed_by = $2,
             updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [id, request.authUser!.id]
        );

        if (!result.rows[0]) {
          throw app.httpErrors.notFound('Fechamento não encontrado');
        }

        return result.rows[0];
      });
    }
  );
};
