import Link from 'next/link';
import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { reviewCourierAction } from '@/lib/actions';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

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
    .order('created_at', { ascending: false });

  const { data: bids } = await supabase
    .from('bids')
    .select('*, jobs(title), profiles!bids_courier_id_fkey(full_name, organization_name)')
    .order('created_at', { ascending: false });

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

        <Card title="All shipments">
          <div className="space-y-3">
            {jobs?.length ? (
              jobs.map((job) => (
                <article key={job.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/shipments/${job.id}`} className="font-medium text-brand-700 hover:underline">{job.title}</Link>
                    <Badge tone={job.status === 'open' ? 'green' : 'slate'}>{job.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">By {job.profiles?.organization_name || job.profiles?.full_name || 'Unknown shipper'}</p>
                  <p className="text-xs text-slate-500">{job.pickup_address} → {job.dropoff_address}</p>
                  <p className="text-xs text-slate-500">Pickup: {formatDateTime(job.pickup_at)} · Deadline: {formatDateTime(job.required_by)}</p>
                  <p className="mt-2 text-sm">Offered: {formatMoney(job.offered_price)} · {job.bids.length} bids</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No shipments yet.</p>
            )}
          </div>
        </Card>

        <Card title="All bids" className="lg:col-span-2">
          <div className="grid gap-3 md:grid-cols-2">
            {bids?.length ? (
              bids.map((bid) => (
                <article key={bid.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{bid.jobs?.title || 'Shipment'}</p>
                    <Badge tone={bid.status === 'accepted' ? 'green' : bid.status === 'declined' ? 'red' : 'amber'}>{bid.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    Courier: {bid.profiles?.organization_name || bid.profiles?.full_name || 'Unknown courier'}
                  </p>
                  <p className="text-sm text-slate-600">{formatMoney(bid.amount)} · ETA {bid.eta_minutes} min</p>
                  {bid.note && <p className="mt-1 text-sm text-slate-500">{bid.note}</p>}
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
