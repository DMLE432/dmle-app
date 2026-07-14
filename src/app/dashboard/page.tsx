import { redirect } from 'next/navigation';
import { getDashboardRedirectPath, getUserWithProfile } from '@/lib/auth';

export default async function DashboardRedirectPage() {
  const { user, profile } = await getUserWithProfile();

  if (!user || !profile) {
    redirect('/login');
  }

  redirect(getDashboardRedirectPath(profile));
}