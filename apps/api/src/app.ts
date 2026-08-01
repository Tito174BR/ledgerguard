import crypto from 'node:crypto';
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { env } from './config/env.js';
import authPlugin from './plugins/auth.js';
import metricsPlugin from './plugins/metrics.js';
import { pool } from './db/pool.js';
import { ensureBucket } from './lib/minio.js';

import { authRoutes } from './modules/auth/routes.js';
import { workspaceRoutes } from './modules/workspaces/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { transactionRoutes } from './modules/transactions/routes.js';
import { fraudRoutes } from './modules/fraud/routes.js';
import { caseRoutes } from './modules/cases/routes.js';
import { reconciliationRoutes } from './modules/reconciliation/routes.js';
import { settlementRoutes } from './modules/settlements/routes.js';
import { fileRoutes } from './modules/files/routes.js';
import { memberRoutes } from './modules/members/routes.js';
import { auditRoutes } from './modules/audit/routes.js';

type ErrorRecord = Record<string, unknown>;

function asErrorRecord(error: unknown): ErrorRecord {
  if (typeof error === 'object' && error !== null) {
    return error as ErrorRecord;
  }

  return {};
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  const record = asErrorRecord(error);
  return typeof record.message === 'string' && record.message.trim()
    ? record.message
    : 'Erro desconhecido';
}

function errorStatusCode(error: unknown): number {
  const value = asErrorRecord(error).statusCode;

  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
    ? value
    : 500;
}

function errorCode(error: unknown, statusCode: number): string {
  const value = asErrorRecord(error).code;

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
}

function errorValidation(error: unknown): unknown {
  return asErrorRecord(error).validation;
}

export async function buildApp() {
  const app = Fastify({
    logger: { level: 'info' },
    trustProxy: true,
    genReqId: (request) =>
      (request.headers['x-correlation-id'] as string | undefined) ??
      crypto.randomUUID()
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute'
  });
  await app.register(multipart);
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'LedgerGuard API',
        version: '1.0.1',
        description: 'Conciliação financeira, ledger e antifraude'
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(authPlugin);
  await app.register(metricsPlugin);

  app.get('/health/live', async () => ({ status: 'UP' }));
  app.get('/health/ready', async () => {
    await pool.query('SELECT 1');
    return { status: 'UP', database: true };
  });

  await ensureBucket();

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(workspaceRoutes, { prefix: '/api/v1/workspaces' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(transactionRoutes, { prefix: '/api/v1/transactions' });
  await app.register(fraudRoutes, { prefix: '/api/v1/fraud' });
  await app.register(caseRoutes, { prefix: '/api/v1/cases' });
  await app.register(reconciliationRoutes, { prefix: '/api/v1/reconciliation' });
  await app.register(settlementRoutes, { prefix: '/api/v1/settlements' });
  await app.register(fileRoutes, { prefix: '/api/v1/files' });
  await app.register(memberRoutes, { prefix: '/api/v1/members' });
  await app.register(auditRoutes, { prefix: '/api/v1/audit' });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = errorStatusCode(error);

    request.log.error(
      {
        err: error,
        correlationId: request.id
      },
      'request failed'
    );

    return reply.code(statusCode).send({
      error: {
        code: errorCode(error, statusCode),
        message: statusCode >= 500 ? 'Erro interno' : errorMessage(error),
        details: errorValidation(error),
        correlationId: request.id
      }
    });
  });

  return app;
}
