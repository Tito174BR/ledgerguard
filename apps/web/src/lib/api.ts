import { clearSession, readSession, saveSession, type SessionState } from './session';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

let refreshPromise: Promise<SessionState | null> | null = null;

async function refreshSession(): Promise<SessionState | null> {
  if (refreshPromise) return refreshPromise;
  const current = readSession();
  refreshPromise = fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: current?.currentTenantId ?? undefined })
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json() as Partial<SessionState>;
      const next: SessionState = {
        accessToken: payload.accessToken ?? '',
        user: current?.user,
        memberships: payload.memberships ?? current?.memberships ?? [],
        currentTenantId: payload.currentTenantId ?? null
      };
      saveSession(next);
      return next;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const session = readSession();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers, credentials: 'include' });
  } catch {
    throw new ApiError('Não foi possível acessar a API. Verifique os containers.', 0, 'NETWORK_ERROR');
  }

  if (response.status === 401 && retry) {
    const renewed = await refreshSession();
    if (renewed?.accessToken) return api<T>(path, options, false);
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/login';
  }

  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

  if (!response.ok) {
    const server = payload as { error?: { message?: string; code?: string } };
    throw new ApiError(server?.error?.message ?? `Erro HTTP ${response.status}`, response.status, server?.error?.code);
  }
  return payload as T;
}

export async function download(path: string): Promise<Blob> {
  const session = readSession();
  const response = await fetch(path, {
    credentials: 'include',
    headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}
  });
  if (!response.ok) throw new ApiError('Falha no download', response.status);
  return response.blob();
}

export function formatMoney(
  cents: string | number | bigint | null | undefined,
  currency = 'BRL'
): string {
  if (cents === null || cents === undefined || cents === '') return '—';

  const numericValue = Number(cents);
  if (!Number.isFinite(numericValue)) return '—';

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency
  }).format(numericValue / 100);
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}
