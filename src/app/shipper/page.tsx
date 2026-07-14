import Link from 'next/link';
import { Header } from '@/components/header';
import { Card, EmptyState, Notice, StatusBadge } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { acceptBidAction, createShipmentAction } from '@/lib/actions';
import { isCompletedShipmentStatus } from '@/lib/status';
import { createClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

type Bid = Database['public']['Tables']['bids']['Row'];
type Job = Database['public']['Tables']['jobs']['Row'];
type StatusEvent = Database['public']['Tables']['job_status_events']['Row'];
type ShipperJob = Job & { bids: Bid[]; events: StatusEvent[] };
type ShipperSearchParams = {
  error?: string | string[];
  notice?: string | string[];
};

const NO_PHI_HELPER_TEXT =
  'Do not enter patient names, DOB, MRN, diagnosis, test results, insurance information, or specimen identifiers.';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function getErrorMessage(error?: string | string[]) {
  return Array.isArray(error) ? error[0] : error;
}

export default async function ShipperPage({ searchParams }: { searchParams: Promise<ShipperSearchParams> }) {
  const { user } = await requireRole(['shipper']);
  const supabase = await createClient();
  const params = await searchParams;
  const errorMessage = getErrorMessage(params.error);
  const noticeMessage = getErrorMessage(params.notice);

  const { data: jobRows, error: jobsError } = await supabase
    .from('jobs')
    .select(
      'id, shipper_id, title, pickup_address, dropoff_address, specimen_type, pickup_at, required_by, temperature_requirements, chain_of_custody_notes, special_instructions, offered_price, notes, status, accepted_bid_id, created_at'
    )
    .eq('shipper_id', user.id)
    .order('created_at', { ascending: false });

  if (jobsError) {
    console.error('Shipper jobs query error:', jobsError);
  }

  const jobs: ShipperJob[] = (jobRows ?? []).map((job) => ({ ...job, bids: [], events: [] }));
  let bidsErrorMessage: string | null = null;
  let statusEventsErrorMessage: string | null = null;

  if (jobs.length > 0) {
    const { data: bids, error: bidsError } = await supabase
      .from('bids')
      .select('id, job_id, courier_id, amount, eta_minutes, note, status, created_at')
      .in(
        'job_id',
        jobs.map((job) => job.id)
      )
      .order('created_at', { ascending: false });

    if (bidsError) {
      console.error('Shipper bids query error:', bidsError);
      bidsErrorMessage = 'Shipments loaded, but bids could not be loaded. Please refresh or try again.';
    } else {
      const bidsByJobId = new Map<string, Bid[]>();

      for (const bid of bids ?? []) {
        const jobBids = bidsByJobId.get(bid.job_id) ?? [];
        jobBids.push(bid);
        bidsByJobId.set(bid.job_id, jobBids);
      }

      for (const job of jobs) {
        job.bids = bidsByJobId.get(job.id) ?? [];
      }
    }

    const { data: statusEvents, error: statusEventsError } = await supabase
      .from('job_status_events')
      .select('id, job_id, status, note, proof_url, proof_name, received_by_name, delivery_notes, delivered_at, created_by, created_at')
      .in(
        'job_id',
        jobs.map((job) => job.id)
      )
      .order('created_at', { ascending: true });

    if (statusEventsError) {
      console.error('Shipper status events query error:', statusEventsError);
      statusEventsErrorMessage = 'Shipments loaded, but status history could not be loaded. Please refresh or try again.';
    } else {
      const eventsByJobId = new Map<string, StatusEvent[]>();

      for (const event of statusEvents ?? []) {
        const jobEvents = eventsByJobId.get(event.job_id) ?? [];
        jobEvents.push(event);
        eventsByJobId.set(event.job_id, jobEvents);
      }

      for (const job of jobs) {
        job.events = eventsByJobId.get(job.id) ?? [];
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <Header role="shipper" />
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1fr_1.15fr]">
        <Card title="Post a shipment">
          <form action={createShipmentAction} className="space-y-3">
            {errorMessage && <Notice tone="error">{errorMessage}</Notice>}
            {noticeMessage && <Notice tone="success">{noticeMessage}</Notice>}
            <Notice tone="warning">{NO_PHI_HELPER_TEXT}</Notice>
            <label className="block text-xs font-medium text-slate-600">
              Shipment title
              <input name="title" placeholder="Short logistics summary" className="mt-1" required />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Pickup address
                <input name="pickup_address" placeholder="Pickup address" className="mt-1" required />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Delivery address
                <input name="dropoff_address" placeholder="Delivery address" className="mt-1" required />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">
                Pickup date/time
                <input type="datetime-local" name="pickup_at" className="mt-1" required />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Delivery deadline
                <input type="datetime-local" name="required_by" className="mt-1" required />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Package/item category
                <input name="specimen_type" placeholder="Ambient, refrigerated, frozen, or documents" className="mt-1" required />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Offered price
                <input type="number" min="1" step="0.01" name="offered_price" placeholder="USD" className="mt-1" required />
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-600">
              Temperature requirements
              <input name="temperature_requirements" placeholder="2-8 C, frozen, ambient" className="mt-1" />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Chain-of-custody notes
              <textarea name="chain_of_custody_notes" placeholder="Logistics-only handling notes" className="mt-1" rows={3} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Special instructions
              <textarea name="special_instructions" placeholder="Access, dock, timing, or handoff instructions" className="mt-1" rows={3} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Internal logistics notes
              <textarea name="notes" placeholder="Optional logistics note" className="mt-1" rows={2} />
            </label>
            <button type="submit" className="bg-brand-500 text-white hover:bg-brand-700">
              Publish shipment
            </button>
          </form>
        </Card>

        <Card title="Shipments, bids, and status">
          <div className="space-y-4">
            {jobsError && <Notice tone="error">Unable to load your shipments. Please refresh or try again.</Notice>}
            {bidsErrorMessage && <Notice tone="warning">{bidsErrorMessage}</Notice>}
            {statusEventsErrorMessage && <Notice tone="warning">{statusEventsErrorMessage}</Notice>}
            {jobs.length ? (
              jobs.map((job) => (
                <article key={job.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <Link href={`/shipments/${job.id}`} className="font-medium text-brand-700 hover:underline">{job.title}</Link>
                      <p className="text-xs text-slate-500">Offered price: {formatMoney(job.offered_price)}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p>{job.pickup_address} -&gt; {job.dropoff_address}</p>
                    <p>Pickup: {formatDateTime(job.pickup_at)} - Deadline: {formatDateTime(job.required_by)}</p>
                    <p>Package/item: {job.specimen_type}</p>
                    {job.temperature_requirements && <p>Temperature: {job.temperature_requirements}</p>}
                    {job.chain_of_custody_notes && <p>Chain-of-custody: {job.chain_of_custody_notes}</p>}
                    {job.special_instructions && <p>Special instructions: {job.special_instructions}</p>}
                  </div>

                  {isCompletedShipmentStatus(job.status) && (
                    <Notice tone="success" className="mt-4">Delivery complete. This shipment is read-only and no bid actions are available.</Notice>
                  )}

                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-800">Status history</p>
                    {job.events.length ? (
                      job.events.map((event) => (
                        <article key={event.id} className="rounded-md bg-slate-50 p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <StatusBadge status={event.status} />
                            <p className="text-xs text-slate-500">{formatDateTime(event.created_at)}</p>
                          </div>
                          {event.note && <p className="mt-1 text-slate-700">{event.note}</p>}
                          {event.received_by_name && <p className="mt-1 text-slate-700">Received by: {event.received_by_name}</p>}
                          {event.delivered_at && <p className="mt-1 text-slate-700">Delivered at: {formatDateTime(event.delivered_at)}</p>}
                          {event.delivery_notes && <p className="mt-1 text-slate-700">Delivery notes: {event.delivery_notes}</p>}
                        </article>
                      ))
                    ) : (
                      <EmptyState>No status updates have been recorded for this shipment yet.</EmptyState>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-800">Bids ({job.bids.length})</p>
                    {job.bids.length ? (
                      job.bids.map((bid: Bid) => (
                        <div key={bid.id} className="rounded-md bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">{formatMoney(bid.amount)} - ETA {bid.eta_minutes} min</p>
                            <StatusBadge status={bid.status} />
                          </div>
                          {bid.note && <p className="mt-1 text-sm text-slate-600">{bid.note}</p>}
                          {job.status === 'open' && bid.status === 'pending' && (
                            <form action={acceptBidAction} className="mt-2">
                              <input type="hidden" name="job_id" value={job.id} />
                              <input type="hidden" name="bid_id" value={bid.id} />
                              <button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
                                Accept bid
                              </button>
                            </form>
                          )}
                        </div>
                      ))
                    ) : (
                      <EmptyState>No bids received yet. Courier bids will appear here when this shipment is open.</EmptyState>
                    )}
                  </div>
                </article>
              ))
            ) : (
              !jobsError && <EmptyState>No shipments posted yet. Publish a shipment to start receiving courier bids.</EmptyState>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}