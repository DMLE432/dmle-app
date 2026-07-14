import Link from 'next/link';
import { Notice } from '@/components/ui';
import { signUpAction } from '@/lib/actions';

type SignUpSearchParams = {
  error?: string | string[];
};

export default async function SignUpPage({ searchParams }: { searchParams: Promise<SignUpSearchParams> }) {
  const params = await searchParams;
  const errorMessage = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-10">
      <p className="mb-2 text-sm font-medium text-brand-700">DMLE private beta</p>
      <h1 className="text-2xl font-semibold text-slate-950">Create your account</h1>
      <p className="mb-6 mt-2 text-sm text-slate-600">Shippers can post shipments immediately. Courier accounts require admin approval before bidding.</p>
      <form action={signUpAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Notice tone="warning">
          Keep account details business-only. Do not enter patient names, DOB, MRN, diagnosis, test results, insurance information, or specimen identifiers.
        </Notice>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
          <input name="full_name" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email address</label>
          <input type="email" name="email" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
          <input type="password" name="password" required minLength={8} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Account type</label>
          <select name="role" defaultValue="shipper">
            <option value="shipper">Shipper</option>
            <option value="courier">Courier (requires admin approval)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Organization name</label>
          <input name="organization_name" placeholder="Hospital, clinic, lab, or courier service" />
        </div>
        {errorMessage && <Notice tone="error">{errorMessage}</Notice>}
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