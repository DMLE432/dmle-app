# DMLE MVP (Direct Med Logistics Exchange)

Next.js + Supabase MVP for a medical courier marketplace with three roles:
- **Shipper**: posts delivery jobs and views bids.
- **Courier**: views open jobs and submits bids (after admin approval).
- **Admin**: approves/rejects courier onboarding and monitors marketplace activity.

## Stack
- Next.js App Router + TypeScript + Tailwind CSS
- Supabase Auth + Postgres + Row-Level Security (RLS)

## Quick start
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env vars:
   ```bash
   cp .env.example .env.local
   ```
3. Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. In Supabase SQL editor, run:
   ```sql
   -- paste supabase/schema.sql
   ```
5. Run app:
   ```bash
   npm run dev
   ```

## Implemented MVP modules
- Authentication and role-based access.
- Shipper dashboard with job posting + job list.
- Courier dashboard with open jobs + bid submission.
- Admin dashboard with courier approval flow + activity feed.
- Modular data model for future payment/maps/tracking extensions.

## App routes
- `/` landing
- `/login`, `/signup`
- `/shipper`
- `/courier`
- `/admin`
- `/dashboard` role-aware redirector
