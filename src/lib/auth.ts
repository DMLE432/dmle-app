import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/constants';

export async function getUserWithProfile() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  return { user, profile };
}

export async function requireRole(allowedRoles: UserRole[]) {
  const { user, profile } = await getUserWithProfile();

  if (!user || !profile) {
    redirect('/login');
  }

  if (!allowedRoles.includes(profile.role)) {
    redirect('/dashboard');
  }

  return { user, profile };
}

export function getDashboardPath(role: UserRole) {
  if (role === 'shipper') return '/shipper';
  if (role === 'courier') return '/courier';
  return '/admin';
}
