import { redirect } from 'next/navigation';
import { getDashboardPath, getUserWithProfile } from '@/lib/auth';

export default async function DashboardRedirectPage() {
  const { user, profile } = await getUserWithProfile();

  if (!user || !profile) {
    redirect('/login');
  }

  redirect(getDashboardPath(profile.role));
}
