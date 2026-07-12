import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { updateAssignedJobStatusAction } from '@/lib/actions';
import { requireRole } from '@/lib/auth';
import { formatStatusLabel, getStatusTone, isCompletedShipmentStatus } from '@/lib/status';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type Job = Database['public']['Tables']['jobs']['Row'];
type JobStatus = Job['status'];
type StatusEvent = Database['public']['Tables']['job_status_events']['Row'];
type CourierExecutionStatus = Extract<JobStatus, 'picked_up' | 'in_transit' | 'delivered'>;
type ShipmentSearchParams = {
  error?: string | string[];
  notice?: string | string[];
};

const NO_PHI_HELPER_TEXT =
  'Do not enter patient names, DOB, MRN, diagnosis, test results, insurance information, or specimen identifiers.';
const STATUS_NO_PHI_HELPER_TEXT = `Status updates must stay logistics-only. ${NO_PHI_HELPER_TEXT}`;
const STATUS_ACTIONS: Array<{ status: CourierExecutionStatus; currentStatus: JobStatus; label: string }> = [
  { status: 'picked_up', currentStatus: 'assigned', label: 'Mark picked up' },
  { status: 'in_transit', currentStatus: 'picked_up', label: 'Mark in transit' },
  { status: 'delivered', currentStatus: 'in_transit', label: 'Mark delivered' }
];

const formatDateTime = (value: string) => new Date(value).toLocaleString();
const formatMoney = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

function getMessage(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function StatusActions({ job }: { job: Job }) {
  if (isCompletedShipmentStatus(job.status)) {
    return <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Delivery complete. This shipment is read-only.</p>;
  }

  const nextAction = STATUS_ACTIONS.find((action) => action.currentStatus === job.status);

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{STATUS_NO_PHI_HELPER_TEXT}</p>

      {job.status === 'in_transit' ? (
        <form action={updateAssignedJobStatusAction} className="space-y-2 rounded-md bg-slate-50 p-3">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="status" value="delivered" />
          <input type="hidden" name="source_path" value={`/shipments/${job.id}`} />
          <label className="block text-sm font-medium text-slate-700">
            Received by name
            <input name="received_by_name" placeholder="Receiving staff or desk name" className="mt-1" required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Delivery notes
            <textarea name="delivery_notes" rows={3} placeholder="Logistics-safe delivery notes" className="mt-1" />
          </label>
          <button type="submit" className="w-fit bg-emerald-600 text-white hover:bg-emerald-700">
            Mark delivered
          </button>
        </form>
      ) : nextAction ? (
        <form action={updateAssignedJobStatusAction}>
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="status" value={nextAction.status} />
          <input type="hidden" name="source_path" value={`/shipments/${job.id}`} />
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

export default async function ShipmentDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ShipmentSearchParams>;
}) {
  const { user, profile } = await requireRole(['shipper', 'courier', 'admin']);
  const supabase = await createClient();
  const { id } = await params;
  const query = await searchParams;
  const errorMessage = getMessage(query.error);
  const noticeMessage = getMessage(query.notice);

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(
      'id, shipper_id, title, pickup_address, dropoff_address, specimen_type, pickup_at, required_by, temperature_requirements, chain_of_custody_notes, special_instructions, offered_price, notes, status, accepted_bid_id, created_at, bids!jobs_accepted_bid_id_fkey(amount, courier_id), profiles!jobs_shipper_id_fkey(full_name, organization_name)'
    )
    .eq('id', id)
    .maybeSingle();

  if (jobError) {
    console.error('Shipment detail query error:', jobError);
  }

  if (!job) return notFound();

  const acceptedBid = job.bids?.[0] ?? null;
  const acceptedCourierId = acceptedBid?.courier_id;
  const canView = profile.role === 'admin' || job.shipper_id === user.id || acceptedCourierId === user.id;
  if (!canView) return notFound();

  const { data: events, error: eventsError } = await supabase
    .from('job_status_events')
    .select('id, job_id, status, note, proof_url, proof_name, received_by_name, delivery_notes, delivered_at, created_by, created_at')
    .eq('job_id', id)
    .order('created_at', { ascending: true });

  if (eventsError) {
    console.error('Shipment status events query error:', eventsError);
  }

  const isAssignedCourier = profile.role === 'courier' && acceptedCourierId === user.id;
  const canUpdateStatus = isAssignedCourier && !isCompletedShipmentStatus(job.status);

  return (
    <main className="min-h-screen bg-slate-50">
      <Header role={profile.role} />
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Shipment details</h1>
          <Badge tone={getStatusTone(job.status)}>{formatStatusLabel(job.status)}</Badge>
        </div>
        {errorMessage && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</p>}
        {noticeMessage && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{noticeMessage}</p>}
        {eventsError && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Shipment loaded, but status history could not be loaded. Please refresh or try again.</p>}

        <Card title={job.title}>
          <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
            <p><strong>Pickup address:</strong> {job.pickup_address}</p>
            <p><strong>Delivery address:</strong> {job.dropoff_address}</p>
            <p><strong>Pickup time:</strong> {formatDateTime(job.pickup_at)}</p>
            <p><strong>Delivery deadline:</strong> {formatDateTime(job.required_by)}</p>
            <p><strong>Specimen/package:</strong> {job.specimen_type}</p>
            <p><strong>Temperature requirements:</strong> {job.temperature_requirements || 'N/A'}</p>
            <p><strong>Offered price:</strong> {formatMoney(job.offered_price)}</p>
            <p><strong>Accepted bid:</strong> {acceptedBid?.amount ? formatMoney(acceptedBid.amount) : 'Not accepted yet'}</p>
            <p className="md:col-span-2"><strong>Chain-of-custody notes:</strong> {job.chain_of_custody_notes || 'N/A'}</p>
            <p className="md:col-span-2"><strong>Special instructions:</strong> {job.special_instructions || 'N/A'}</p>
          </div>
        </Card>

        {isAssignedCourier && (
          <Card title={canUpdateStatus ? 'Courier status update' : 'Courier status'}>
            {canUpdateStatus ? (
              <StatusActions job={job} />
            ) : (
              <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Delivery complete. This shipment is read-only.</p>
            )}
          </Card>
        )}

        <Card title="Shipment timeline">
          <div className="space-y-3">
            {events?.length ? (
              events.map((event: StatusEvent) => (
                <article key={event.id} className="rounded-md border border-slate-200 p-3 text-sm">
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
              !eventsError && <p className="text-sm text-slate-500">No status updates have been recorded for this shipment yet.</p>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
