import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getDashboardPath } from '@/lib/auth';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let dashboardHref = '/login';

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile) {
      dashboardHref = getDashboardPath(profile.role);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
      <p className="mb-4 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">Medical courier marketplace MVP</p>
      <h1 className="mb-4 text-4xl font-bold text-slate-900">Direct Med Logistics Exchange</h1>
      <p className="mb-8 max-w-2xl text-slate-600">
        Connect shippers and vetted couriers for compliant, time-sensitive medical deliveries.
      </p>
      <div className="flex gap-3">
        <Link className="rounded-md bg-brand-500 px-5 py-2 text-white hover:bg-brand-700" href={dashboardHref}>
          Open dashboard
        </Link>
        {!user && (
          <Link className="rounded-md border border-slate-300 px-5 py-2 hover:bg-slate-100" href="/signup">
            Create account
          </Link>
        )}
      </div>
    </main>
  );
}
