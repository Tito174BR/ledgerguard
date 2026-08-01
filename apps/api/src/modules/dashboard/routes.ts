import type { FastifyPluginAsync } from 'fastify';
import { withTenant } from '../../db/pool.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const [summary, series, risk, cases, reconciliation, recent] =
        await Promise.all([
          client.query(
            `SELECT
               count(*) FILTER(
                 WHERE created_at >= now() - interval '24 hours'
               )::int AS volume_24h,
               coalesce(sum(amount_cents) FILTER(
                 WHERE created_at >= now() - interval '24 hours'
               ), 0)::bigint AS amount_24h,
               count(*) FILTER(
                 WHERE status = 'FLAGGED'
                   AND created_at >= now() - interval '24 hours'
               )::int AS flagged_24h,
               count(*) FILTER(
                 WHERE status = 'RECONCILED'
                   AND created_at >= now() - interval '24 hours'
               )::int AS reconciled_24h,
               count(*) FILTER(
                 WHERE status = 'FAILED'
                   AND created_at >= now() - interval '24 hours'
               )::int AS failed_24h
             FROM transactions`
          ),
          client.query(
            `WITH buckets AS (
               SELECT generate_series(
                 date_trunc('hour', now()) - interval '23 hours',
                 date_trunc('hour', now()),
                 interval '1 hour'
               ) AS bucket_at
             )
             SELECT
               buckets.bucket_at,
               count(transactions.id)::int AS volume,
               coalesce(sum(transactions.amount_cents), 0)::bigint AS amount
             FROM buckets
             LEFT JOIN transactions
               ON transactions.created_at >= buckets.bucket_at
              AND transactions.created_at < buckets.bucket_at + interval '1 hour'
             GROUP BY buckets.bucket_at
             ORDER BY buckets.bucket_at`
          ),
          client.query(
            `SELECT risk_level, count(*)::int AS total
             FROM fraud_evaluations
             WHERE created_at >= now() - interval '30 days'
             GROUP BY risk_level
             ORDER BY risk_level`
          ),
          client.query(
            `SELECT status, count(*)::int AS total
             FROM fraud_cases
             GROUP BY status`
          ),
          client.query(
            `SELECT
               status,
               count(*)::int AS total,
               coalesce(sum(difference_cents), 0)::bigint AS difference
             FROM reconciliation_items
             GROUP BY status`
          ),
          client.query(
            `SELECT
               id,
               external_id,
               status,
               amount_cents,
               currency,
               risk_score,
               risk_level,
               occurred_at,
               created_at
             FROM transactions
             ORDER BY created_at DESC
             LIMIT 12`
          )
        ]);

      return {
        summary: summary.rows[0],
        series: series.rows,
        riskDistribution: risk.rows,
        caseDistribution: cases.rows,
        reconciliation: reconciliation.rows,
        recentTransactions: recent.rows
      };
    });
  });
};
