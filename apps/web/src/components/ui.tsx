'use client';

import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode;
}) {
  return <header className="page-header">
    <div>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="header-actions">{actions}</div>}
  </header>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Metric({ label, value, hint, tone = 'default' }: {
  label: string; value: ReactNode; hint?: string; tone?: 'default'|'good'|'warn'|'bad';
}) {
  return <Card className={`metric metric-${tone}`}>
    <span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}
  </Card>;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Empty({ title, description }: { title: string; description: string }) {
  return <div className="empty"><strong>{title}</strong><p>{description}</p></div>;
}
export function ErrorState({ message }: { message: string }) {
  return <div className="error-state">{message}</div>;
}
export function Loading() {
  return <div className="loading"><span /> Carregando dados...</div>;
}

export function Modal({ open, title, children, onClose }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void;
}) {
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>;
}
