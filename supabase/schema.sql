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
  required_by timestamptz not null,
  notes text,
  status text not null default 'open' check (status in ('open', 'assigned', 'completed', 'cancelled')),
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
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.bids enable row level security;

-- Profiles
create policy "Users read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Users create own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Admins read all profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "Admins update courier status" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Jobs
create policy "Shippers create jobs" on public.jobs
  for insert with check (
    auth.uid() = shipper_id
    and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'shipper'
    )
  );

create policy "Shippers read own jobs" on public.jobs
  for select using (auth.uid() = shipper_id);

create policy "Approved couriers read open jobs" on public.jobs
  for select using (
    status = 'open'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'courier' and p.courier_status = 'approved'
    )
  );

create policy "Admins read all jobs" on public.jobs
  for select using (
    exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Bids
create policy "Approved couriers submit bids" on public.bids
  for insert with check (
    auth.uid() = courier_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'courier' and p.courier_status = 'approved'
    )
  );

create policy "Couriers read own bids" on public.bids
  for select using (auth.uid() = courier_id);

create policy "Shippers read bids on own jobs" on public.bids
  for select using (
    exists (
      select 1 from public.jobs j where j.id = job_id and j.shipper_id = auth.uid()
    )
  );

create policy "Admins read all bids" on public.bids
  for select using (
    exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );
