import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { reviewCourierAction } from '@/lib/actions';

export default async function AdminPage() {
  await requireRole(['admin']);
  const supabase = await createClient();

  const { data: couriers } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'courier')
    .order('created_at', { ascending: false });

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*, profiles!jobs_shipper_id_fkey(full_name, organization_name), bids(*)')
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <main className="min-h-screen bg-slate-50">
      <Header role="admin" />
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-2">
        <Card title="Courier approvals">
          <div className="space-y-3">
            {couriers?.length ? (
              couriers.map((courier) => (
                <article key={courier.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-medium">{courier.full_name}</p>
                    <Badge tone={courier.courier_status === 'approved' ? 'green' : courier.courier_status === 'rejected' ? 'red' : 'amber'}>
                      {courier.courier_status ?? 'pending'}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">{courier.organization_name || 'Independent courier'}</p>
                  <form action={reviewCourierAction} className="mt-3 flex gap-2">
                    <input type="hidden" name="profile_id" value={courier.id} />
                    <button name="decision" value="approved" className="bg-emerald-600 text-white hover:bg-emerald-700">
                      Approve
                    </button>
                    <button name="decision" value="rejected" className="bg-rose-600 text-white hover:bg-rose-700">
                      Reject
                    </button>
                  </form>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No courier accounts yet.</p>
            )}
          </div>
        </Card>

        <Card title="Marketplace activity">
          <div className="space-y-3">
            {jobs?.length ? (
              jobs.map((job) => (
                <article key={job.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium">{job.title}</p>
                  <p className="text-sm text-slate-600">By {job.profiles?.organization_name || job.profiles?.full_name}</p>
                  <p className="text-xs text-slate-500">{job.pickup_address} → {job.dropoff_address}</p>
                  <p className="mt-2 text-sm">{job.bids.length} bids</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No jobs yet.</p>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
