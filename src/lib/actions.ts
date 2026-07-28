'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createActionClient } from '@/lib/supabase/server';
import {
  notifyApprovedCouriersOfNewShipment,
  notifyBidAccepted,
  notifyCourierReview,
  notifyCourierSignupPending,
  notifyShipperOfNewBid,
  notifyShipperOfStatusUpdate
} from '@/lib/email';
import { getDashboardRedirectPath, requireRole } from '@/lib/auth';
import { formatStatusLabel } from '@/lib/status';
import type { Database } from '@/types/database';

type JobInsert = Database['public']['Tables']['jobs']['Insert'];
type JobStatus = Database['public']['Tables']['jobs']['Row']['status'];
type CourierExecutionStatus = Extract<JobStatus, 'picked_up' | 'in_transit' | 'delivered'>;
type AssignedWorkflowStatus = Extract<JobStatus, 'assigned' | 'picked_up' | 'in_transit'>;
const COURIER_EXECUTION_STATUSES = ['picked_up', 'in_transit', 'delivered'] as const satisfies readonly CourierExecutionStatus[];
const NEXT_COURIER_STATUS: Record<AssignedWorkflowStatus, CourierExecutionStatus> = {
  assigned: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered'
};
const STATUS_EVENT_NOTES: Record<CourierExecutionStatus, string> = {
  picked_up: 'Courier marked the shipment picked up.',
  in_transit: 'Courier marked the shipment in transit.',
  delivered: 'Courier marked the shipment delivered.'
};
const NO_PHI_MESSAGE =
  'Use logistics-only details. Do not enter patient names, DOB, MRN, diagnosis, test results, insurance information, or specimen identifiers.';
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

function redirectWithNotice(path: string, message: string): never {
  redirect(`${path}?notice=${encodeURIComponent(message)}`);
}

function redirectWithLoggedError(path: string, logMessage: string, error: unknown, userMessage: string): never {
  console.error(logMessage, error);
  redirectWithError(path, userMessage);
}

async function runNotification(label: string, notification: () => Promise<void>) {
  try {
    await notification();
  } catch (error) {
    console.error(`${label} notification failed:`, error);
  }
}

function isDuplicateBidError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as { code?: string; message?: string };
  return maybeError.code === '23505' || maybeError.message?.includes('bids_job_id_courier_id_key') === true;
}

function getSignUpErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'Unable to create account. Please check the form and try again.';
  }

  const message = String((error as { message?: string }).message || '').toLowerCase();

  if (message.includes('already') || message.includes('registered')) {
    return 'An account may already exist for this email. Try logging in instead.';
  }

  if (message.includes('password')) {
    return 'Unable to create account. Use a password of at least 8 characters.';
  }

  return 'Unable to create account. Please check the details and try again.';
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

function getMissingRequiredFieldMessage(fields: Array<{ label: string; value: string }>) {
  const missingField = fields.find((field) => !field.value.trim());

  if (!missingField) return null;

  return `Unable to create shipment. Please enter ${missingField.label}.`;
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const fullName = String(formData.get('full_name') || '').trim();
  const rawRole = String(formData.get('role') || 'shipper');
  const role = rawRole === 'courier' ? 'courier' : 'shipper';
  const organization = String(formData.get('organization_name') || '').trim();

  if (!email || !password || !fullName) {
    redirectWithError('/signup', 'Unable to create account. Please enter your name, email, and password.');
  }

  const supabase = await createActionClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    console.error('Supabase signup error:', error);
    redirectWithError('/signup', getSignUpErrorMessage(error));
  }

  if (!data.user) {
    console.error('Signup error: no user returned from Supabase signup');
    redirectWithError('/signup', 'Unable to finish account setup. Please try again.');
  }

  const courierStatus = role === 'courier' ? 'pending' : null;

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    email,
    full_name: fullName,
    role,
    organization_name: organization || null,
    courier_status: courierStatus
  });

  if (profileError) {
    console.error('Profile insert error:', profileError);
    redirectWithError('/signup', 'Account created, but profile setup could not be completed. Please contact support.');
  }

  if (role === 'courier') {
    await runNotification('Courier signup approval needed', () =>
      notifyCourierSignupPending({
        courierName: fullName,
        organizationName: organization || null,
        courierEmail: email
      })
    );
  }

  revalidatePath('/', 'layout');
  redirect(getDashboardRedirectPath({ role, courier_status: courierStatus }));
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const supabase = await createActionClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=Invalid login credentials');
  }

  if (!data.user || !data.session) {
    redirectWithError('/login', 'Unable to create a login session. Please try again.');
  }

  const { data: profile, error: profileError } = await supabase.from('profiles').select('role, courier_status').eq('id', data.user.id).single();

  if (profileError || !profile) {
    console.error('Profile lookup after login failed:', profileError);
    redirectWithError('/login', 'Unable to load your profile. Please contact support.');
  }

  revalidatePath('/', 'layout');
  redirect(getDashboardRedirectPath(profile));
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value || '').trim();
  return text || null;
}

