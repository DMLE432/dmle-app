import Link from 'next/link';
import { signUpAction } from '@/lib/actions';

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-semibold">Create account</h1>
      <form action={signUpAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium">Full name</label>
          <input name="full_name" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input type="email" name="email" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input type="password" name="password" required minLength={8} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Role</label>
          <select name="role" defaultValue="shipper">
            <option value="shipper">Shipper</option>
            <option value="courier">Courier (requires admin approval)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Organization name</label>
          <input name="organization_name" placeholder="Hospital, clinic, lab, or courier service" />
        </div>
        {params.error && <p className="text-sm text-rose-600">{params.error}</p>}
        <button type="submit" className="w-full bg-brand-500 text-white hover:bg-brand-700">
          Create account
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        Already have an account?{' '}
        <Link className="text-brand-700 underline" href="/login">
          Log in
        </Link>
      </p>
    </main>
  );
}
