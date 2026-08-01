import http from 'node:http';
import type { Registry } from 'prom-client';

export function startHealthServer(
  port: number,
  workerName: string,
  registry: Registry
): http.Server {
  return http
    .createServer(async (request, response) => {
      if (request.url === '/metrics') {
        response.statusCode = 200;
        response.setHeader('Content-Type', registry.contentType);
        response.end(await registry.metrics());
        return;
      }

      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        status: 'UP',
        worker: workerName
      }));
    })
    .listen(port);
}
