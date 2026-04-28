import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createJobAction } from '@/lib/actions';
import { createClient } from '@/lib/supabase/server';

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
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1.1fr_1fr]">
        <Card title="Post a new delivery job">
          <form action={createJobAction} className="space-y-3">
            <input name="title" placeholder="STAT blood sample to central lab" required />
            <input name="pickup_address" placeholder="Pickup address" required />
            <input name="dropoff_address" placeholder="Dropoff address" required />
            <input name="specimen_type" placeholder="Specimen type" required />
            <input type="datetime-local" name="required_by" required />
            <textarea name="notes" placeholder="Handling requirements, chain-of-custody notes" rows={3} />
            <button type="submit" className="bg-brand-500 text-white hover:bg-brand-700">
              Publish job
            </button>
          </form>
        </Card>

        <Card title="Your job board">
          <div className="space-y-4">
            {jobs?.length ? (
              jobs.map((job) => (
                <article key={job.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="font-medium">{job.title}</p>
                    <Badge tone={job.status === 'open' ? 'green' : 'slate'}>{job.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">{job.pickup_address} → {job.dropoff_address}</p>
                  <p className="mt-2 text-xs text-slate-500">Required by: {new Date(job.required_by).toLocaleString()}</p>
                  <p className="mt-2 text-sm">Bids received: {job.bids.length}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No jobs posted yet.</p>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
