import type { FastifyPluginAsync } from 'fastify';
import { withTenant } from '../../db/pool.js';

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const result = await client.query(
        `SELECT
           audit_log.*,
           users.name AS user_name,
           users.email AS user_email
         FROM audit_log
         LEFT JOIN users ON users.id = audit_log.user_id
         ORDER BY audit_log.created_at DESC
         LIMIT 300`
      );

      return result.rows;
    });
  });
};
