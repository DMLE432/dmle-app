'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDashboardPath, requireRole } from '@/lib/auth';

const COURIER_STATUSES = ['accepted', 'en_route_to_pickup', 'picked_up', 'in_transit', 'delivered'] as const;
const NO_PHI_MESSAGE =
  'Do not enter patient names, DOB, MRN, diagnosis, test results, insurance information, or specimen identifiers.';
const PHI_LABEL_PATTERNS = [
  { label: 'patient name', pattern: /patient\s*name/i },
  { label: 'DOB', pattern: /\bdob\b/i },
  { label: 'date of birth', pattern: /date\s*of\s*birth/i },
  { label: 'MRN', pattern: /\bmrn\b/i },
  { label: 'medical record', pattern: /medical\s*record/i },
  { label: 'SSN', pattern: /\bssn\b/i },
  { label: 'Social Security', pattern: /social\s*security/i },
  { label: 'diagnosis', pattern: /diagnosis/i },
  { label: 'ICD', pattern: /\bicd\b/i },
  { label: 'insurance', pattern: /insurance/i },
  { label: 'test result', pattern: /test\s*result/i },
  { label: 'lab result', pattern: /lab\s*result/i },
  { label: 'patient ID', pattern: /patient\s*id/i },
  { label: 'specimen ID', pattern: /specimen\s*id/i }
] as const;

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function validateNoPhiLabels(fields: Record<string, string | null>) {
  for (const [fieldName, value] of Object.entries(fields)) {
    if (!value) continue;

    const match = PHI_LABEL_PATTERNS.find(({ pattern }) => pattern.test(value));
    if (match) {
      return `${fieldName} cannot include the PHI label "${match.label}". ${NO_PHI_MESSAGE}`;
    }
  }

  return null;
}

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
  const title = String(formData.get('title') || '').trim();
  const pickupAddress = String(formData.get('pickup_address') || '').trim();
  const dropoffAddress = String(formData.get('dropoff_address') || '').trim();
  const specimenType = String(formData.get('specimen_type') || '').trim();
  const temperatureRequirements = optionalText(formData.get('temperature_requirements'));
  const chainOfCustodyNotes = optionalText(formData.get('chain_of_custody_notes'));
  const specialInstructions = optionalText(formData.get('special_instructions'));
  const notes = optionalText(formData.get('notes'));

  const phiError = validateNoPhiLabels({
    'Shipment title': title,
    'Pickup address': pickupAddress,
    'Delivery address': dropoffAddress,
    'Package/item category': specimenType,
    'Temperature requirements': temperatureRequirements,
    'Chain-of-custody notes': chainOfCustodyNotes,
    'Special instructions': specialInstructions,
    'Logistics notes': notes
  });

  if (phiError) {
    redirectWithError('/shipper', phiError);
  }

  const { error } = await supabase.from('jobs').insert({
    shipper_id: user.id,
    title,
    pickup_address: pickupAddress,
    dropoff_address: dropoffAddress,
    specimen_type: specimenType,
    pickup_at: String(formData.get('pickup_at') || ''),
    required_by: String(formData.get('required_by') || ''),
    temperature_requirements: temperatureRequirements,
    chain_of_custody_notes: chainOfCustodyNotes,
    special_instructions: specialInstructions,
    offered_price: Number(formData.get('offered_price') || 0),
    notes,
    status: 'open'
  });

  if (error) {
    console.error('Create shipment error:', error);
    redirectWithError('/shipper', `Unable to create shipment: ${error.message}`);
  }

  revalidatePath('/shipper');
  revalidatePath('/courier');
  revalidatePath('/admin');
}

export async function submitBidAction(formData: FormData) {
  const { user } = await requireRole(['courier']);
  const supabase = await createClient();
  const note = optionalText(formData.get('note'));

  const phiError = validateNoPhiLabels({ 'Bid notes': note });
  if (phiError) {
    redirectWithError('/courier', phiError);
  }

  const { error } = await supabase.from('bids').insert({
    job_id: String(formData.get('job_id') || ''),
    courier_id: user.id,
    amount: Number(formData.get('amount') || 0),
    eta_minutes: Number(formData.get('eta_minutes') || 0),
    note,
    status: 'pending'
  });

  if (error) {
    console.error('Submit bid error:', error);
    redirectWithError('/courier', `Unable to submit bid: ${error.message}`);
  }

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
  const errorPath = jobId ? `/shipments/${jobId}` : '/courier';

  const phiError = validateNoPhiLabels({
    'Delivery note': note,
    'Proof filename': proof?.name || null
  });

  if (phiError) {
    redirectWithError(errorPath, phiError);
  }

  if (!COURIER_STATUSES.includes(status as (typeof COURIER_STATUSES)[number])) {
    redirectWithError(errorPath, 'Unable to save status update: invalid shipment status.');
  }

  const { data: assignedBid, error: assignedBidError } = await supabase
    .from('jobs')
    .select('id, accepted_bid_id, bids!jobs_accepted_bid_id_fkey(courier_id)')
    .eq('id', jobId)
    .maybeSingle();

  if (assignedBidError) {
    console.error('Shipment assignment lookup error:', assignedBidError);
    redirectWithError(errorPath, `Unable to verify shipment assignment: ${assignedBidError.message}`);
  }

  const assignedCourierId = assignedBid?.bids?.[0]?.courier_id;

  if (!assignedBid || assignedCourierId !== user.id) {
    redirectWithError(errorPath, 'Unable to save status update: this shipment is not assigned to your courier account.');
  }

  let proofUrl: string | null = null;
  let proofName: string | null = null;
  if (proof && proof.size > 0) {
    const extension = proof.name.includes('.') ? proof.name.split('.').pop() : 'bin';
    const path = `${jobId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('shipment-proofs').upload(path, proof, { upsert: false });
    if (uploadError) {
      console.error('Proof upload error:', uploadError);
      redirectWithError(errorPath, `Unable to upload proof of delivery: ${uploadError.message}`);
    }

    proofUrl = path;
    proofName = proof.name;
  }

  const { error: statusEventError } = await supabase
    .from('job_status_events')
    .insert({ job_id: jobId, status, note, proof_url: proofUrl, proof_name: proofName, created_by: user.id });

  if (statusEventError) {
    console.error('Shipment status event error:', statusEventError);
    redirectWithError(errorPath, `Unable to save status update: ${statusEventError.message}`);
  }

  if (status === 'delivered') {
    const { error: completeJobError } = await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId);

    if (completeJobError) {
      console.error('Complete shipment error:', completeJobError);
      redirectWithError(errorPath, `Unable to mark shipment completed: ${completeJobError.message}`);
    }
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
