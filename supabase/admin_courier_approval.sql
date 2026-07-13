-- Run in the Supabase SQL editor for existing DMLE databases.
-- Enables app-based courier approval controls for admin profiles.
-- This does not drop or recreate any tables.

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

drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles" on public.profiles
  for select using (public.current_user_has_role('admin'));

drop policy if exists "Admins update courier status" on public.profiles;
create policy "Admins update courier status" on public.profiles
  for update
  using (
    public.current_user_has_role('admin')
    and role = 'courier'
  )
  with check (
    role = 'courier'
    and courier_status in ('pending', 'approved', 'rejected')
  );
