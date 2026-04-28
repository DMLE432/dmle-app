'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDashboardPath } from '@/lib/auth';

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const fullName = String(formData.get('full_name') || '');
  const role = String(formData.get('role') || 'shipper') as 'shipper' | 'courier';
  const organization = String(formData.get('organization_name') || '');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data.user) {
    redirect('/signup?error=Unable to create account');
  }

  const courierStatus = role === 'courier' ? 'pending' : null;

  await supabase.from('profiles').insert({
    id: data.user.id,
    full_name: fullName,
    role,
    organization_name: organization || null,
    courier_status: courierStatus
  });

  redirect(role === 'courier' ? '/courier?notice=Approval pending' : '/shipper');
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=Invalid login credentials');
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  redirect(getDashboardPath(profile?.role ?? 'shipper'));
}

export async function createJobAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  await supabase.from('jobs').insert({
    shipper_id: user.id,
    title: String(formData.get('title') || ''),
    pickup_address: String(formData.get('pickup_address') || ''),
    dropoff_address: String(formData.get('dropoff_address') || ''),
    specimen_type: String(formData.get('specimen_type') || ''),
    required_by: String(formData.get('required_by') || ''),
    notes: String(formData.get('notes') || '') || null,
    status: 'open'
  });

  revalidatePath('/shipper');
}

export async function submitBidAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  await supabase.from('bids').insert({
    job_id: String(formData.get('job_id') || ''),
    courier_id: user.id,
    amount: Number(formData.get('amount') || 0),
    eta_minutes: Number(formData.get('eta_minutes') || 0),
    note: String(formData.get('note') || '') || null,
    status: 'pending'
  });

  revalidatePath('/courier');
  revalidatePath('/shipper');
}

export async function reviewCourierAction(formData: FormData) {
  const supabase = await createClient();
  const profileId = String(formData.get('profile_id') || '');
  const decision = String(formData.get('decision') || 'pending') as 'approved' | 'rejected';

  await supabase.from('profiles').update({ courier_status: decision }).eq('id', profileId);

  revalidatePath('/admin');
  revalidatePath('/courier');
}
