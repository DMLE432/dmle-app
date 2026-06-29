import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { APP_NAME, roleLabels, UserRole } from '@/lib/constants';
import { createActionClient } from '@/lib/supabase/server';

export async function Header({ role }: { role?: UserRole }) {
  async function signOut() {
    'use server';
    const client = await createActionClient();
    await client.auth.signOut();
    revalidatePath('/', 'layout');
    redirect('/login');
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-brand-700">
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {role && <span className="rounded-full bg-brand-50 px-3 py-1 text-brand-700">{roleLabels[role]}</span>}
          <form action={signOut}>
            <button type="submit" className="bg-slate-900 text-white hover:bg-slate-700">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