function isCourierExecutionStatus(status: string): status is CourierExecutionStatus {
  return COURIER_EXECUTION_STATUSES.includes(status as CourierExecutionStatus);
}

function isAssignedWorkflowStatus(status: JobStatus): status is AssignedWorkflowStatus {
  return status === 'assigned' || status === 'picked_up' || status === 'in_transit';
}

export async function createShipmentAction(formData: FormData) {
  const supabase = await createActionClient();
  const title = String(formData.get('title') || '').trim();
  const pickupAddress = String(formData.get('pickup_address') || '').trim();
  const dropoffAddress = String(formData.get('dropoff_address') || '').trim();
  const specimenType = String(formData.get('specimen_type') || '').trim();
  const pickupAt = String(formData.get('pickup_at') || '').trim();
  const requiredBy = String(formData.get('required_by') || '').trim();
  const offeredPriceInput = String(formData.get('offered_price') || '').trim();
  const offeredPrice = Number(offeredPriceInput);
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

  const missingShipmentFieldMessage = getMissingRequiredFieldMessage([
    { label: 'a shipment title', value: title },
    { label: 'a pickup address', value: pickupAddress },
    { label: 'a delivery address', value: dropoffAddress },
    { label: 'a package or item category', value: specimenType },
    { label: 'a pickup date and time', value: pickupAt },
    { label: 'a delivery deadline', value: requiredBy }
  ]);

  if (missingShipmentFieldMessage) {
    redirectWithError('/shipper', missingShipmentFieldMessage);
  }

  if (Number.isNaN(Date.parse(pickupAt)) || Number.isNaN(Date.parse(requiredBy))) {
    redirectWithError('/shipper', 'Unable to create shipment. Please enter valid pickup and delivery dates.');
  }

  if (!offeredPriceInput) {
    redirectWithError('/shipper', 'Unable to create shipment. Please enter an offered price.');
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

  await runNotification('New shipment available', () =>
    notifyApprovedCouriersOfNewShipment({
      id: insertedJob.id,
      title,
      pickupAddress,
      dropoffAddress,
      pickupAt,
      requiredBy,
      offeredPrice
    })
  );

  revalidatePath('/shipper');
  revalidatePath('/courier');
  revalidatePath('/admin');
  redirectWithNotice('/shipper', 'Shipment published. Couriers can now submit bids.');
}

export async function submitBidAction(formData: FormData) {
  const { user, profile } = await requireRole(['courier']);
  const supabase = await createActionClient();
  const jobId = String(formData.get('job_id') || '');
  const amountInput = String(formData.get('amount') || '').trim();
  const etaInput = String(formData.get('eta_minutes') || '').trim();
  const amount = Number(amountInput);
  const etaMinutes = Number(etaInput);
  const note = optionalText(formData.get('note'));

  if (profile.courier_status !== 'approved') {
    redirectWithError('/courier', 'Admin approval is required before bidding.');
  }

  if (!jobId) {
    redirectWithError('/courier', 'Unable to submit bid. Missing shipment details.');
  }

  if (!amountInput) {
    redirectWithError('/courier', 'Unable to submit bid. Please enter a bid price.');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    redirectWithError('/courier', 'Unable to submit bid. Bid price must be greater than zero.');
  }

  if (!etaInput) {
    redirectWithError('/courier', 'Unable to submit bid. Please enter an ETA in minutes.');
  }

  if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) {
    redirectWithError('/courier', 'Unable to submit bid. ETA must be greater than zero.');
  }

  const phiError = validateNoPhiLabels({ 'Bid notes': note });
  if (phiError) {
    redirectWithError('/courier', phiError);
  }

  const { data: existingBid, error: existingBidError } = await supabase
    .from('bids')
    .select('id')
    .eq('job_id', jobId)
    .eq('courier_id', user.id)
    .maybeSingle();

  if (existingBidError) {
    console.error('Existing bid lookup error:', existingBidError);
  }

  if (existingBid) {
    redirectWithNotice('/courier', 'You already submitted a bid for this shipment. Track it under My bids.');
  }

  const { data: submittedBid, error } = await supabase.from('bids').insert({
    job_id: jobId,
    courier_id: user.id,
    amount,
    eta_minutes: etaMinutes,
    note,
    status: 'pending'
  }).select('id').single();

  if (error) {
    if (isDuplicateBidError(error)) {
      redirectWithNotice('/courier', 'You already submitted a bid for this shipment. Track it under My bids.');
    }

    redirectWithLoggedError('/courier', 'Submit bid error:', error, 'Unable to submit bid. Please check your bid and try again.');
  }

  if (!submittedBid) {
    console.error('Submit bid error: insert returned no row');
    redirectWithError('/courier', 'Unable to submit bid. Please try again.');
  }

  await runNotification('New bid received', () =>
    notifyShipperOfNewBid({
      jobId,
      amount,
      etaMinutes,
      note
    })
  );

  revalidatePath('/courier');
  revalidatePath('/shipper');
  revalidatePath('/admin');
  redirectWithNotice('/courier', 'Bid submitted. Track it under My bids.');
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

  await runNotification('Bid accepted', () => notifyBidAccepted({ jobId, bidId }));

  revalidatePath('/shipper');
  revalidatePath('/courier');
  revalidatePath('/admin');
  revalidatePath(`/shipments/${jobId}`);
  redirectWithNotice('/shipper', 'Bid accepted. Shipment assigned to the courier.');
}

