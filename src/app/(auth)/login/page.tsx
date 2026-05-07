import Link from 'next/link';
import { loginAction } from '@/lib/actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-semibold">Log in</h1>
      <form action={loginAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input type="email" name="email" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input type="password" name="password" required minLength={8} />
        </div>
        {params.error && <p className="text-sm text-rose-600">{params.error}</p>}
        <button type="submit" className="w-full bg-brand-500 text-white hover:bg-brand-700">
          Log in
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        Need an account?{' '}
        <Link className="text-brand-700 underline" href="/signup">
          Sign up
        </Link>
      </p>
    </main>
  );
}
