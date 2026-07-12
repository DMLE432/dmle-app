import { Header } from '@/components/header';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { reviewCourierAction } from '@/lib/actions';
import { formatStatusLabel, getStatusTone } from '@/lib/status';
import type { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];
type CourierProfile = Pick<Profile, 'id' | 'full_name' | 'organization_name' | 'courier_status' | 'created_at'>;
type CourierStatusGroup = 'pending' | 'approved' | 'rejected';
type AdminSearchParams = {
  error?: string | string[];
  notice?: string | string[];
};

const COURIER_GROUPS: { key: CourierStatusGroup; title: string; empty: string }[] = [
  {
    key: 'pending',
    title: 'Pending review',
    empty: 'No courier profiles are waiting for review.'
  },
  {
    key: 'approved',
    title: 'Approved couriers',
    empty: 'No couriers have been approved yet.'
  },
  {
    key: 'rejected',
    title: 'Rejected couriers',
    empty: 'No couriers have been rejected.'
  }
];

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function normalizeCourierStatus(status: CourierProfile['courier_status']): CourierStatusGroup {
  if (status === 'approved' || status === 'rejected') return status;
  return 'pending';
}

function CourierReviewButtons({ courier }: { courier: CourierProfile }) {
  const status = normalizeCourierStatus(courier.courier_status);

  return (
    <form action={reviewCourierAction} className="mt-4 flex flex-wrap gap-2">
      <input type="hidden" name="profile_id" value={courier.id} />
      {status !== 'approved' && (
        <button name="decision" value="approved" className="bg-emerald-600 text-white hover:bg-emerald-700">
          Approve courier
        </button>
      )}
      {status !== 'rejected' && (
        <button name="decision" value="rejected" className="bg-rose-600 text-white hover:bg-rose-700">
          Reject courier
        </button>
      )}
    </form>
  );
}

function CourierCard({ courier }: { courier: CourierProfile }) {
  const status = normalizeCourierStatus(courier.courier_status);

  return (
    <article className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{courier.full_name || 'Courier profile'}</p>
          <p className="text-sm text-slate-600">{courier.organization_name || 'Independent courier'}</p>
        </div>
        <Badge tone={getStatusTone(status)}>{formatStatusLabel(status)}</Badge>
      </div>
      <p className="mt-2 text-xs text-slate-500">Signed up {formatDateTime(courier.created_at)}</p>
      <CourierReviewButtons courier={courier} />
    </article>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminSearchParams> }) {
  await requireRole(['admin']);
  const supabase = await createClient();
  const params = await searchParams;
  const errorMessage = firstParam(params.error);
  const noticeMessage = firstParam(params.notice);

  const { data: courierRows, error: couriersError } = await supabase
    .from('profiles')
    .select('id, full_name, organization_name, courier_status, created_at')
    .eq('role', 'courier')
    .order('created_at', { ascending: false });

  if (couriersError) {
    console.error('Admin courier profiles query error:', couriersError);
  }

  const couriers = (courierRows ?? []) as CourierProfile[];
  const couriersByStatus = COURIER_GROUPS.reduce<Record<CourierStatusGroup, CourierProfile[]>>(
    (groups, group) => {
      groups[group.key] = couriers.filter((courier) => normalizeCourierStatus(courier.courier_status) === group.key);
      return groups;
    },
    { pending: [], approved: [], rejected: [] }
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <Header role="admin" />
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Courier approvals</h1>
          <p className="mt-1 text-sm text-slate-600">Review courier accounts and manage access to shipment bidding.</p>
        </div>

        {errorMessage && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</p>}
        {noticeMessage && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{noticeMessage}</p>}
        {couriersError && (
          <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
            Courier profiles could not be loaded. Please refresh or try again.
          </p>
        )}

        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Courier approval uses account profile metadata only. Do not enter patient names, DOB, MRN, diagnosis, test results, insurance
          information, or specimen identifiers.
        </p>

        <div className="grid gap-6 lg:grid-cols-3">
          {COURIER_GROUPS.map((group) => {
            const groupCouriers = couriersByStatus[group.key];

            return (
              <Card key={group.key} title={`${group.title} (${groupCouriers.length})`}>
                <div className="space-y-3">
                  {groupCouriers.length ? (
                    groupCouriers.map((courier) => <CourierCard key={courier.id} courier={courier} />)
                  ) : (
                    <p className="text-sm text-slate-500">{group.empty}</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
