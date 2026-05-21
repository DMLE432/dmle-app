import Link from 'next/link';
import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { acceptBidAction, createJobAction } from '@/lib/actions';
import { createClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

type Bid = Database['public']['Tables']['bids']['Row'];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default async function ShipperPage() {
  const { user } = await requireRole(['shipper']);
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*, bids(*)')
    .eq('shipper_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <main className="min-h-screen bg-slate-50">
      <Header role="shipper" />
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1fr_1.15fr]">
        <Card title="Create a shipment request">
          <form action={createJobAction} className="space-y-3">
            <input name="title" placeholder="Shipment title (e.g. STAT blood sample to central lab)" required />
            <div className="grid gap-3 md:grid-cols-2">
              <input name="pickup_address" placeholder="Pickup address" required />
              <input name="dropoff_address" placeholder="Delivery address" required />
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
              <input name="specimen_type" placeholder="Package/specimen type" required />
              <input type="number" min="1" step="0.01" name="offered_price" placeholder="Offered price ($)" required />
            </div>
            <input name="temperature_requirements" placeholder="Temperature requirements (e.g. 2-8°C, frozen, ambient)" />
            <textarea name="chain_of_custody_notes" placeholder="Chain-of-custody notes" rows={3} />
            <textarea name="special_instructions" placeholder="Special instructions" rows={3} />
            <textarea name="notes" placeholder="Internal notes (optional)" rows={2} />
            <button type="submit" className="bg-brand-500 text-white hover:bg-brand-700">
              Publish shipment
            </button>
          </form>
        </Card>

        <Card title="Your shipments and bids">
          <div className="space-y-4">
            {jobs?.length ? (
              jobs.map((job) => (
                <article key={job.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <Link href={`/shipments/${job.id}`} className="font-medium text-brand-700 hover:underline">{job.title}</Link>
                      <p className="text-xs text-slate-500">Offered price: {formatMoney(job.offered_price)}</p>
                    </div>
                    <Badge tone={job.status === 'open' ? 'green' : 'slate'}>{job.status}</Badge>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p>{job.pickup_address} → {job.dropoff_address}</p>
                    <p>Pickup: {formatDateTime(job.pickup_at)} · Deadline: {formatDateTime(job.required_by)}</p>
                    <p>Specimen/package: {job.specimen_type}</p>
                    {job.temperature_requirements && <p>Temperature: {job.temperature_requirements}</p>}
                    {job.chain_of_custody_notes && <p>Chain-of-custody: {job.chain_of_custody_notes}</p>}
                    {job.special_instructions && <p>Special instructions: {job.special_instructions}</p>}
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-800">Bids ({job.bids.length})</p>
                    {job.bids.length ? (
                      job.bids.map((bid: Bid) => (
                        <div key={bid.id} className="rounded-md bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">{formatMoney(bid.amount)} · ETA {bid.eta_minutes} min</p>
                            <Badge tone={bid.status === 'accepted' ? 'green' : bid.status === 'declined' ? 'red' : 'amber'}>{bid.status}</Badge>
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
                      <p className="text-sm text-slate-500">No bids received yet.</p>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No shipments posted yet.</p>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
