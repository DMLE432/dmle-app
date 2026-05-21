import Link from 'next/link';
import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { submitBidAction } from '@/lib/actions';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default async function CourierPage() {
  const { user, profile } = await requireRole(['courier']);
  const supabase = await createClient();

  const { data: jobs } = await supabase.from('jobs').select('*').eq('status', 'open').order('created_at', { ascending: false });

  const { data: myBids } = await supabase
    .from('bids')
    .select('*, jobs(title, pickup_address, dropoff_address, pickup_at, required_by)')
    .eq('courier_id', user.id)
    .order('created_at', { ascending: false });

  const canBid = profile.courier_status === 'approved';
  const bidJobIds = new Set(myBids?.map((bid) => bid.job_id) ?? []);

  return (
    <main className="min-h-screen bg-slate-50">
      <Header role="courier" />
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1.2fr_0.8fr]">
        <Card title="Available shipments">
          {!canBid && (
            <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Your courier profile is <strong>{profile.courier_status}</strong>. Admin approval is required before bidding.
            </p>
          )}
          <div className="space-y-4">
            {jobs?.map((job) => {
              const alreadyBid = bidJobIds.has(job.id);

              return (
                <article key={job.id} className="space-y-3 rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Link href={`/shipments/${job.id}`} className="font-medium text-brand-700 hover:underline">{job.title}</Link>
                      <p className="text-xs text-slate-500">Offered price: {formatMoney(job.offered_price)}</p>
                    </div>
                    <Badge tone="green">open</Badge>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p>{job.pickup_address} → {job.dropoff_address}</p>
                    <p>Pickup: {formatDateTime(job.pickup_at)} · Deadline: {formatDateTime(job.required_by)}</p>
                    <p>Specimen/package: {job.specimen_type}</p>
                    {job.temperature_requirements && <p>Temperature: {job.temperature_requirements}</p>}
                    {job.chain_of_custody_notes && <p>Chain-of-custody: {job.chain_of_custody_notes}</p>}
                    {job.special_instructions && <p>Special instructions: {job.special_instructions}</p>}
                  </div>

                  {alreadyBid ? (
                    <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-600">You already submitted a bid for this shipment.</p>
                  ) : (
                    <form action={submitBidAction} className="grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-3">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="number" min="1" step="0.01" name="amount" placeholder="Bid price ($)" required disabled={!canBid} />
                      <input type="number" min="1" step="1" name="eta_minutes" placeholder="ETA (min)" required disabled={!canBid} />
                      <div className="md:col-span-3">
                        <input name="note" placeholder="Bid notes" disabled={!canBid} />
                      </div>
                      <button type="submit" disabled={!canBid} className="bg-brand-500 text-white hover:bg-brand-700 disabled:bg-slate-300">
                        Submit bid
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
            {!jobs?.length && <p className="text-sm text-slate-500">No open shipments currently.</p>}
          </div>
        </Card>

        <Card title="My bids">
          <div className="space-y-3">
            {myBids?.length ? (
              myBids.map((bid) => (
                <article key={bid.id} className="rounded-lg border border-slate-200 p-3">
                  <Link href={`/shipments/${bid.job_id}`} className="font-medium text-brand-700 hover:underline">{bid.jobs?.title}</Link>
                  <p className="text-sm text-slate-600">{formatMoney(bid.amount)} · ETA {bid.eta_minutes} min</p>
                  {bid.jobs && (
                    <p className="mt-1 text-xs text-slate-500">
                      {bid.jobs.pickup_address} → {bid.jobs.dropoff_address}
                    </p>
                  )}
                  <div className="mt-2">
                    <Badge tone={bid.status === 'pending' ? 'amber' : bid.status === 'accepted' ? 'green' : 'red'}>{bid.status}</Badge>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No bids submitted yet.</p>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
