import Link from 'next/link';
import { Notice } from '@/components/ui';
import { loginAction } from '@/lib/actions';

type LoginSearchParams = {
  error?: string | string[];
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginSearchParams> }) {
  const params = await searchParams;
  const errorMessage = firstParam(params.error);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <p className="mb-2 text-sm font-medium text-brand-700">DMLE private beta</p>
      <h1 className="text-2xl font-semibold text-slate-950">Log in to your dashboard</h1>
      <p className="mb-6 mt-2 text-sm text-slate-600">Use your approved shipper, courier, or admin account.</p>
      <form action={loginAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email address</label>
          <input type="email" name="email" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
          <input type="password" name="password" required minLength={8} />
        </div>
        {errorMessage && <Notice tone="error">{errorMessage}</Notice>}
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