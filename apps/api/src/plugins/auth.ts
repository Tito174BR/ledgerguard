import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

export interface AuthUser {
  id: string;
  email: string;
  tenantId?: string;
  role?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }

  interface FastifyInstance {
    requireAuth: (request: FastifyRequest) => Promise<void>;
    requireTenant: (request: FastifyRequest) => Promise<void>;
  }
}

export default fp(async (app: FastifyInstance) => {
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.decorate('requireAuth', async (request: FastifyRequest) => {
    try {
      request.authUser = await request.jwtVerify<AuthUser>();
    } catch {
      throw app.httpErrors.unauthorized('Sessão inválida ou expirada');
    }
  });

  app.decorate('requireTenant', async (request: FastifyRequest) => {
    await app.requireAuth(request);
    if (!request.authUser?.tenantId) {
      throw app.httpErrors.preconditionFailed('Selecione um workspace');
    }
  });
});
