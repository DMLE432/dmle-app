'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDashboardPath, requireRole } from '@/lib/auth';

const COURIER_STATUSES = ['accepted', 'en_route_to_pickup', 'picked_up', 'in_transit', 'delivered'] as const;

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const fullName = String(formData.get('full_name') || '');
  const role = String(formData.get('role') || 'shipper') as 'shipper' | 'courier';
  const organization = String(formData.get('organization_name') || '');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    console.error('Supabase signup error:', error);
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (!data.user) {
    const message = 'No user returned from Supabase signup';
    console.error(message);
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }

  const courierStatus = role === 'courier' ? 'pending' : null;

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    full_name: fullName,
    role,
    organization_name: organization || null,
    courier_status: courierStatus
  });

  if (profileError) {
    console.error('Profile insert error:', profileError);
    redirect(`/signup?error=${encodeURIComponent(profileError.message)}`);
  }

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

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value || '').trim();
  return text || null;
}

export async function createJobAction(formData: FormData) {
  const { user } = await requireRole(['shipper']);
  const supabase = await createClient();

  await supabase.from('jobs').insert({
    shipper_id: user.id,
    title: String(formData.get('title') || '').trim(),
    pickup_address: String(formData.get('pickup_address') || '').trim(),
    dropoff_address: String(formData.get('dropoff_address') || '').trim(),
    specimen_type: String(formData.get('specimen_type') || '').trim(),
    pickup_at: String(formData.get('pickup_at') || ''),
    required_by: String(formData.get('required_by') || ''),
    temperature_requirements: optionalText(formData.get('temperature_requirements')),
    chain_of_custody_notes: optionalText(formData.get('chain_of_custody_notes')),
    special_instructions: optionalText(formData.get('special_instructions')),
    offered_price: Number(formData.get('offered_price') || 0),
    notes: optionalText(formData.get('notes')),
    status: 'open'
  });

  revalidatePath('/shipper');
  revalidatePath('/courier');
  revalidatePath('/admin');
}

export async function submitBidAction(formData: FormData) {
  const { user } = await requireRole(['courier']);
  const supabase = await createClient();

  await supabase.from('bids').insert({
    job_id: String(formData.get('job_id') || ''),
    courier_id: user.id,
    amount: Number(formData.get('amount') || 0),
    eta_minutes: Number(formData.get('eta_minutes') || 0),
    note: optionalText(formData.get('note')),
    status: 'pending'
  });

  revalidatePath('/courier');
  revalidatePath('/shipper');
  revalidatePath('/admin');
}

export async function acceptBidAction(formData: FormData) {
  await requireRole(['shipper']);
  const supabase = await createClient();
  const jobId = String(formData.get('job_id') || '');
  const bidId = String(formData.get('bid_id') || '');

  const { data: bidToAccept } = await supabase.from('bids').select('id').eq('id', bidId).eq('job_id', jobId).maybeSingle();

  if (!bidToAccept) {
    return;
  }

  await supabase.from('bids').update({ status: 'accepted' }).eq('id', bidId).eq('job_id', jobId);
  await supabase.from('bids').update({ status: 'declined' }).eq('job_id', jobId).neq('id', bidId).eq('status', 'pending');
  await supabase.from('jobs').update({ status: 'assigned', accepted_bid_id: bidId }).eq('id', jobId).eq('status', 'open');
  await supabase.from('job_status_events').insert({
    job_id: jobId,
    status: 'assigned',
    note: 'Bid accepted by shipper. Shipment assigned to courier.',
    created_by: (await supabase.auth.getUser()).data.user?.id
  });

  revalidatePath('/shipper');
  revalidatePath('/courier');
  revalidatePath('/admin');
}

export async function addShipmentStatusAction(formData: FormData) {
  const { user } = await requireRole(['courier']);
  const supabase = await createClient();
  const jobId = String(formData.get('job_id') || '');
  const status = String(formData.get('status') || '');
  const note = optionalText(formData.get('note'));
  const proof = formData.get('proof') as File | null;

  if (!COURIER_STATUSES.includes(status as (typeof COURIER_STATUSES)[number])) {
    return;
  }

  const { data: assignedBid } = await supabase
    .from('jobs')
    .select('id, accepted_bid_id, bids!jobs_accepted_bid_id_fkey(courier_id)')
    .eq('id', jobId)
    .maybeSingle();

  const assignedCourierId = assignedBid?.bids?.[0]?.courier_id;

  if (!assignedBid || assignedCourierId !== user.id) return;

  let proofUrl: string | null = null;
  let proofName: string | null = null;
  if (proof && proof.size > 0) {
    const extension = proof.name.includes('.') ? proof.name.split('.').pop() : 'bin';
    const path = `${jobId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('shipment-proofs').upload(path, proof, { upsert: false });
    if (!uploadError) {
      proofUrl = path;
      proofName = proof.name;
    }
  }

  await supabase.from('job_status_events').insert({ job_id: jobId, status, note, proof_url: proofUrl, proof_name: proofName, created_by: user.id });

  if (status === 'delivered') {
    await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId);
  }

  revalidatePath(`/shipments/${jobId}`);
  revalidatePath('/courier');
  revalidatePath('/shipper');
  revalidatePath('/admin');
}

export async function reviewCourierAction(formData: FormData) {
  await requireRole(['admin']);
  const supabase = await createClient();
  const profileId = String(formData.get('profile_id') || '');
  const decision = String(formData.get('decision') || 'pending') as 'approved' | 'rejected';

  await supabase.from('profiles').update({ courier_status: decision }).eq('id', profileId);

  revalidatePath('/admin');
  revalidatePath('/courier');
}
