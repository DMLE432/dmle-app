import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { submitBidAction } from '@/lib/actions';

export default async function CourierPage() {
  const { user, profile } = await requireRole(['courier']);
  const supabase = await createClient();

  const { data: jobs } = await supabase.from('jobs').select('*').eq('status', 'open').order('created_at', { ascending: false });

  const { data: myBids } = await supabase
    .from('bids')
    .select('*, jobs(title)')
    .eq('courier_id', user.id)
    .order('created_at', { ascending: false });

  const canBid = profile.courier_status === 'approved';

  return (
    <main className="min-h-screen bg-slate-50">
      <Header role="courier" />
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1.2fr_0.8fr]">
        <Card title="Available jobs">
          {!canBid && (
            <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Your courier profile is <strong>{profile.courier_status}</strong>. Admin approval is required before bidding.
            </p>
          )}
          <div className="space-y-4">
            {jobs?.map((job) => (
              <article key={job.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{job.title}</p>
                  <Badge tone="green">open</Badge>
                </div>
                <p className="text-sm text-slate-600">{job.pickup_address} → {job.dropoff_address}</p>
                <p className="text-xs text-slate-500">Specimen: {job.specimen_type}</p>
                <form action={submitBidAction} className="grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-3">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="number" min="1" step="1" name="amount" placeholder="Bid $" required disabled={!canBid} />
                  <input type="number" min="1" step="1" name="eta_minutes" placeholder="ETA (min)" required disabled={!canBid} />
                  <div className="md:col-span-3">
                    <input name="note" placeholder="Optional note" disabled={!canBid} />
                  </div>
                  <button type="submit" disabled={!canBid} className="bg-brand-500 text-white hover:bg-brand-700 disabled:bg-slate-300">
                    Submit bid
                  </button>
                </form>
              </article>
            ))}
            {!jobs?.length && <p className="text-sm text-slate-500">No open jobs currently.</p>}
          </div>
        </Card>

        <Card title="My bids">
          <div className="space-y-3">
            {myBids?.length ? (
              myBids.map((bid) => (
                <article key={bid.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium">{bid.jobs?.title}</p>
                  <p className="text-sm text-slate-600">${bid.amount} · ETA {bid.eta_minutes} min</p>
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
