import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

const cookieName = 'ledgerguard_refresh';

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { email, password } = request.body as {
        email?: string;
        password?: string;
      };

      const result = await pool.query(
        `SELECT id, email, name, password_hash, status
         FROM users
         WHERE lower(email) = lower($1)`,
        [email]
      );

      const user = result.rows[0];

      if (
        !user ||
        user.status !== 'ACTIVE' ||
        !password ||
        !(await argon2.verify(user.password_hash, password))
      ) {
        throw app.httpErrors.unauthorized('Credenciais inválidas');
      }

      const memberships = await pool.query(
        `SELECT
           m.tenant_id,
           m.role,
           t.name,
           t.slug
         FROM memberships m
         JOIN tenants t ON t.id = m.tenant_id
         WHERE m.user_id = $1
           AND m.status = 'ACTIVE'
           AND t.status = 'ACTIVE'
         ORDER BY t.name`,
        [user.id]
      );

      const refreshToken = crypto.randomBytes(48).toString('base64url');

      await pool.query(
        `INSERT INTO sessions(
           user_id, refresh_hash, expires_at, user_agent, ip_address
         )
         VALUES($1, $2, now() + interval '30 days', $3, $4)`,
        [
          user.id,
          hashToken(refreshToken),
          request.headers['user-agent'] ?? null,
          request.ip
        ]
      );

      const selected = memberships.rows[0];
      const accessToken = app.jwt.sign(
        {
          id: user.id,
          email: user.email,
          tenantId: selected?.tenant_id,
          role: selected?.role
        },
        { expiresIn: '15m' }
      );

      reply.setCookie(cookieName, refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/api/v1/auth'
      });

      return {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        },
        memberships: memberships.rows,
        currentTenantId: selected?.tenant_id ?? null
      };
    }
  );

  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies[cookieName];

    if (!refreshToken) {
      throw app.httpErrors.unauthorized('Refresh token ausente');
    }

    const result = await pool.query(
      `SELECT s.id, s.user_id, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.refresh_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()`,
      [hashToken(refreshToken)]
    );

    const currentSession = result.rows[0];

    if (!currentSession) {
      throw app.httpErrors.unauthorized('Sessão expirada');
    }

    const memberships = await pool.query(
      `SELECT
         m.tenant_id,
         m.role,
         t.name,
         t.slug
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1
         AND m.status = 'ACTIVE'
         AND t.status = 'ACTIVE'
       ORDER BY t.name`,
      [currentSession.user_id]
    );

    const requestedTenantId = (request.body as { tenantId?: string } | undefined)
      ?.tenantId;
    const selected =
      memberships.rows.find(
        (membership: { tenant_id: string }) =>
          membership.tenant_id === requestedTenantId
      ) ?? memberships.rows[0];

    const accessToken = app.jwt.sign(
      {
        id: currentSession.user_id,
        email: currentSession.email,
        tenantId: selected?.tenant_id,
        role: selected?.role
      },
      { expiresIn: '15m' }
    );

    return {
      accessToken,
      memberships: memberships.rows,
      currentTenantId: selected?.tenant_id ?? null
    };
  });

  app.post('/logout', async (request, reply) => {
    const refreshToken = request.cookies[cookieName];

    if (refreshToken) {
      await pool.query(
        'UPDATE sessions SET revoked_at = now() WHERE refresh_hash = $1',
        [hashToken(refreshToken)]
      );
    }

    reply.clearCookie(cookieName, { path: '/api/v1/auth' });
    return { ok: true };
  });

  app.get('/me', { preHandler: app.requireAuth }, async (request) => {
    const user = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [request.authUser!.id]
    );
    const memberships = await pool.query(
      `SELECT
         m.tenant_id,
         m.role,
         t.name,
         t.slug
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1
         AND m.status = 'ACTIVE'
         AND t.status = 'ACTIVE'
       ORDER BY t.name`,
      [request.authUser!.id]
    );

    return {
      user: user.rows[0],
      memberships: memberships.rows,
      currentTenantId: request.authUser?.tenantId ?? null
    };
  });
};
