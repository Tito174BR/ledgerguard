import fp from 'fastify-plugin';
import client from 'prom-client';

export default fp(async (app) => {
  const registry = new client.Registry();
  client.collectDefaultMetrics({
    register: registry,
    prefix: 'ledgerguard_api_'
  });

  const httpDuration = new client.Histogram({
    name: 'ledgerguard_http_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status'],
    registers: [registry]
  });

  app.addHook('onRequest', async (request) => {
    (request as typeof request & { startedAt?: bigint }).startedAt = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = (request as typeof request & { startedAt?: bigint }).startedAt;
    if (!startedAt) return;

    httpDuration
      .labels(
        request.method,
        request.routeOptions.url ?? request.url,
        String(reply.statusCode)
      )
      .observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
  });

  app.get('/metrics', async (_request, reply) => {
    return reply.type(registry.contentType).send(await registry.metrics());
  });
});
