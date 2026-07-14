import { ReactNode } from 'react';
import clsx from 'clsx';
import { formatStatusLabel, getStatusTone } from '@/lib/status';

export function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-lg border border-slate-200 bg-white p-5 shadow-sm', className)}>
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
  return <span className={clsx('whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium', styles[tone])}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={getStatusTone(status)}>{formatStatusLabel(status)}</Badge>;
}

export function Notice({
  children,
  tone = 'info',
  className
}: {
  children: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'error' | 'neutral';
  className?: string;
}) {
  const styles = {
    info: 'bg-brand-50 text-brand-800',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-800',
    error: 'bg-rose-50 text-rose-700',
    neutral: 'bg-slate-100 text-slate-600'
  };

  return <p className={clsx('rounded-md p-3 text-sm', styles[tone], className)}>{children}</p>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{children}</p>;
}