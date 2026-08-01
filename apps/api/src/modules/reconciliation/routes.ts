import type { FastifyPluginAsync } from 'fastify';
import { reconciliationItemSchema } from '@ledgerguard/contracts';
import { withTenant } from '../../db/pool.js';
import { reconciliationQueue } from '../../lib/queue.js';

export const reconciliationRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/batches',
    { preHandler: app.requireTenant },
    async (request) => {
      return withTenant(request.authUser!.tenantId!, async (client) => {
        const result = await client.query(
          `SELECT
             reconciliation_batches.*,
             count(reconciliation_items.id)::int AS total_items,
             count(reconciliation_items.id) FILTER(
               WHERE reconciliation_items.status = 'MATCHED'
             )::int AS matched,
             count(reconciliation_items.id) FILTER(
               WHERE reconciliation_items.status <> 'MATCHED'
             )::int AS divergent
           FROM reconciliation_batches
           LEFT JOIN reconciliation_items
             ON reconciliation_items.batch_id = reconciliation_batches.id
           GROUP BY reconciliation_batches.id
           ORDER BY reconciliation_batches.created_at DESC`
        );

        return result.rows;
      });
    }
  );

  app.post(
    '/batches',
    { preHandler: app.requireTenant },
    async (request, reply) => {
      const tenantId = request.authUser!.tenantId!;
      const body = request.body as {
        name: string;
        source?: string;
        periodStart?: string;
        periodEnd?: string;
        items?: unknown[];
      };
      const items = (body.items ?? []).map((item) =>
        reconciliationItemSchema.parse(item)
      );

      const batch = await withTenant(tenantId, async (client) => {
        const created = (
          await client.query(
            `INSERT INTO reconciliation_batches(
               tenant_id,
               name,
               source,
               status,
               period_start,
               period_end,
               created_by
             )
             VALUES($1,$2,$3,'PENDING',$4,$5,$6)
             RETURNING *`,
            [
              tenantId,
              body.name,
              body.source ?? 'MANUAL',
              body.periodStart ?? null,
              body.periodEnd ?? null,
              request.authUser!.id
            ]
          )
        ).rows[0];

        for (const item of items) {
          await client.query(
            `INSERT INTO reconciliation_items(
               tenant_id,
               batch_id,
               external_id,
               source_amount_cents,
               source_occurred_at,
               source_metadata,
               status
             )
             VALUES($1,$2,$3,$4,$5,$6,'PENDING')`,
            [
              tenantId,
              created.id,
              item.externalId,
              Math.round(item.amount * 100),
              item.occurredAt ?? null,
              JSON.stringify(item.metadata)
            ]
          );
        }

        return created;
      });

      await reconciliationQueue.add(
        'reconcile',
        { tenantId, batchId: batch.id },
        {
          jobId: `reconcile-${batch.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 }
        }
      );

      reply.code(202);
      return batch;
    }
  );

  app.get(
    '/batches/:id',
    { preHandler: app.requireTenant },
    async (request) => {
      return withTenant(request.authUser!.tenantId!, async (client) => {
        const { id } = request.params as { id: string };
        const batch = (
          await client.query(
            'SELECT * FROM reconciliation_batches WHERE id = $1',
            [id]
          )
        ).rows[0];

        if (!batch) {
          throw app.httpErrors.notFound('Lote não encontrado');
        }

        const items = await client.query(
          `SELECT *
           FROM reconciliation_items
           WHERE batch_id = $1
           ORDER BY created_at`,
          [id]
        );

        return {
          batch,
          items: items.rows
        };
      });
    }
  );

  app.post(
    '/batches/:id/run',
    { preHandler: app.requireTenant },
    async (request) => {
      const tenantId = request.authUser!.tenantId!;
      const { id } = request.params as { id: string };

      await reconciliationQueue.add(
        'reconcile',
        { tenantId, batchId: id },
        { jobId: `reconcile-${id}-${Date.now()}` }
      );

      return { queued: true };
    }
  );
};
