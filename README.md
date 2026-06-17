# Brightside Cleaning — Booking Platform

Premium cleaning-service booking website with a real Supabase backend and a
secure admin dashboard. React + TypeScript + Vite.

## What's inside

- **Public site** (`/`) — hero, services (live from Supabase), about, 4-step
  booking flow with real availability, success confirmation, footer.
- **Admin dashboard** (`/admin`) — Supabase Auth login, admin verification via
  `admin_users.user_id`, then: Overview, Appointments (status management),
  Services (add/edit/activate/deactivate), **Media Library**, Business Hours,
  Blocked Dates and Business Settings — all fully editable.
- **Media Library** (`/admin` → Media Library) — upload images (JPG/PNG/WEBP)
  and videos (MP4/MOV/WEBM) to Supabase Storage with drag-and-drop, live preview
  and per-file upload progress; search, filter by type, copy public URLs, and
  replace or delete assets. Uploads are admin-only (RLS); files are publicly
  readable so their URLs resolve anywhere.

## Setup (one time, ~5 minutes)

1. **Install** (already done if `node_modules` exists):

   ```
   npm install
   ```

2. **Connect Supabase** — open `.env` and replace the placeholders:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-ANON-KEY
   ```

   Both values are in your Supabase dashboard under **Settings → API**.

3. **Create the database** — in Supabase, open **SQL Editor**, then run these
   files **in order** (each is idempotent — safe to re-run):

   1. [`supabase/schema.sql`](supabase/schema.sql) — base tables, RLS policies,
      the `get_booked_ranges` function, default hours/settings, starter services.
   2. [`supabase/migrations/0001_media_management.sql`](supabase/migrations/0001_media_management.sql)
      — `media_assets` table, the `media-images` + `media-videos` storage
      buckets, and admin-only upload / public-read policies.
   3. [`supabase/migrations/0002_service_media_fields.sql`](supabase/migrations/0002_service_media_fields.sql)
      — adds `category`, `slug`, `featured_image_url`, `gallery_images` to
      `services`.
   4. [`supabase/migrations/0003_get_booked_ranges.sql`](supabase/migrations/0003_get_booked_ranges.sql)
      — the `get_booked_ranges(date)` security-definer function the **public
      booking flow** uses to hide already-booked time slots (the public can't
      read `appointments` directly). Required for booking. *(The bundled
      `schema.sql` already includes this function — only run `0003` separately
      if your database was created from a schema that omits it.)*
   5. [`supabase/migrations/0004_secure_appointment_creation.sql`](supabase/migrations/0004_secure_appointment_creation.sql)
      — removes the public direct-insert on `appointments`, adds the
      `appointments_no_overlap` exclusion constraint (no concurrent
      double-booking), and adds the `create_appointment()` function the
      booking page now calls. Required for booking. *(Also folded into the
      bundled `schema.sql`; run separately only on a database created from an
      older schema.)*
   6. [`supabase/seed/cleaning_services.sql`](supabase/seed/cleaning_services.sql)
      — 18 sample cleaning services (Residential / Commercial / Specialty) with
      Unsplash featured + gallery images. Optional but recommended.

   **No new environment variables are required** — Storage uses the same
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` you already set.

4. **Create your admin login**:
   - Supabase → **Authentication → Users → Add user** (email + password).
   - Copy the new user's UUID.
   - SQL Editor:

     ```sql
     insert into admin_users (user_id) values ('PASTE-THE-UUID-HERE');
     ```

5. **Run it**:

   ```
   npm run dev
   ```

   Public site: `http://localhost:5174` · Admin: `http://localhost:5174/admin`
   (the port is fixed to 5174 via `strictPort`; free it first if it's in use).

## How availability works

Slots are generated from `business_hours` (per weekday) stepped by
`business_settings.slot_interval_minutes`. Each slot's end time comes from the
selected service's `duration_minutes`. A slot is hidden when it:

- falls outside working hours,
- lands on a `blocked_dates` entry,
- starts before now + `booking_notice_hours`,
- overlaps any non-cancelled appointment (`new_start < existing_end AND
  new_end > existing_start`).

The public has **no read access to appointments** — conflict checking goes
through the `get_booked_ranges(date)` security-definer function, which returns
only start/end times.

These same rules are also enforced **server-side** on write: the public cannot
insert appointments directly. Bookings go through the `create_appointment()`
function, which re-validates the service, business hours, blocked dates and
notice window, computes `end_time` from the service duration (the client's
value is never trusted), and is backed by the `appointments_no_overlap`
exclusion constraint so two people can never book the same slot.

## Notes

- Images are defined in [`src/config/images.ts`](src/config/images.ts) — swap
  any URL there to rebrand the photography.
- The admin session persists in the browser; signing out only happens via the
  Sign out button.
- Services deactivated in the dashboard disappear from the public site but stay
  in the admin list (history-safe; appointments may reference them).
