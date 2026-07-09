-- DMLE core schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('shipper', 'courier', 'admin')),
  courier_status text check (courier_status in ('pending', 'approved', 'rejected')),
  organization_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  pickup_address text not null,
  dropoff_address text not null,
  specimen_type text not null,
  pickup_at timestamptz not null,
  required_by timestamptz not null,
  temperature_requirements text,
  chain_of_custody_notes text,
  special_instructions text,
  offered_price numeric(10,2) not null check (offered_price > 0),
  notes text,
  status text not null default 'open' check (status in ('open', 'assigned', 'completed', 'cancelled')),
  accepted_bid_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  courier_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  eta_minutes int not null check (eta_minutes > 0),
  note text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (job_id, courier_id)
);

create table if not exists public.job_status_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null check (status in ('assigned', 'accepted', 'en_route_to_pickup', 'picked_up', 'in_transit', 'delivered')),
  note text,
  proof_url text,
  proof_name text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.jobs
  add constraint jobs_accepted_bid_id_fkey
  foreign key (accepted_bid_id) references public.bids(id) on delete set null;

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.bids enable row level security;
alter table public.job_status_events enable row level security;

-- RLS helper predicates use SECURITY DEFINER so cross-table checks do not
-- recursively invoke policies on the related tables.
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

-- Profiles
create policy "Users read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Users create own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Admins read all profiles" on public.profiles
  for select using (public.current_user_has_role('admin'));

create policy "Admins update courier status" on public.profiles
  for update using (public.current_user_has_role('admin'));

-- Jobs
create policy "Shippers create jobs" on public.jobs
  for insert with check (
    auth.uid() = shipper_id
    and public.current_user_has_role('shipper')
  );

create policy "Shippers read own jobs" on public.jobs
  for select using (auth.uid() = shipper_id);

create policy "Shippers update own jobs" on public.jobs
  for update using (auth.uid() = shipper_id)
  with check (auth.uid() = shipper_id);

create policy "Assigned couriers complete jobs" on public.jobs
  for update using (
    status = 'assigned'
    and public.current_user_has_accepted_bid(accepted_bid_id)
  )
  with check (
    status = 'completed'
    and public.current_user_has_accepted_bid(accepted_bid_id)
  );

create policy "Couriers read open jobs" on public.jobs
  for select using (
    status = 'open'
    and public.current_user_has_role('courier')
  );

create policy "Couriers read jobs they bid on" on public.jobs
  for select using (public.current_user_has_bid_on_job(id));

create policy "Admins read all jobs" on public.jobs
  for select using (public.current_user_has_role('admin'));

-- Bids
create policy "Approved couriers submit bids" on public.bids
  for insert with check (
    auth.uid() = courier_id
    and public.current_user_is_approved_courier()
    and public.job_is_open(job_id)
  );

create policy "Couriers read own bids" on public.bids
  for select using (auth.uid() = courier_id);

create policy "Shippers read bids on own jobs" on public.bids
  for select using (public.current_user_is_shipper_for_job(job_id));

create policy "Shippers accept bids on own open jobs" on public.bids
  for update using (public.current_user_is_shipper_for_open_job(job_id))
  with check (public.current_user_is_shipper_for_job(job_id));

create policy "Admins read all bids" on public.bids
  for select using (public.current_user_has_role('admin'));

-- Job status events
create policy "Assigned courier create status events" on public.job_status_events
  for insert with check (
    auth.uid() = created_by
    and public.current_user_is_assigned_courier_for_job(job_id)
  );

create policy "Shippers create assignment status events" on public.job_status_events
  for insert with check (
    auth.uid() = created_by
    and status = 'assigned'
    and proof_url is null
    and proof_name is null
    and public.current_user_is_shipper_for_assigned_job(job_id)
  );

create policy "Assigned courier read status events" on public.job_status_events
  for select using (public.current_user_is_assigned_courier_for_job(job_id));

create policy "Shippers read own job status events" on public.job_status_events
  for select using (public.current_user_is_shipper_for_job(job_id));

create policy "Admins read all status events" on public.job_status_events
  for select using (public.current_user_has_role('admin'));

-- Storage setup notes (run in Supabase SQL editor)
-- insert into storage.buckets (id, name, public) values ('shipment-proofs', 'shipment-proofs', false)
-- on conflict (id) do nothing;
-- Allow assigned courier uploads and authorized role reads from shipment-proofs bucket.
