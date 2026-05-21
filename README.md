# DMLE MVP (Direct Med Logistics Exchange)

Next.js + Supabase MVP for a medical courier marketplace with three roles:
- **Shipper**: posts shipment requests with medical handling details, views bids, and accepts a courier bid.
- **Courier**: views open shipments and submits bids with price, ETA, and notes after admin approval.
- **Admin**: approves/rejects courier onboarding and monitors all shipments and bids.

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
- Shipper dashboard with shipment posting, bid review, and bid acceptance.
- Courier dashboard with available shipments and bid submission.
- Admin dashboard with courier approval flow plus all-shipment and all-bid views.
- Modular data model for future payment/maps/tracking extensions.

## App routes
- `/` landing
- `/login`, `/signup`
- `/shipper`
- `/courier`
- `/admin`
- `/dashboard` role-aware redirector
