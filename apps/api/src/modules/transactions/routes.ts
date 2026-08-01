import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { createTransactionSchema } from '@ledgerguard/contracts';
import { pool, withTenant } from '../../db/pool.js';
import { ingestionQueue } from '../../lib/queue.js';
import { audit } from '../../lib/audit.js';

function cardTokenHash(value?: string): string | null {
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

export const transactionRoutes: FastifyPluginAsync = async (app) => {

  app.post(
    '/webhook/:tenantSlug',
    { config: { rateLimit: { max: 1200, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const provided = request.headers['x-ledgerguard-key'];

      if (typeof provided !== 'string') {
        throw app.httpErrors.unauthorized('Chave de webhook ausente');
      }

      const tenant = (
        await pool.query(
          `SELECT id, webhook_secret_hash
           FROM tenants
           WHERE (slug = $1 OR id::text = $1)
             AND status = 'ACTIVE'`,
          [tenantSlug]
        )
      ).rows[0];

      if (!tenant?.webhook_secret_hash) {
        throw app.httpErrors.unauthorized('Webhook não configurado');
      }

      const providedHash = crypto.createHash('sha256').update(provided).digest();
      const expectedHash = Buffer.from(tenant.webhook_secret_hash, 'hex');
      if (
        providedHash.length !== expectedHash.length ||
        !crypto.timingSafeEqual(providedHash, expectedHash)
      ) {
        throw app.httpErrors.unauthorized('Chave de webhook inválida');
      }

      const body = createTransactionSchema.parse(request.body);
      const transaction = await withTenant(tenant.id, async (client) => {
        const existing = (
          await client.query(
            'SELECT * FROM transactions WHERE idempotency_key = $1',
            [body.idempotencyKey]
          )
        ).rows[0];
        if (existing) return existing;

        return (
          await client.query(
            `INSERT INTO transactions(
               tenant_id, external_id, idempotency_key, status, occurred_at,
               amount_cents, currency, payment_method, card_token_hash,
               card_last4, card_tsn, terminal_id, line_id, latitude,
               longitude, metadata
             )
             VALUES($1,$2,$3,'RECEIVED',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             RETURNING *`,
            [
              tenant.id,
              body.externalId,
              body.idempotencyKey,
              body.occurredAt,
              Math.round(body.amount * 100),
              body.currency,
              body.paymentMethod,
              cardTokenHash(body.cardToken),
              body.cardLast4 ?? null,
              body.cardTsn ?? null,
              body.terminalId ?? null,
              body.lineId ?? null,
              body.latitude ?? null,
              body.longitude ?? null,
              JSON.stringify({ ...body.metadata, source: 'WEBHOOK' })
            ]
          )
        ).rows[0];
      });

      await ingestionQueue.add(
        'ingest',
        { tenantId: tenant.id, transactionId: transaction.id },
        {
          jobId: `ingest-${transaction.id}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 }
        }
      );

      reply.code(202);
      return transaction;
    }
  );

  app.get('/', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const query = request.query as {
        status?: string;
        search?: string;
        limit?: string;
      };
      const values: unknown[] = [];
      let where = 'WHERE 1 = 1';

      if (query.status) {
        values.push(query.status);
        where += ` AND status = $${values.length}`;
      }

      if (query.search) {
        values.push(`%${query.search}%`);
        where += ` AND (
          external_id ILIKE $${values.length}
          OR terminal_id ILIKE $${values.length}
          OR card_last4 ILIKE $${values.length}
        )`;
      }

      values.push(Math.min(Number(query.limit) || 50, 200));

      const result = await client.query(
        `SELECT
           id,
           external_id,
           status,
           amount_cents,
           currency,
           payment_method,
           card_last4,
           card_tsn,
           terminal_id,
           line_id,
           risk_score,
           risk_level,
           occurred_at,
           created_at
         FROM transactions
         ${where}
         ORDER BY created_at DESC
         LIMIT $${values.length}`,
        values
      );

      return result.rows;
    });
  });

  app.get('/:id', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const { id } = request.params as { id: string };
      const transaction = (
        await client.query('SELECT * FROM transactions WHERE id = $1', [id])
      ).rows[0];

      if (!transaction) {
        throw app.httpErrors.notFound('Transação não encontrada');
      }

      const [entries, evaluations, caseResult] = await Promise.all([
        client.query(
          `SELECT
             ledger_entries.*,
             ledger_accounts.code AS account_code,
             ledger_accounts.name AS account_name
           FROM ledger_entries
           JOIN ledger_accounts
             ON ledger_accounts.id = ledger_entries.account_id
           WHERE ledger_entries.transaction_id = $1
           ORDER BY ledger_entries.created_at`,
          [id]
        ),
        client.query(
          `SELECT *
           FROM fraud_evaluations
           WHERE transaction_id = $1
           ORDER BY created_at`,
          [id]
        ),
        client.query(
          'SELECT * FROM fraud_cases WHERE transaction_id = $1',
          [id]
        )
      ]);

      return {
        transaction,
        ledgerEntries: entries.rows,
        evaluations: evaluations.rows,
        case: caseResult.rows[0] ?? null
      };
    });
  });

  app.post('/', { preHandler: app.requireTenant }, async (request, reply) => {
    const tenantId = request.authUser!.tenantId!;
    const body = createTransactionSchema.parse(request.body);

    const transaction = await withTenant(tenantId, async (client) => {
      const existing = (
        await client.query(
          'SELECT * FROM transactions WHERE idempotency_key = $1',
          [body.idempotencyKey]
        )
      ).rows[0];

      if (existing) return existing;

      const inserted = (
        await client.query(
          `INSERT INTO transactions(
             tenant_id,
             external_id,
             idempotency_key,
             status,
             occurred_at,
             amount_cents,
             currency,
             payment_method,
             card_token_hash,
             card_last4,
             card_tsn,
             terminal_id,
             line_id,
             latitude,
             longitude,
             metadata,
             created_by
           )
           VALUES(
             $1,$2,$3,'RECEIVED',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
           )
           RETURNING *`,
          [
            tenantId,
            body.externalId,
            body.idempotencyKey,
            body.occurredAt,
            Math.round(body.amount * 100),
            body.currency,
            body.paymentMethod,
            cardTokenHash(body.cardToken),
            body.cardLast4 ?? null,
            body.cardTsn ?? null,
            body.terminalId ?? null,
            body.lineId ?? null,
            body.latitude ?? null,
            body.longitude ?? null,
            JSON.stringify(body.metadata),
            request.authUser!.id
          ]
        )
      ).rows[0];

      await audit(client, {
        tenantId,
        userId: request.authUser!.id,
        action: 'TRANSACTION_RECEIVED',
        entityType: 'transaction',
        entityId: inserted.id,
        after: inserted,
        correlationId: request.id
      });

      return inserted;
    });

    await ingestionQueue.add(
      'ingest',
      {
        tenantId,
        transactionId: transaction.id
      },
      {
        jobId: `ingest-${transaction.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000
      }
    );

    reply.code(202);
    return transaction;
  });

  app.post(
    '/:id/refund',
    { preHandler: app.requireTenant },
    async (request) => {
      const tenantId = request.authUser!.tenantId!;
      const { id } = request.params as { id: string };
      const body = request.body as { amount?: number; reason?: string };

      const refund = await withTenant(tenantId, async (client) => {
        const transaction = (
          await client.query(
            'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
            [id]
          )
        ).rows[0];

        if (!transaction) {
          throw app.httpErrors.notFound('Transação não encontrada');
        }

        const amountCents = Math.round(
          (body.amount || Number(transaction.amount_cents) / 100) * 100
        );
        const alreadyRefunded = BigInt(
          (
            await client.query(
              `SELECT coalesce(sum(amount_cents), 0)::bigint AS total
               FROM refunds
               WHERE transaction_id = $1
                 AND status IN ('REQUESTED','PROCESSED')`,
              [id]
            )
          ).rows[0].total
        );
        if (alreadyRefunded + BigInt(amountCents) > BigInt(transaction.amount_cents)) {
          throw app.httpErrors.conflict('O total de reembolsos excede o valor da transação');
        }

        const inserted = (
          await client.query(
            `INSERT INTO refunds(
               tenant_id,
               transaction_id,
               amount_cents,
               status,
               reason,
               requested_by
             )
             VALUES($1,$2,$3,'REQUESTED',$4,$5)
             RETURNING *`,
            [
              tenantId,
              id,
              amountCents,
              body.reason ?? 'Solicitação manual',
              request.authUser!.id
            ]
          )
        ).rows[0];

        await audit(client, {
          tenantId,
          userId: request.authUser!.id,
          action: 'REFUND_REQUESTED',
          entityType: 'refund',
          entityId: inserted.id,
          after: inserted,
          correlationId: request.id
        });

        return inserted;
      });

      await ingestionQueue.add(
        'refund',
        { tenantId, refundId: refund.id },
        { jobId: `refund-${refund.id}` }
      );

      return refund;
    }
  );


  app.post(
    '/:id/chargeback',
    { preHandler: app.requireTenant },
    async (request, reply) => {
      const tenantId = request.authUser!.tenantId!;
      const { id } = request.params as { id: string };
      const body = request.body as {
        amount?: number;
        reasonCode?: string;
        evidence?: Record<string, unknown>;
      };

      const chargeback = await withTenant(tenantId, async (client) => {
        const transaction = (
          await client.query(
            'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
            [id]
          )
        ).rows[0];

        if (!transaction) {
          throw app.httpErrors.notFound('Transação não encontrada');
        }

        const amountCents = Math.round(
          (body.amount || Number(transaction.amount_cents) / 100) * 100
        );
        const alreadyContested = BigInt(
          (
            await client.query(
              `SELECT coalesce(sum(amount_cents), 0)::bigint AS total
               FROM chargebacks
               WHERE transaction_id = $1
                 AND status NOT IN ('REJECTED','CANCELLED')`,
              [id]
            )
          ).rows[0].total
        );
        if (alreadyContested + BigInt(amountCents) > BigInt(transaction.amount_cents)) {
          throw app.httpErrors.conflict('O total contestado excede o valor da transação');
        }

        const inserted = (
          await client.query(
            `INSERT INTO chargebacks(
               tenant_id, transaction_id, amount_cents, status,
               reason_code, evidence
             )
             VALUES($1,$2,$3,'OPEN',$4,$5)
             RETURNING *`,
            [
              tenantId,
              id,
              amountCents,
              body.reasonCode ?? 'MANUAL',
              JSON.stringify(body.evidence ?? {})
            ]
          )
        ).rows[0];

        await audit(client, {
          tenantId,
          userId: request.authUser!.id,
          action: 'CHARGEBACK_OPENED',
          entityType: 'chargeback',
          entityId: inserted.id,
          after: inserted,
          correlationId: request.id
        });

        return inserted;
      });

      await ingestionQueue.add(
        'chargeback',
        { tenantId, chargebackId: chargeback.id },
        {
          jobId: `chargeback-${chargeback.id}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 }
        }
      );

      reply.code(202);
      return chargeback;
    }
  );
};
