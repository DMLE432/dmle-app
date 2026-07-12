import Link from 'next/link';
import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { submitBidAction, updateAssignedJobStatusAction } from '@/lib/actions';
import { formatStatusLabel, getStatusTone, isCompletedShipmentStatus } from '@/lib/status';
import type { Database } from '@/types/database';

type Bid = Database['public']['Tables']['bids']['Row'];
type Job = Database['public']['Tables']['jobs']['Row'];
type JobStatus = Job['status'];
type StatusEvent = Database['public']['Tables']['job_status_events']['Row'];
type BidJob = Pick<Job, 'id' | 'title' | 'pickup_address' | 'dropoff_address' | 'pickup_at' | 'required_by'>;
type CourierBid = Bid & { job: BidJob | null };
type AssignedJob = Job & { acceptedBid: Bid; events: StatusEvent[] };
type CourierExecutionStatus = Extract<JobStatus, 'picked_up' | 'in_transit' | 'delivered'>;
type CourierSearchParams = {
  error?: string | string[];
  notice?: string | string[];
};

const NO_PHI_HELPER_TEXT =
  'Do not enter patient names, DOB, MRN, diagnosis, test results, insurance information, or specimen identifiers.';
const STATUS_NO_PHI_HELPER_TEXT = `Status updates must stay logistics-only. ${NO_PHI_HELPER_TEXT}`;
const ASSIGNED_JOB_STATUSES: JobStatus[] = ['assigned', 'picked_up', 'in_transit', 'delivered', 'completed'];
const STATUS_ACTIONS: Array<{ status: CourierExecutionStatus; currentStatus: JobStatus; label: string }> = [
  { status: 'picked_up', currentStatus: 'assigned', label: 'Mark picked up' },
  { status: 'in_transit', currentStatus: 'picked_up', label: 'Mark in transit' },
  { status: 'delivered', currentStatus: 'in_transit', label: 'Mark delivered' }
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function getMessage(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function StatusHistory({ events }: { events: StatusEvent[] }) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm font-semibold text-slate-800">Status history</p>
      {events.length ? (
        events.map((event) => (
          <article key={event.id} className="rounded-md bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-slate-900">{formatStatusLabel(event.status)}</p>
              <p className="text-xs text-slate-500">{formatDateTime(event.created_at)}</p>
            </div>
            {event.note && <p className="mt-1 text-slate-700">{event.note}</p>}
            {event.received_by_name && <p className="mt-1 text-slate-700">Received by: {event.received_by_name}</p>}
            {event.delivered_at && <p className="mt-1 text-slate-700">Delivered at: {formatDateTime(event.delivered_at)}</p>}
            {event.delivery_notes && <p className="mt-1 text-slate-700">Delivery notes: {event.delivery_notes}</p>}
          </article>
        ))
      ) : (
        <p className="text-sm text-slate-500">No status updates have been recorded for this shipment yet.</p>
      )}
    </div>
  );
}

function AssignedJobActions({ job }: { job: AssignedJob }) {
  if (isCompletedShipmentStatus(job.status)) {
    return <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Delivery complete. This shipment is read-only.</p>;
  }

  const nextAction = STATUS_ACTIONS.find((action) => action.currentStatus === job.status);

  return (
    <div className="mt-4 space-y-3">
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{STATUS_NO_PHI_HELPER_TEXT}</p>

      {job.status === 'in_transit' ? (
        <form action={updateAssignedJobStatusAction} className="space-y-2 rounded-md bg-slate-50 p-3">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="status" value="delivered" />
          <input type="hidden" name="source_path" value="/courier" />
          <label className="block text-sm font-medium text-slate-700">
            Received by name
            <input name="received_by_name" placeholder="Receiving staff or desk name" className="mt-1" required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Delivery notes
            <textarea name="delivery_notes" placeholder="Logistics-safe delivery notes" className="mt-1" rows={3} />
          </label>
          <button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
            Mark delivered
          </button>
        </form>
      ) : nextAction ? (
        <form action={updateAssignedJobStatusAction}>
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="status" value={nextAction.status} />
          <input type="hidden" name="source_path" value="/courier" />
          <button type="submit" className="bg-brand-500 text-white hover:bg-brand-700">
            {nextAction.label}
          </button>
        </form>
      ) : (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">No courier action is available for this status.</p>
      )}
    </div>
  );
}

