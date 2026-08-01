const baseUrl = process.env.LEDGERGUARD_URL ?? 'http://localhost:8080';
const email = process.env.LEDGERGUARD_EMAIL ?? 'admin@ledgerguard.local';
const password = process.env.LEDGERGUARD_PASSWORD ?? 'Admin@123456';

let token = '';
let cookie = '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}
async function waitFor(fn, predicate, message, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(message);
}

console.log(`Validando LedgerGuard em ${baseUrl}`);
const health = await request('/health/ready');
assert(health.status === 'UP', 'Healthcheck falhou');

const login = await request('/api/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password })
});
token = login.accessToken;
assert(token, 'Token não recebido');
assert(login.currentTenantId, 'Workspace inicial ausente');


const webhook = await request(
  `/api/v1/workspaces/${login.currentTenantId}/rotate-webhook-secret`,
  { method: 'POST' }
);
const webhookTransaction = await fetch(`${baseUrl}${webhook.endpoint}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-ledgerguard-key': webhook.secret
  },
  body: JSON.stringify({
    externalId: `WEBHOOK-${Date.now()}`,
    idempotencyKey: `webhook-smoke-${Date.now()}`,
    occurredAt: new Date().toISOString(),
    amount: 19.9,
    currency: 'BRL',
    paymentMethod: 'PIX',
    metadata: { smoke: true }
  })
});
assert(webhookTransaction.status === 202, 'Webhook de ingestão falhou');

const suffix = Date.now();
const transaction = await request('/api/v1/transactions', {
  method: 'POST',
  body: JSON.stringify({
    externalId: `SMOKE-${suffix}`,
    idempotencyKey: `smoke-${suffix}`,
    occurredAt: new Date().toISOString(),
    amount: 125.47,
    currency: 'BRL',
    paymentMethod: 'CARD',
    cardToken: `card-${suffix}`,
    cardLast4: '1740',
    cardTsn: 1,
    terminalId: 'SMOKE-TERM',
    metadata: { smoke: true }
  })
});
assert(transaction.id, 'Transação não criada');

const detail = await waitFor(
  () => request(`/api/v1/transactions/${transaction.id}`),
  (value) => ['POSTED', 'FLAGGED', 'RECONCILED'].includes(value.transaction.status),
  'Transação não foi processada'
);
assert(detail.ledgerEntries.length === 2, 'Ledger não possui dois lançamentos');
const debits = detail.ledgerEntries.filter((row) => row.side === 'DEBIT').reduce((sum, row) => sum + Number(row.amount_cents), 0);
const credits = detail.ledgerEntries.filter((row) => row.side === 'CREDIT').reduce((sum, row) => sum + Number(row.amount_cents), 0);
assert(debits === credits, 'Ledger não está balanceado');

const batch = await request('/api/v1/reconciliation/batches', {
  method: 'POST',
  body: JSON.stringify({
    name: `Smoke reconciliation ${suffix}`,
    source: 'SMOKE',
    items: [{ externalId: transaction.external_id, amount: 125.47, metadata: { smoke: true } }]
  })
});
await waitFor(
  () => request(`/api/v1/reconciliation/batches/${batch.id}`),
  (value) => ['COMPLETED', 'COMPLETED_WITH_DIVERGENCES'].includes(value.batch.status),
  'Conciliação não terminou'
);

const settlement = await request('/api/v1/settlements', {
  method: 'POST',
  body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) })
});
await waitFor(
  async () => (await request('/api/v1/settlements')).find((row) => row.id === settlement.id),
  (value) => value && ['READY', 'CLOSED'].includes(value.status),
  'Fechamento não terminou'
);

const form = new FormData();
form.append('file', new Blob(['external_id;amount\nSMOKE;125.47\n'], { type: 'text/csv' }), 'smoke.csv');
const file = await request('/api/v1/files', { method: 'POST', body: form });
assert(file.checksum?.length === 64, 'Checksum do arquivo inválido');
await request(`/api/v1/files/${file.id}`, { method: 'DELETE' });

const dashboard = await request('/api/v1/dashboard');
assert(dashboard.summary, 'Dashboard sem resumo');

console.log('LedgerGuard validado com sucesso.');
