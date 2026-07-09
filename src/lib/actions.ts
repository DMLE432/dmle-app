'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createActionClient } from '@/lib/supabase/server';
import { getDashboardPath, requireRole } from '@/lib/auth';
import type { Database } from '@/types/database';

const COURIER_STATUSES = ['accepted', 'en_route_to_pickup', 'picked_up', 'in_transit', 'delivered'] as const;
type JobInsert = Database['public']['Tables']['jobs']['Insert'];
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

function redirectWithLoggedError(path: string, logMessage: string, error: unknown, userMessage: string): never {
  console.error(logMessage, error);
  redirectWithError(path, userMessage);
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

  const supabase = await createActionClient();
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

  revalidatePath('/', 'layout');
  redirect(role === 'courier' ? '/courier?notice=Approval pending' : '/shipper');
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const supabase = await createActionClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=Invalid login credentials');
  }

  if (!data.user || !data.session) {
    redirectWithError('/login', 'Unable to create a login session. Please try again.');
  }

  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();

  if (profileError || !profile) {
    console.error('Profile lookup after login failed:', profileError);
    redirectWithError('/login', 'Unable to load your profile. Please contact support.');
  }

  revalidatePath('/', 'layout');
  redirect(getDashboardPath(profile.role));
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value || '').trim();
  return text || null;
}

export async function createShipmentAction(formData: FormData) {
  const supabase = await createActionClient();
  const title = String(formData.get('title') || '').trim();
  const pickupAddress = String(formData.get('pickup_address') || '').trim();
  const dropoffAddress = String(formData.get('dropoff_address') || '').trim();
  const specimenType = String(formData.get('specimen_type') || '').trim();
  const pickupAt = String(formData.get('pickup_at') || '').trim();
  const requiredBy = String(formData.get('required_by') || '').trim();
  const offeredPrice = Number(formData.get('offered_price') || 0);
  const temperatureRequirements = optionalText(formData.get('temperature_requirements'));
  const chainOfCustodyNotes = optionalText(formData.get('chain_of_custody_notes'));
  const specialInstructions = optionalText(formData.get('special_instructions'));
  const notes = optionalText(formData.get('notes'));

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    console.error('Create shipment user lookup error:', userError);
  }

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  if (profileError || !profile) {
    redirectWithLoggedError('/shipper', 'Create shipment profile lookup error:', profileError, 'Unable to verify your shipper profile. Please try again.');
  }

  if (profile.role !== 'shipper') {
    redirect('/dashboard');
  }

  if (!title || !pickupAddress || !dropoffAddress || !specimenType || !pickupAt || !requiredBy) {
    redirectWithError('/shipper', 'Unable to create shipment. Please complete all required fields.');
  }

  if (Number.isNaN(Date.parse(pickupAt)) || Number.isNaN(Date.parse(requiredBy))) {
    redirectWithError('/shipper', 'Unable to create shipment. Please enter valid pickup and delivery dates.');
  }

  if (!Number.isFinite(offeredPrice) || offeredPrice <= 0) {
    redirectWithError('/shipper', 'Unable to create shipment. Offered price must be greater than zero.');
  }

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

  const shipment: JobInsert = {
    shipper_id: user.id,
    title,
    pickup_address: pickupAddress,
    dropoff_address: dropoffAddress,
    specimen_type: specimenType,
    pickup_at: pickupAt,
    required_by: requiredBy,
    temperature_requirements: temperatureRequirements,
    chain_of_custody_notes: chainOfCustodyNotes,
    special_instructions: specialInstructions,
    offered_price: offeredPrice,
    notes,
    status: 'open'
  };

  const { data: insertedJob, error } = await supabase.from('jobs').insert(shipment).select('id').single();

  if (error) {
    redirectWithLoggedError('/shipper', 'Create shipment error:', error, 'Unable to create shipment. Please check the details and try again.');
  }

  if (!insertedJob) {
    console.error('Create shipment error: insert returned no row');
    redirectWithError('/shipper', 'Unable to create shipment. Please try again.');
  }

  revalidatePath('/shipper');
  revalidatePath('/courier');
  revalidatePath('/admin');
  redirect('/shipper?notice=Shipment%20published');
}

export async function submitBidAction(formData: FormData) {
  const { user } = await requireRole(['courier']);
  const supabase = await createActionClient();
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
    redirectWithLoggedError('/courier', 'Submit bid error:', error, 'Unable to submit bid. Please check your bid and try again.');
  }

  revalidatePath('/courier');
  revalidatePath('/shipper');
  revalidatePath('/admin');
}

