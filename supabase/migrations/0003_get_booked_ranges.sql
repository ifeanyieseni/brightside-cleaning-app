-- ============================================================
-- Migration 0003 — get_booked_ranges() RPC
-- The public booking flow must know which time ranges are taken
-- so it can hide overlapping slots — but the public has NO select
-- access to `appointments` (RLS: admins only). This security-definer
-- function returns ONLY the start/end times for a single date, with
-- NO personal data, and explicitly ignores cancelled appointments.
--
-- Safe to run multiple times (create or replace). Run AFTER the base
-- schema that creates the `appointments` table.
-- ============================================================

create or replace function get_booked_ranges(p_date date)
returns table (start_time time, end_time time)
language sql
stable
security definer
set search_path = public
as $$
  select a.start_time, a.end_time
  from appointments a
  where a.appointment_date = p_date
    and a.status <> 'cancelled';
$$;

-- The booking page runs as the anon role (and admins as authenticated).
grant execute on function get_booked_ranges(date) to anon, authenticated;
