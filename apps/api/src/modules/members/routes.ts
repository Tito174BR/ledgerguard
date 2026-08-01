import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import { pool, withTenant } from '../../db/pool.js';

export const memberRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: app.requireTenant }, async (request) => {
    return withTenant(request.authUser!.tenantId!, async (client) => {
      const result = await client.query(
        `SELECT
           memberships.id,
           memberships.role,
           memberships.status,
           users.id AS user_id,
           users.name,
           users.email
         FROM memberships
         JOIN users ON users.id = memberships.user_id
         WHERE memberships.tenant_id = $1
         ORDER BY users.name`,
        [request.authUser!.tenantId]
      );

      return result.rows;
    });
  });

  app.post('/', { preHandler: app.requireTenant }, async (request, reply) => {
    if (!['OWNER', 'ADMIN'].includes(request.authUser!.role ?? '')) {
      throw app.httpErrors.forbidden('Somente administradores podem adicionar membros');
    }

    const body = request.body as {
      name: string;
      email: string;
      password?: string;
      role?: string;
    };
    const passwordHash = await argon2.hash(body.password ?? 'ChangeMe@123');

    const user = (
      await pool.query(
        `INSERT INTO users(name, email, password_hash, status)
         VALUES($1, lower($2), $3, 'ACTIVE')
         ON CONFLICT(email)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name, email`,
        [body.name, body.email, passwordHash]
      )
    ).rows[0];

    const membership = await withTenant(
      request.authUser!.tenantId!,
      async (client) => {
        const result = await client.query(
          `INSERT INTO memberships(tenant_id, user_id, role, status)
           VALUES($1,$2,$3,'ACTIVE')
           ON CONFLICT(tenant_id, user_id)
           DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
           RETURNING *`,
          [
            request.authUser!.tenantId,
            user.id,
            body.role ?? 'VIEWER'
          ]
        );

        return result.rows[0];
      }
    );

    reply.code(201);
    return { user, membership };
  });
};
