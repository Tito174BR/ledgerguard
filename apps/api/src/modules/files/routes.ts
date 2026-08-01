import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { withTenant } from '../../db/pool.js';
import { minio } from '../../lib/minio.js';
import { ingestionQueue } from '../../lib/queue.js';



async function streamToBuffer(
  stream: AsyncIterable<Uint8Array | string>
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (char === '"') {
      if (quoted && line.charAt(index + 1) === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0]!.includes(';') ? ';' : ',';
  const headers = splitCsvLine(lines[0]!, delimiter);
  return lines.slice(1).map((line) =>
    Object.fromEntries(
      headers.map((header, index) => [
        header.trim(),
        splitCsvLine(line, delimiter)[index] ?? ''
      ])
    )
  );
}

function hashCardToken(value?: string): string | null {
  return value
    ? crypto.createHash('sha256').update(value).digest('hex')
    : null;
}

export const fileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const result = await client.query(
        `SELECT
           id,
           file_name,
           content_type,
           size_bytes,
           checksum,
           status,
           created_at
         FROM files
         ORDER BY created_at DESC
         LIMIT 200`
      );

      return result.rows;
    });
  });

  app.post('/', { preHandler: app.requireTenant }, async (request, reply) => {
    const part = await request.file({
      limits: { fileSize: 25 * 1024 * 1024 }
    });

    if (!part) {
      throw app.httpErrors.badRequest('Arquivo obrigatório');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of part.file) {
      chunks.push(Buffer.from(chunk));
    }

    const data = Buffer.concat(chunks);
    const checksum = crypto.createHash('sha256').update(data).digest('hex');
    const tenantId = request.authUser!.tenantId!;
    const objectName = `${tenantId}/${crypto.randomUUID()}-${part.filename}`;

    await minio.putObject(
      env.MINIO_BUCKET,
      objectName,
      data,
      data.length,
      { 'Content-Type': part.mimetype }
    );

    try {
      const file = await withTenant(tenantId, async (client) => {
        const result = await client.query(
          `INSERT INTO files(
             tenant_id,
             file_name,
             object_name,
             content_type,
             size_bytes,
             checksum,
             status,
             uploaded_by
           )
           VALUES($1,$2,$3,$4,$5,$6,'AVAILABLE',$7)
           RETURNING *`,
          [
            tenantId,
            part.filename,
            objectName,
            part.mimetype,
            data.length,
            checksum,
            request.authUser!.id
          ]
        );

        return result.rows[0];
      });

      reply.code(201);
      return file;
    } catch (error) {
      await minio.removeObject(env.MINIO_BUCKET, objectName);
      throw error;
    }
  });

  app.get(
    '/:id/download',
    { preHandler: app.requireTenant },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const file = await withTenant(
        request.authUser!.tenantId!,
        async (client) => {
          const result = await client.query(
            'SELECT * FROM files WHERE id = $1',
            [id]
          );
          return result.rows[0];
        }
      );

      if (!file) {
        throw app.httpErrors.notFound('Arquivo não encontrado');
      }

      reply
        .header('Content-Type', file.content_type)
        .header(
          'Content-Disposition',
          `attachment; filename="${String(file.file_name).replaceAll('"', '')}"`
        );

      return reply.send(
        await minio.getObject(env.MINIO_BUCKET, file.object_name)
      );
    }
  );


  app.post(
    '/:id/import-transactions',
    { preHandler: app.requireTenant },
    async (request, reply) => {
      const tenantId = request.authUser!.tenantId!;
      const { id } = request.params as { id: string };

      const file = await withTenant(tenantId, async (client) => {
        return (
          await client.query('SELECT * FROM files WHERE id = $1', [id])
        ).rows[0];
      });

      if (!file) throw app.httpErrors.notFound('Arquivo não encontrado');

      const content = (
        await streamToBuffer(await minio.getObject(env.MINIO_BUCKET, file.object_name))
      ).toString('utf8');
      const records = parseCsv(content).slice(0, 5000);
      const queued: Array<{ tenantId: string; transactionId: string }> = [];
      const errors: Array<{ line: number; message: string }> = [];

      await withTenant(tenantId, async (client) => {
        for (const [index, record] of records.entries()) {
          try {
            const externalId = record.externalId || record.external_id;
            const amount = Number(record.amount || record.valor);
            const occurredAt =
              record.occurredAt ||
              record.occurred_at ||
              record.data ||
              new Date().toISOString();
            const paymentMethod =
              (record.paymentMethod || record.payment_method || 'OTHER').toUpperCase();

            if (!externalId || !Number.isFinite(amount) || amount <= 0) {
              throw new Error('externalId e amount positivo são obrigatórios');
            }

            const idempotencyKey =
              record.idempotencyKey ||
              record.idempotency_key ||
              `file-${id}-${index + 2}-${externalId}`;

            const inserted = (
              await client.query(
                `INSERT INTO transactions(
                   tenant_id, external_id, idempotency_key, status, occurred_at,
                   amount_cents, currency, payment_method, card_token_hash,
                   card_last4, card_tsn, terminal_id, line_id, metadata, created_by
                 )
                 VALUES($1,$2,$3,'RECEIVED',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                 ON CONFLICT(tenant_id, idempotency_key) DO NOTHING
                 RETURNING id`,
                [
                  tenantId,
                  externalId,
                  idempotencyKey,
                  new Date(occurredAt).toISOString(),
                  Math.round(amount * 100),
                  (record.currency || 'BRL').toUpperCase(),
                  paymentMethod,
                  hashCardToken(record.cardToken || record.card_token),
                  record.cardLast4 || record.card_last4 || null,
                  record.cardTsn || record.card_tsn
                    ? Number(record.cardTsn || record.card_tsn)
                    : null,
                  record.terminalId || record.terminal_id || null,
                  record.lineId || record.line_id || null,
                  JSON.stringify({ source: 'FILE', fileId: id, line: index + 2 }),
                  request.authUser!.id
                ]
              )
            ).rows[0];

            if (inserted?.id) queued.push({ tenantId, transactionId: inserted.id });
          } catch (error) {
            errors.push({
              line: index + 2,
              message: error instanceof Error ? error.message : 'Linha inválida'
            });
          }
        }

        await client.query(
          `UPDATE files SET status = $2 WHERE id = $1`,
          [id, errors.length ? 'IMPORTED_WITH_ERRORS' : 'IMPORTED']
        );
      });

      for (const item of queued) {
        await ingestionQueue.add(
          'ingest',
          item,
          {
            jobId: `ingest-${item.transactionId}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 1000 }
          }
        );
      }

      reply.code(202);
      return {
        totalRows: records.length,
        queued: queued.length,
        errors: errors.slice(0, 100)
      };
    }
  );


  app.delete(
    '/:id',
    { preHandler: app.requireTenant },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenantId = request.authUser!.tenantId!;
      const file = await withTenant(tenantId, async (client) => {
        const result = await client.query(
          'DELETE FROM files WHERE id = $1 RETURNING *',
          [id]
        );
        return result.rows[0];
      });

      if (!file) {
        throw app.httpErrors.notFound('Arquivo não encontrado');
      }

      await minio.removeObject(env.MINIO_BUCKET, file.object_name);
      reply.code(204);
      return reply.send();
    }
  );
};
