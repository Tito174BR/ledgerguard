'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, Banknote, BookOpen, BriefcaseBusiness,
  ChevronDown, FileArchive, Gauge, LogOut, Menu, ReceiptText,
  Scale, Settings, ShieldCheck, Users, X
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { clearSession, readSession, saveSession, type SessionState } from '../lib/session';

const nav = [
  ['/dashboard', 'Visão geral', Gauge],
  ['/transactions', 'Transações', ReceiptText],
  ['/cases', 'Investigação', BriefcaseBusiness],
  ['/rules', 'Regras antifraude', ShieldCheck],
  ['/reconciliation', 'Conciliação', Scale],
  ['/settlements', 'Fechamentos', Banknote],
  ['/files', 'Arquivos', FileArchive],
  ['/audit', 'Auditoria', BookOpen],
  ['/settings', 'Administração', Settings]
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [open, setOpen] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let active = true;
    async function restore() {
      const local = readSession();
      if (local?.accessToken) {
        if (active) { setSession(local); setBooting(false); }
        return;
      }
      try {
        const refreshed = await api<Omit<SessionState, 'user'>>('/api/v1/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ tenantId: local?.currentTenantId })
        }, false);
        let next: SessionState = { ...refreshed, user: local?.user };
        saveSession(next);
        try {
          const me = await api<{ user?: SessionState['user'] }>('/api/v1/auth/me');
          next = { ...next, user: me.user ?? next.user };
          saveSession(next);
        } catch {
          // A sessão renovada continua válida mesmo se o perfil não puder ser lido.
        }
        if (active) setSession(next);
      } catch {
        clearSession();
        router.replace('/login');
      } finally {
        if (active) setBooting(false);
      }
    }
    void restore();
    return () => { active = false; };
  }, [router]);

  const current = useMemo(
    () => session?.memberships.find((m) => m.tenant_id === session.currentTenantId) ?? session?.memberships[0],
    [session]
  );

  async function switchTenant(tenantId: string) {
    const refreshed = await api<Omit<SessionState, 'user'>>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ tenantId })
    });
    const next: SessionState = { ...refreshed, user: session?.user };
    saveSession(next);
    setSession(next);
    location.reload();
  }
  async function logout() {
    await api('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
    router.replace('/login');
  }

  if (booting) return <div className="app-loading"><Activity className="spin" /> Preparando LedgerGuard...</div>;
  if (!session) return null;

  return <div className="app-layout">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark">LG</div><div><strong>LedgerGuard</strong><span>Financial Control</span></div></div>
      <div className="workspace-select">
        <label>Workspace</label>
        <div className="select-wrap">
          <select value={current?.tenant_id ?? ''} onChange={(e) => void switchTenant(e.target.value)}>
            {session.memberships.map((item) => <option key={item.tenant_id} value={item.tenant_id}>{item.name}</option>)}
          </select><ChevronDown size={15} />
        </div>
        <small>{current?.role ?? 'Sem papel'}</small>
      </div>
      <nav>
        {nav.map(([href, label, Icon]) => <Link key={href} href={href} className={pathname.startsWith(href) ? 'active' : ''} onClick={() => setOpen(false)}>
          <Icon size={18}/><span>{label}</span>
        </Link>)}
      </nav>
      <div className="sidebar-foot">
        <div className="secure"><ShieldCheck size={18}/><div><strong>Ledger protegido</strong><span>RLS + trilha imutável</span></div></div>
        <button onClick={() => void logout()}><LogOut size={17}/> Sair</button>
      </div>
    </aside>
    {open && <button className="scrim" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
    <main className="main">
      <div className="topbar">
        <button className="menu-button" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
        <div className="top-status"><span className="status-dot"/><span>Monitoramento ativo</span></div>
        <div className="top-user"><div><strong>{session.user?.name ?? 'Administrador'}</strong><span>{session.user?.email}</span></div><div className="avatar">{(session.user?.name ?? 'A').slice(0,2).toUpperCase()}</div></div>
      </div>
      <div className="content">{children}</div>
    </main>
  </div>;
}
