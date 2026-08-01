export interface Membership {
  tenant_id: string;
  role: string;
  name: string;
  slug: string;
}
export interface SessionState {
  accessToken: string;
  user?: { id: string; name: string; email: string };
  memberships: Membership[];
  currentTenantId: string | null;
}

const KEY = 'ledgerguard.session';

export function readSession(): SessionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionState) : null;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}
export function saveSession(session: SessionState): void {
  if (typeof window !== 'undefined') sessionStorage.setItem(KEY, JSON.stringify(session));
}
export function clearSession(): void {
  if (typeof window !== 'undefined') sessionStorage.removeItem(KEY);
}
