import { ReactNode } from 'react';
import clsx from 'clsx';

export function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' }) {
  const styles = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-rose-100 text-rose-700'
  };
  return <span className={clsx('rounded-full px-2 py-1 text-xs font-medium', styles[tone])}>{children}</span>;
}
