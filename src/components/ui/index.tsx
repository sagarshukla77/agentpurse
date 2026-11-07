'use client';
import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Tone } from '@/lib/format';

export function Button({ variant = 'default', size, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'good' | 'danger' | 'ghost'; size?: 'sm' }) {
  const v = variant === 'default' ? '' : `btn-${variant}`;
  return <button {...p} className={`btn ${v} ${size ? 'btn-sm' : ''} ${className}`} />;
}

export const Badge = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`badge tone-${tone}`}>{children}</span>;
export const Chip = ({ children }: { children: ReactNode }) => <span className="chip">{children}</span>;

export function Card({ title, actions, children, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      {title && <header className="card-head"><h2>{title}</h2>{actions}</header>}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </section>
  );
}

export const PageHead = ({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) => (
  <header className="page-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="actions">{children}</div></header>
);

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="field">{label}{children}{hint && <span className="hint">{hint}</span>}</label>
);

export const Notice = ({ tone = 'info', children }: { tone?: 'bad' | 'warn' | 'good' | 'info'; children: ReactNode }) => (
  <div className={`notice ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}><div>{children}</div></div>
);

export const Spinner = () => <span className="spinner" role="status" aria-label="Loading" />;
export const Loading = () => <div className="empty"><Spinner /></div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><h2>{title}</h2><Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button></div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

/* ---- Toasts ---- */
type Toast = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, bad }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.bad ? 'bad' : ''}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
