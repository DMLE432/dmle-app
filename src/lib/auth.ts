import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { UserRole } from '@/lib/constants';
import type { Database } from '@/types/database';

type DashboardProfile = Pick<Database['public']['Tables']['profiles']['Row'], 'role' | 'courier_status'>;

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

export function getCourierStatusNotice(status: DashboardProfile['courier_status']) {
  if (status === 'approved') return null;

  if (status === 'rejected') {
    return 'Your courier account is not approved for bidding. You can view the dashboard, but courier actions are locked.';
  }

  return 'Your courier account is pending admin approval. You can view the dashboard, but bidding is locked until approval.';
}

export function getDashboardRedirectPath(profile: DashboardProfile) {
  const dashboardPath = getDashboardPath(profile.role);
  const courierNotice = profile.role === 'courier' ? getCourierStatusNotice(profile.courier_status) : null;

  if (!courierNotice) return dashboardPath;

  return `${dashboardPath}?notice=${encodeURIComponent(courierNotice)}`;
}