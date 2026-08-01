'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Fingerprint, Landmark, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { saveSession, type SessionState } from '../../lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@ledgerguard.local');
  const [password, setPassword] = useState('Admin@123456');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const data = await api<SessionState>('/api/v1/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password })
      });
      saveSession(data);
      router.replace(data.currentTenantId ? '/dashboard' : '/settings');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha no login');
    } finally { setLoading(false); }
  }

  return <main className="login-page">
    <section className="login-brand">
      <div className="login-logo"><span>LG</span> LedgerGuard</div>
      <div className="login-copy">
        <span className="eyebrow">FINANCIAL INTELLIGENCE</span>
        <h1>Controle financeiro com rastreabilidade absoluta.</h1>
        <p>Ledger de dupla entrada, conciliação automatizada e antifraude explicável em uma única operação.</p>
      </div>
      <div className="login-features">
        <div><Landmark/><span><strong>Ledger imutável</strong><small>Débito e crédito sempre balanceados</small></span></div>
        <div><Fingerprint/><span><strong>Risco explicável</strong><small>Cada score revela as regras acionadas</small></span></div>
        <div><ShieldCheck/><span><strong>Multiempresa seguro</strong><small>Isolamento por tenant com RLS</small></span></div>
      </div>
    </section>
    <section className="login-panel">
      <form onSubmit={submit} className="login-form">
        <div><span className="eyebrow">ACESSO SEGURO</span><h2>Entre no LedgerGuard</h2><p>Use sua conta corporativa para continuar.</p></div>
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <div className="error-state">{error}</div>}
        <button className="primary" disabled={loading}>{loading ? 'Autenticando...' : <>Entrar <ArrowRight size={18}/></>}</button>
        <div className="demo-login"><strong>Ambiente local</strong><code>admin@ledgerguard.local</code><code>Admin@123456</code></div>
      </form>
    </section>
  </main>;
}
