import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export function createMetrics(prefix = 'ledgerguard_') {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix });

  const jobs = new Counter({
    name: `${prefix}jobs_total`,
    help: 'Jobs processed',
    labelNames: ['worker', 'status'],
    registers: [registry]
  });

  const duration = new Histogram({
    name: `${prefix}job_duration_seconds`,
    help: 'Job duration',
    labelNames: ['worker'],
    registers: [registry]
  });

  return { registry, jobs, duration };
}
