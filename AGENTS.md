# AGENTS.md

Guidance for Codex and other AI agents working in this repository.

## Product Description

DMLE is Direct Med Logistics Exchange, a Florida medical logistics marketplace where approved shippers such as labs, hospitals, pharmacies, and medical groups post routine, next-day, and STAT courier jobs. Approved couriers can bid on jobs, perform status updates, and upload proof of delivery.

## Current MVP Flow

shipper creates shipment -> courier views shipment -> courier submits bid -> shipper accepts bid -> courier updates status -> courier uploads proof of delivery -> admin reviews.

## Current Technical Stack

- Next.js 14 App Router
- React 18
- TypeScript strict mode
- Tailwind CSS
- Supabase Auth, Postgres, and Row-Level Security (RLS)
- Supabase SSR clients
- Server actions in `src/lib/actions.ts`
- Database schema in `supabase/schema.sql`
- Roles: `shipper`, `courier`, `admin`

## Hard No-PHI Policy

This MVP must not store or transmit patient names, DOB, MRN, SSN, diagnosis, insurance information, test results, patient identifiers, or specimen identifiers tied to a patient.

Do not add fields, UI labels, logs, uploads, examples, seed data, or documentation that encourage users to enter PHI. Treat free-text fields, notes, proof uploads, filenames, and error logs as PHI risk areas. When adding validation or UX copy, steer users toward logistics-only information.

## Allowed Logistics-Safe Data

The following data is appropriate for this MVP when it is not tied to patient-identifying information:

- `shipment_id`
- `external_order_id`
- Facility name
- Pickup location
- Delivery location
- Pickup window
- Delivery deadline
- Service level
- Item category
- Required vehicle/cooler info
- Courier bid
- Status
- Proof-of-delivery metadata

## Engineering Rules

- Make small changes.
- Do not rewrite unrelated files.
- Do not add dependencies without asking.
- Preserve strict TypeScript.
- Always surface Supabase and server-action errors to the user.
- Never silently ignore errors.
- Reuse existing components where possible.
- Add loading, empty, success, and error states where relevant.
- Explain files changed after the task.

## Security Rules

- Respect `shipper`, `courier`, and `admin` roles.
- Use Supabase RLS for role-sensitive tables.
- Never expose service role keys to the frontend.
- Do not trust frontend-only filtering.
- Add server-side authorization checks.
- Do not log PHI or secrets.

## Done Means

- The app still builds.
- Existing core flow is not broken.
- Any schema or RLS change is explained.
- Manual test steps are provided.
