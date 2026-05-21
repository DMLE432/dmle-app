import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { addShipmentStatusAction } from '@/lib/actions';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const statusOptions = [
  { value: 'accepted', label: 'Accepted' },
  { value: 'en_route_to_pickup', label: 'En route to pickup' },
  { value: 'picked_up', label: 'Picked up' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'delivered', label: 'Delivered' }
] as const;

const formatDateTime = (value: string) => new Date(value).toLocaleString();
const formatMoney = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requireRole(['shipper', 'courier', 'admin']);
  const supabase = await createClient();
  const { id } = await params;

  const { data: job } = await supabase
    .from('jobs')
    .select('*, bids!jobs_accepted_bid_id_fkey(amount, courier_id), profiles!jobs_shipper_id_fkey(full_name, organization_name)')
    .eq('id', id)
    .maybeSingle();
  if (!job) return notFound();

  const acceptedCourierId = job.bids?.courier_id;
  const canView = profile.role === 'admin' || job.shipper_id === user.id || acceptedCourierId === user.id;
  if (!canView) return notFound();

  const { data: events } = await supabase
    .from('job_status_events')
    .select('*')
    .eq('job_id', id)
    .order('created_at', { ascending: true });

  const canUpdateStatus = profile.role === 'courier' && acceptedCourierId === user.id;

  return (
    <main className="min-h-screen bg-slate-50">
      <Header role={profile.role} />
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Shipment details</h1>
          <Badge tone={job.status === 'completed' ? 'green' : 'slate'}>{job.status}</Badge>
        </div>

        <Card title={job.title}>
          <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
            <p><strong>Pickup address:</strong> {job.pickup_address}</p>
            <p><strong>Delivery address:</strong> {job.dropoff_address}</p>
            <p><strong>Pickup time:</strong> {formatDateTime(job.pickup_at)}</p>
            <p><strong>Delivery deadline:</strong> {formatDateTime(job.required_by)}</p>
            <p><strong>Specimen/package:</strong> {job.specimen_type}</p>
            <p><strong>Temperature requirements:</strong> {job.temperature_requirements || 'N/A'}</p>
            <p><strong>Offered price:</strong> {formatMoney(job.offered_price)}</p>
            <p><strong>Accepted bid:</strong> {job.bids?.amount ? formatMoney(job.bids.amount) : 'Not accepted yet'}</p>
            <p className="md:col-span-2"><strong>Chain-of-custody notes:</strong> {job.chain_of_custody_notes || 'N/A'}</p>
            <p className="md:col-span-2"><strong>Special instructions:</strong> {job.special_instructions || 'N/A'}</p>
          </div>
        </Card>

        {canUpdateStatus && (
          <Card title="Courier status update">
            <form action={addShipmentStatusAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="job_id" value={job.id} />
              <label className="text-sm font-medium text-slate-700">
                New status
                <select name="status" className="mt-1" required>
                  {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Proof file (pickup/delivery)
                <input type="file" name="proof" className="mt-1" accept="image/*,.pdf,.doc,.docx" />
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Delivery note
                <textarea name="note" rows={3} className="mt-1" placeholder="Optional note for timeline" />
              </label>
              <button type="submit" className="w-fit bg-brand-500 text-white hover:bg-brand-700">Save update</button>
            </form>
          </Card>
        )}

        <Card title="Shipment timeline">
          <div className="space-y-3">
            {events?.length ? events.map((event) => (
              <article key={event.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{event.status.replaceAll('_', ' ')}</p>
                <p className="text-xs text-slate-500">{formatDateTime(event.created_at)}</p>
                {event.note && <p className="mt-1 text-slate-700">{event.note}</p>}
                {event.proof_url && (
                  <p className="mt-1 text-slate-700">
                    Proof: <Link className="text-brand-700 underline" href="#">{event.proof_name || event.proof_url}</Link> (stored in shipment-proofs/{event.proof_url})
                  </p>
                )}
              </article>
            )) : <p className="text-sm text-slate-500">No status updates yet.</p>}
          </div>
        </Card>
      </div>
    </main>
  );
}