export default async function CourierPage({ searchParams }: { searchParams: Promise<CourierSearchParams> }) {
  const { user, profile } = await requireRole(['courier']);
  const supabase = await createClient();
  const params = await searchParams;
  const errorMessage = getMessage(params.error);
  const noticeMessage = getMessage(params.notice);

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select(
      'id, shipper_id, title, pickup_address, dropoff_address, specimen_type, pickup_at, required_by, temperature_requirements, chain_of_custody_notes, special_instructions, offered_price, notes, status, accepted_bid_id, created_at'
    )
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (jobsError) {
    console.error('Courier open jobs query error:', jobsError);
  }

  const { data: bidRows, error: bidsError } = await supabase
    .from('bids')
    .select('id, job_id, courier_id, amount, eta_minutes, note, status, created_at')
    .eq('courier_id', user.id)
    .order('created_at', { ascending: false });

  if (bidsError) {
    console.error('Courier bids query error:', bidsError);
  }

  const myBids: CourierBid[] = (bidRows ?? []).map((bid) => ({ ...bid, job: null }));
  let bidJobsErrorMessage: string | null = null;

  if (myBids.length > 0) {
    const { data: bidJobs, error: bidJobsError } = await supabase
      .from('jobs')
      .select('id, title, pickup_address, dropoff_address, pickup_at, required_by')
      .in(
        'id',
        Array.from(new Set(myBids.map((bid) => bid.job_id)))
      );

    if (bidJobsError) {
      console.error('Courier bid jobs query error:', bidJobsError);
      bidJobsErrorMessage = 'Bids loaded, but shipment details could not be loaded. Please refresh or try again.';
    } else {
      const jobsById = new Map((bidJobs ?? []).map((job) => [job.id, job]));

      for (const bid of myBids) {
        bid.job = jobsById.get(bid.job_id) ?? null;
      }
    }
  }

  let assignedJobs: AssignedJob[] = [];
  let assignedJobsErrorMessage: string | null = null;
  let assignedEventsErrorMessage: string | null = null;
  const acceptedBids = myBids.filter((bid) => bid.status === 'accepted');

  if (acceptedBids.length > 0) {
    const acceptedBidsById = new Map(acceptedBids.map((bid) => [bid.id, bid]));
    const { data: assignedJobRows, error: assignedJobsError } = await supabase
      .from('jobs')
      .select(
        'id, shipper_id, title, pickup_address, dropoff_address, specimen_type, pickup_at, required_by, temperature_requirements, chain_of_custody_notes, special_instructions, offered_price, notes, status, accepted_bid_id, created_at'
      )
      .in(
        'accepted_bid_id',
        acceptedBids.map((bid) => bid.id)
      )
      .in('status', ASSIGNED_JOB_STATUSES)
      .order('created_at', { ascending: false });

    if (assignedJobsError) {
      console.error('Courier assigned jobs query error:', assignedJobsError);
      assignedJobsErrorMessage = 'Unable to load assigned shipments. Please refresh or try again.';
    } else {
      assignedJobs = (assignedJobRows ?? []).flatMap((job) => {
        const acceptedBid = job.accepted_bid_id ? acceptedBidsById.get(job.accepted_bid_id) : null;
        return acceptedBid ? [{ ...job, acceptedBid, events: [] }] : [];
      });

      if (assignedJobs.length > 0) {
        const { data: statusEvents, error: statusEventsError } = await supabase
          .from('job_status_events')
          .select('id, job_id, status, note, proof_url, proof_name, received_by_name, delivery_notes, delivered_at, created_by, created_at')
          .in(
            'job_id',
            assignedJobs.map((job) => job.id)
          )
          .order('created_at', { ascending: true });

        if (statusEventsError) {
          console.error('Courier assigned job status events query error:', statusEventsError);
          assignedEventsErrorMessage = 'Assigned shipments loaded, but status history could not be loaded. Please refresh or try again.';
        } else {
          const eventsByJobId = new Map<string, StatusEvent[]>();
          for (const event of statusEvents ?? []) {
            const jobEvents = eventsByJobId.get(event.job_id) ?? [];
            jobEvents.push(event);
            eventsByJobId.set(event.job_id, jobEvents);
          }

          assignedJobs = assignedJobs.map((job) => ({ ...job, events: eventsByJobId.get(job.id) ?? [] }));
        }
      }
    }
  }

  const canBid = profile.courier_status === 'approved';
  const bidJobIds = new Set(myBids.map((bid) => bid.job_id));
  const openJobs = jobs ?? [];

  return (
    <main className="min-h-screen bg-slate-50">
      <Header role="courier" />
      <div className="mx-auto max-w-6xl px-6 py-8">
        {errorMessage && <p className="mb-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</p>}
        {noticeMessage && <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{noticeMessage}</p>}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card title="Open shipments">
            {jobsError && <p className="mb-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700">Unable to load open shipments. Please refresh or try again.</p>}
            {!canBid && (
              <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                Your courier profile is <strong>{profile.courier_status}</strong>. Admin approval is required before bidding.
              </p>
            )}
            <div className="space-y-4">
              {openJobs.map((job) => {
                const alreadyBid = bidJobIds.has(job.id);

                return (
                  <article key={job.id} className="space-y-3 rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <Link href={`/shipments/${job.id}`} className="font-medium text-brand-700 hover:underline">
                          {job.title}
                        </Link>
                        <p className="text-xs text-slate-500">Offered price: {formatMoney(job.offered_price)}</p>
                      </div>
                      <Badge tone={getStatusTone(job.status)}>{formatStatusLabel(job.status)}</Badge>
                    </div>
                    <div className="space-y-1 text-sm text-slate-600">
                      <p>{job.pickup_address} -&gt; {job.dropoff_address}</p>
                      <p>Pickup: {formatDateTime(job.pickup_at)} - Deadline: {formatDateTime(job.required_by)}</p>
                      <p>Specimen/package: {job.specimen_type}</p>
                      {job.temperature_requirements && <p>Temperature: {job.temperature_requirements}</p>}
                      {job.chain_of_custody_notes && <p>Chain-of-custody: {job.chain_of_custody_notes}</p>}
                      {job.special_instructions && <p>Special instructions: {job.special_instructions}</p>}
                    </div>

                    {alreadyBid ? (
                      <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-600">You already submitted a bid for this shipment.</p>
                    ) : !canBid ? (
                      <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-600">Bid actions unlock after admin approval.</p>
                    ) : (
                      <form action={submitBidAction} className="grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-3">
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="number" min="1" step="0.01" name="amount" placeholder="Bid price ($)" required />
                        <input type="number" min="1" step="1" name="eta_minutes" placeholder="ETA (min)" required />
                        <div className="md:col-span-3">
                          <p className="mb-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">{NO_PHI_HELPER_TEXT}</p>
                          <input name="note" placeholder="Bid notes" />
                        </div>
                        <button type="submit" className="bg-brand-500 text-white hover:bg-brand-700">
                          Submit bid
                        </button>
                      </form>
                    )}
                  </article>
                );
              })}
              {!jobsError && !openJobs.length && <p className="text-sm text-slate-500">No open shipments are available right now. New shipper requests will appear here.</p>}
            </div>
          </Card>

          <div className="space-y-6">
            <Card title="Assigned work">
              <div className="space-y-4">
                {assignedJobsErrorMessage && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{assignedJobsErrorMessage}</p>}
                {assignedEventsErrorMessage && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{assignedEventsErrorMessage}</p>}
                {assignedJobs.length ? (
                  assignedJobs.map((job) => (
                    <article key={job.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <Link href={`/shipments/${job.id}`} className="font-medium text-brand-700 hover:underline">
                            {job.title}
                          </Link>
                          <p className="text-xs text-slate-500">Accepted bid amount: {formatMoney(job.acceptedBid.amount)}</p>
                        </div>
                        <Badge tone={getStatusTone(job.status)}>{formatStatusLabel(job.status)}</Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-slate-600">
                        <p>{job.pickup_address} -&gt; {job.dropoff_address}</p>
                        <p>Pickup: {formatDateTime(job.pickup_at)} - Deadline: {formatDateTime(job.required_by)}</p>
                        <p>Specimen/package: {job.specimen_type}</p>
                        {job.temperature_requirements && <p>Temperature: {job.temperature_requirements}</p>}
                        {job.chain_of_custody_notes && <p>Chain-of-custody: {job.chain_of_custody_notes}</p>}
                        {job.special_instructions && <p>Special instructions: {job.special_instructions}</p>}
                      </div>
                      <AssignedJobActions job={job} />
                      <StatusHistory events={job.events} />
                    </article>
                  ))
                ) : (
                  !assignedJobsErrorMessage && (
                    <p className="text-sm text-slate-500">No assigned shipments yet. Accepted bids will appear here for pickup and delivery updates.</p>
                  )
                )}
              </div>
            </Card>

            <Card title="My bids">
              <div className="space-y-3">
                {bidsError && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">Unable to load your bids. Please refresh or try again.</p>}
                {bidJobsErrorMessage && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{bidJobsErrorMessage}</p>}
                {myBids.length ? (
                  myBids.map((bid) => (
                    <article key={bid.id} className="rounded-lg border border-slate-200 p-3">
                      <Link href={`/shipments/${bid.job_id}`} className="font-medium text-brand-700 hover:underline">
                        {bid.job?.title ?? 'Shipment details unavailable'}
                      </Link>
                      <p className="text-sm text-slate-600">{formatMoney(bid.amount)} - ETA {bid.eta_minutes} min</p>
                      {bid.job && (
                        <p className="mt-1 text-xs text-slate-500">
                          {bid.job.pickup_address} -&gt; {bid.job.dropoff_address}
                        </p>
                      )}
                      <div className="mt-2">
                        <Badge tone={getStatusTone(bid.status)}>{formatStatusLabel(bid.status)}</Badge>
                      </div>
                    </article>
                  ))
                ) : (
                  !bidsError && <p className="text-sm text-slate-500">No bids submitted yet. Submit a bid on an open shipment to track it here.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