export async function updateAssignedJobStatusAction(formData: FormData) {
  const { user } = await requireRole(['courier']);
  const supabase = await createActionClient();
  const jobId = String(formData.get('job_id') || '').trim();
  const status = String(formData.get('status') || '').trim();
  const receivedByName = optionalText(formData.get('received_by_name'));
  const deliveryNotes = optionalText(formData.get('delivery_notes'));
  const sourcePath = String(formData.get('source_path') || '/courier');
  const redirectPath = sourcePath.startsWith('/shipments/') ? sourcePath : '/courier';

  if (!jobId) {
    redirectWithError(redirectPath, 'Unable to update shipment status. Missing shipment details.');
  }

  if (!isCourierExecutionStatus(status)) {
    redirectWithError(redirectPath, 'Unable to update shipment status. Invalid status.');
  }

  const phiError = validateNoPhiLabels({
    'Received by name': receivedByName,
    'Delivery notes': deliveryNotes
  });

  if (phiError) {
    redirectWithError(redirectPath, phiError);
  }

  if (status === 'delivered' && !receivedByName) {
    redirectWithError(redirectPath, 'Unable to mark delivered. Please enter the logistics-safe name of the receiving staff member, desk, or department.');
  }

  if (status === 'delivered' && !deliveryNotes) {
    redirectWithError(redirectPath, 'Unable to mark delivered. Please enter logistics-safe delivery notes for the text-only POD.');
  }

  const { data: job, error: jobLookupError } = await supabase
    .from('jobs')
    .select('id, status, accepted_bid_id')
    .eq('id', jobId)
    .maybeSingle();

  if (jobLookupError) {
    redirectWithLoggedError(redirectPath, 'Assigned shipment lookup error:', jobLookupError, 'Unable to verify shipment assignment. Please try again.');
  }

  if (!job?.accepted_bid_id) {
    redirectWithError(redirectPath, 'Unable to update shipment status. This shipment is not assigned to your courier account.');
  }

  const { data: acceptedBid, error: bidLookupError } = await supabase
    .from('bids')
    .select('id')
    .eq('id', job.accepted_bid_id)
    .eq('courier_id', user.id)
    .eq('status', 'accepted')
    .maybeSingle();

  if (bidLookupError) {
    redirectWithLoggedError(redirectPath, 'Accepted bid lookup error:', bidLookupError, 'Unable to verify shipment assignment. Please try again.');
  }

  if (!acceptedBid) {
    redirectWithError(redirectPath, 'Unable to update shipment status. This shipment is not assigned to your courier account.');
  }

  if (!isAssignedWorkflowStatus(job.status)) {
    redirectWithError(redirectPath, 'Unable to update shipment status. This shipment is not ready for that update.');
  }

  const expectedStatus = NEXT_COURIER_STATUS[job.status];
  if (status !== expectedStatus) {
    redirectWithError(redirectPath, 'Unable to update shipment status. Please complete the assigned workflow in order.');
  }

  const { data: updatedJob, error: updateJobError } = await supabase
    .from('jobs')
    .update({ status })
    .eq('id', jobId)
    .eq('status', job.status)
    .select('id')
    .maybeSingle();

  if (updateJobError) {
    redirectWithLoggedError(redirectPath, 'Shipment status update error:', updateJobError, 'Unable to update shipment status. Please try again.');
  }

  if (!updatedJob) {
    redirectWithError(redirectPath, 'Unable to update shipment status. The shipment status changed while you were working. Please refresh and try again.');
  }

  const statusTimestamp = new Date().toISOString();
  const deliveredAt = status === 'delivered' ? statusTimestamp : null;
  const eventNote = status === 'delivered' ? deliveryNotes || STATUS_EVENT_NOTES.delivered : STATUS_EVENT_NOTES[status];
  const { error: statusEventError } = await supabase.from('job_status_events').insert({
    job_id: jobId,
    status,
    note: eventNote,
    proof_url: null,
    proof_name: null,
    received_by_name: status === 'delivered' ? receivedByName : null,
    delivery_notes: status === 'delivered' ? deliveryNotes : null,
    delivered_at: deliveredAt,
    created_by: user.id,
    created_at: statusTimestamp
  });

  if (statusEventError) {
    redirectWithLoggedError(redirectPath, 'Shipment status event error:', statusEventError, 'Shipment status changed, but the status history could not be recorded. Please contact admin.');
  }

  await runNotification('Shipment status update', () =>
    notifyShipperOfStatusUpdate({
      jobId,
      status,
      timestamp: statusTimestamp,
      statusNote: eventNote,
      receivedByName: status === 'delivered' ? receivedByName : null,
      deliveryNotes: status === 'delivered' ? deliveryNotes : null
    })
  );

  revalidatePath(`/shipments/${jobId}`);
  revalidatePath('/courier');
  revalidatePath('/shipper');
  revalidatePath('/admin');
  redirectWithNotice(redirectPath, `Status updated: shipment marked ${formatStatusLabel(status).toLowerCase()}.`);
}

export async function reviewCourierAction(formData: FormData) {
  await requireRole(['admin']);
  const supabase = await createActionClient();
  const profileId = String(formData.get('profile_id') || '');
  const decision = String(formData.get('decision') || '');

  if (!profileId || (decision !== 'approved' && decision !== 'rejected')) {
    redirectWithError('/admin', 'Unable to update courier review. Missing courier or review decision.');
  }

  const { data: reviewedCourier, error } = await supabase
    .from('profiles')
    .update({ courier_status: decision })
    .eq('id', profileId)
    .eq('role', 'courier')
    .select('id, email, full_name')
    .maybeSingle();

  if (error) {
    redirectWithLoggedError('/admin', 'Review courier error:', error, 'Unable to update courier review. Please try again.');
  }

  if (!reviewedCourier) {
    redirectWithError('/admin', 'Unable to update courier review. The courier profile was not found.');
  }

  await runNotification('Courier review', () =>
    notifyCourierReview({
      courierEmail: reviewedCourier.email,
      courierName: reviewedCourier.full_name,
      decision
    })
  );

  revalidatePath('/admin');
  revalidatePath('/courier');
  redirectWithNotice('/admin', `Courier ${reviewedCourier.full_name || 'profile'} ${decision}.`);
}