export async function acceptBidAction(formData: FormData) {
  const { user } = await requireRole(['shipper']);
  const supabase = await createActionClient();
  const jobId = String(formData.get('job_id') || '');
  const bidId = String(formData.get('bid_id') || '');

  if (!jobId || !bidId) {
    redirectWithError('/shipper', 'Unable to accept bid. Missing shipment or bid details.');
  }

  const { data: openJob, error: openJobError } = await supabase.from('jobs').select('id').eq('id', jobId).eq('status', 'open').maybeSingle();

  if (openJobError) {
    redirectWithLoggedError('/shipper', 'Accept bid job lookup error:', openJobError, 'Unable to accept bid. Please try again.');
  }

  if (!openJob) {
    redirectWithError('/shipper', 'Unable to accept bid. This shipment is no longer open.');
  }

  const { data: bidToAccept, error: bidLookupError } = await supabase
    .from('bids')
    .select('id')
    .eq('id', bidId)
    .eq('job_id', jobId)
    .maybeSingle();

  if (bidLookupError) {
    redirectWithLoggedError('/shipper', 'Accept bid lookup error:', bidLookupError, 'Unable to accept bid. Please try again.');
  }

  if (!bidToAccept) {
    redirectWithError('/shipper', 'Unable to accept bid. The bid was not found or is no longer available.');
  }

  const { data: acceptedBid, error: acceptBidError } = await supabase
    .from('bids')
    .update({ status: 'accepted' })
    .eq('id', bidId)
    .eq('job_id', jobId)
    .select('id')
    .maybeSingle();

  if (acceptBidError) {
    redirectWithLoggedError('/shipper', 'Accept bid update error:', acceptBidError, 'Unable to accept bid. Please try again.');
  }

  if (!acceptedBid) {
    redirectWithError('/shipper', 'Unable to accept bid. The bid could not be updated.');
  }

  const { error: declineBidsError } = await supabase.from('bids').update({ status: 'declined' }).eq('job_id', jobId).neq('id', bidId).eq('status', 'pending');

  if (declineBidsError) {
    redirectWithLoggedError('/shipper', 'Decline competing bids error:', declineBidsError, 'Bid was accepted, but competing bids could not be declined. Please contact admin.');
  }

  const { data: assignedJob, error: assignJobError } = await supabase
    .from('jobs')
    .update({ status: 'assigned', accepted_bid_id: bidId })
    .eq('id', jobId)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();

  if (assignJobError) {
    redirectWithLoggedError('/shipper', 'Assign shipment error:', assignJobError, 'Bid was accepted, but the shipment could not be assigned. Please contact admin.');
  }

  if (!assignedJob) {
    redirectWithError('/shipper', 'Bid was accepted, but the shipment was not assigned because it is no longer open. Please contact admin.');
  }

  const { error: statusEventError } = await supabase.from('job_status_events').insert({
    job_id: jobId,
    status: 'assigned',
    note: 'Bid accepted by shipper. Shipment assigned to courier.',
    created_by: user.id
  });

  if (statusEventError) {
    console.error('Assignment status event error:', statusEventError);
    revalidatePath('/shipper');
    revalidatePath('/courier');
    revalidatePath('/admin');
    revalidatePath(`/shipments/${jobId}`);
    redirectWithError('/shipper', 'Bid was accepted, but the assignment timeline could not be recorded. Please contact admin.');
  }

  revalidatePath('/shipper');
  revalidatePath('/courier');
  revalidatePath('/admin');
  revalidatePath(`/shipments/${jobId}`);
}

export async function addShipmentStatusAction(formData: FormData) {
  const { user } = await requireRole(['courier']);
  const supabase = await createActionClient();
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
    redirectWithLoggedError(errorPath, 'Shipment assignment lookup error:', assignedBidError, 'Unable to verify shipment assignment. Please try again.');
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
      redirectWithLoggedError(errorPath, 'Proof upload error:', uploadError, 'Unable to upload proof of delivery. Please try again with a logistics-safe file.');
    }

    proofUrl = path;
    proofName = proof.name;
  }

  const { error: statusEventError } = await supabase
    .from('job_status_events')
    .insert({ job_id: jobId, status, note, proof_url: proofUrl, proof_name: proofName, created_by: user.id });

  if (statusEventError) {
    redirectWithLoggedError(errorPath, 'Shipment status event error:', statusEventError, 'Unable to save status update. Please try again.');
  }

  if (status === 'delivered') {
    const { data: completedJob, error: completeJobError } = await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId).select('id').maybeSingle();

    if (completeJobError) {
      console.error('Complete shipment error:', completeJobError);
      revalidatePath(`/shipments/${jobId}`);
      revalidatePath('/courier');
      revalidatePath('/shipper');
      revalidatePath('/admin');
      redirectWithError(errorPath, 'Status update was saved, but the shipment could not be marked completed. Please contact admin.');
    }

    if (!completedJob) {
      revalidatePath(`/shipments/${jobId}`);
      revalidatePath('/courier');
      revalidatePath('/shipper');
      revalidatePath('/admin');
      redirectWithError(errorPath, 'Status update was saved, but the shipment could not be marked completed. Please contact admin.');
    }
  }

  revalidatePath(`/shipments/${jobId}`);
  revalidatePath('/courier');
  revalidatePath('/shipper');
  revalidatePath('/admin');
}

export async function reviewCourierAction(formData: FormData) {
  await requireRole(['admin']);
  const supabase = await createActionClient();
  const profileId = String(formData.get('profile_id') || '');
  const decision = String(formData.get('decision') || '');

  if (!profileId || (decision !== 'approved' && decision !== 'rejected')) {
    redirectWithError('/admin', 'Unable to update courier review. Missing courier or review decision.');
  }

  const { data: reviewedCourier, error } = await supabase.from('profiles').update({ courier_status: decision }).eq('id', profileId).select('id').maybeSingle();

  if (error) {
    redirectWithLoggedError('/admin', 'Review courier error:', error, 'Unable to update courier review. Please try again.');
  }

  if (!reviewedCourier) {
    redirectWithError('/admin', 'Unable to update courier review. The courier profile was not found.');
  }

  revalidatePath('/admin');
  revalidatePath('/courier');
}
