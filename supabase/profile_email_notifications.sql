-- Run in the Supabase SQL editor for existing DMLE databases.
-- Adds profile email storage for private-beta logistics notifications.
-- This does not drop or recreate any tables.

alter table public.profiles
  add column if not exists email text;

update public.profiles
set email = lower(btrim(email))
where email is not null;

update public.profiles
set email = null
where email = '';

update public.profiles p
set email = lower(btrim(u.email))
from auth.users u
where p.id = u.id
  and p.email is null
  and u.email is not null;
