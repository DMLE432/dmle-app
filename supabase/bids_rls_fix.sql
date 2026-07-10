-- Run in the Supabase SQL editor for existing DMLE databases.
-- This updates helper functions, RLS policies, and assigned workflow constraints.
-- It does not drop or recreate tables.

alter table public.jobs
  drop constraint if exists jobs_status_check;

alter table public.jobs
  add constraint jobs_status_check
  check (status in ('open', 'assigned', 'picked_up', 'in_transit', 'delivered', 'completed', 'cancelled'));

alter table public.job_status_events
  add column if not exists received_by_name text,
  add column if not exists delivery_notes text,
  add column if not exists delivered_at timestamptz;

create or replace function public.current_user_has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = required_role
  );
$$;

create or replace function public.current_user_is_approved_courier()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'courier'
      and p.courier_status = 'approved'
  );
$$;

create or replace function public.job_is_open(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = target_job_id
      and j.status = 'open'
  );
$$;

create or replace function public.current_user_is_shipper_for_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = target_job_id
      and j.shipper_id = auth.uid()
  );
$$;

create or replace function public.current_user_is_shipper_for_open_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = target_job_id
      and j.shipper_id = auth.uid()
      and j.status = 'open'
  );
$$;

create or replace function public.current_user_has_bid_on_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bids b
    where b.job_id = target_job_id
      and b.courier_id = auth.uid()
  );
$$;

create or replace function public.current_user_has_accepted_bid(target_bid_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bids b
    where b.id = target_bid_id
      and b.courier_id = auth.uid()
      and b.status = 'accepted'
  );
$$;

create or replace function public.current_user_is_assigned_courier_for_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    join public.bids b on b.id = j.accepted_bid_id
    where j.id = target_job_id
      and b.courier_id = auth.uid()
  );
$$;

create or replace function public.current_user_is_shipper_for_assigned_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    join public.bids b on b.id = j.accepted_bid_id
    where j.id = target_job_id
      and j.shipper_id = auth.uid()
      and j.status = 'assigned'
      and b.status = 'accepted'
  );
$$;

drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles" on public.profiles
  for select using (public.current_user_has_role('admin'));

drop policy if exists "Admins update courier status" on public.profiles;
create policy "Admins update courier status" on public.profiles
  for update using (public.current_user_has_role('admin'));

drop policy if exists "Shippers create jobs" on public.jobs;
create policy "Shippers create jobs" on public.jobs
  for insert with check (
    auth.uid() = shipper_id
    and public.current_user_has_role('shipper')
  );

drop policy if exists "Assigned couriers complete jobs" on public.jobs;
drop policy if exists "Assigned couriers update execution status" on public.jobs;
create policy "Assigned couriers update execution status" on public.jobs
  for update using (
    status in ('assigned', 'picked_up', 'in_transit')
    and public.current_user_is_assigned_courier_for_job(id)
  )
  with check (
    status in ('picked_up', 'in_transit', 'delivered')
    and public.current_user_is_assigned_courier_for_job(id)
  );

drop policy if exists "Couriers read open jobs" on public.jobs;
create policy "Couriers read open jobs" on public.jobs
  for select using (
    status = 'open'
    and public.current_user_has_role('courier')
  );

drop policy if exists "Couriers read jobs they bid on" on public.jobs;
create policy "Couriers read jobs they bid on" on public.jobs
  for select using (public.current_user_has_bid_on_job(id));

drop policy if exists "Assigned couriers read assigned jobs" on public.jobs;
create policy "Assigned couriers read assigned jobs" on public.jobs
  for select using (public.current_user_is_assigned_courier_for_job(id));

drop policy if exists "Admins read all jobs" on public.jobs;
create policy "Admins read all jobs" on public.jobs
  for select using (public.current_user_has_role('admin'));

create or replace function public.restrict_assigned_courier_job_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_has_role('courier')
    and public.current_user_is_assigned_courier_for_job(old.id)
    and not public.current_user_has_role('admin')
  then
    if new.id is distinct from old.id
      or new.shipper_id is distinct from old.shipper_id
      or new.title is distinct from old.title
      or new.pickup_address is distinct from old.pickup_address
      or new.dropoff_address is distinct from old.dropoff_address
      or new.specimen_type is distinct from old.specimen_type
      or new.pickup_at is distinct from old.pickup_at
      or new.required_by is distinct from old.required_by
      or new.temperature_requirements is distinct from old.temperature_requirements
      or new.chain_of_custody_notes is distinct from old.chain_of_custody_notes
      or new.special_instructions is distinct from old.special_instructions
      or new.offered_price is distinct from old.offered_price
      or new.notes is distinct from old.notes
      or new.accepted_bid_id is distinct from old.accepted_bid_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Assigned couriers may only update shipment execution status.';
    end if;

    if not (
      (old.status = 'assigned' and new.status = 'picked_up')
      or (old.status = 'picked_up' and new.status = 'in_transit')
      or (old.status = 'in_transit' and new.status = 'delivered')
    ) then
      raise exception 'Invalid assigned courier shipment status transition.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists restrict_assigned_courier_job_updates on public.jobs;
create trigger restrict_assigned_courier_job_updates
  before update on public.jobs
  for each row
  execute function public.restrict_assigned_courier_job_updates();

drop policy if exists "Approved couriers submit bids" on public.bids;
create policy "Approved couriers submit bids" on public.bids
  for insert with check (
    auth.uid() = courier_id
    and public.current_user_is_approved_courier()
    and public.job_is_open(job_id)
  );

drop policy if exists "Shippers read bids on own jobs" on public.bids;
create policy "Shippers read bids on own jobs" on public.bids
  for select using (public.current_user_is_shipper_for_job(job_id));

drop policy if exists "Shippers accept bids on own open jobs" on public.bids;
create policy "Shippers accept bids on own open jobs" on public.bids
  for update using (public.current_user_is_shipper_for_open_job(job_id))
  with check (public.current_user_is_shipper_for_job(job_id));

drop policy if exists "Admins read all bids" on public.bids;
create policy "Admins read all bids" on public.bids
  for select using (public.current_user_has_role('admin'));

drop policy if exists "Assigned courier create status events" on public.job_status_events;
create policy "Assigned courier create status events" on public.job_status_events
  for insert with check (
    auth.uid() = created_by
    and status in ('picked_up', 'in_transit', 'delivered')
    and proof_url is null
    and proof_name is null
    and (
      (status = 'delivered' and received_by_name is not null and delivered_at is not null)
      or (status <> 'delivered' and received_by_name is null and delivery_notes is null and delivered_at is null)
    )
    and public.current_user_is_assigned_courier_for_job(job_id)
  );

drop policy if exists "Shippers create assignment status events" on public.job_status_events;
create policy "Shippers create assignment status events" on public.job_status_events
  for insert with check (
    auth.uid() = created_by
    and status = 'assigned'
    and proof_url is null
    and proof_name is null
    and received_by_name is null
    and delivery_notes is null
    and delivered_at is null
    and public.current_user_is_shipper_for_assigned_job(job_id)
  );

drop policy if exists "Assigned courier read status events" on public.job_status_events;
create policy "Assigned courier read status events" on public.job_status_events
  for select using (public.current_user_is_assigned_courier_for_job(job_id));

drop policy if exists "Shippers read own job status events" on public.job_status_events;
create policy "Shippers read own job status events" on public.job_status_events
  for select using (public.current_user_is_shipper_for_job(job_id));

drop policy if exists "Admins read all status events" on public.job_status_events;
create policy "Admins read all status events" on public.job_status_events
  for select using (public.current_user_has_role('admin'));
