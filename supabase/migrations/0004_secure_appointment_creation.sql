-- ============================================================
-- Migration 0004 — secure appointment creation
--
-- Closes three holes in the public booking path:
--   2. The anon role could INSERT unlimited rows into `appointments`
--      (policy `with check (true)`). That direct path is removed.
--   3. Times / dates / service validity were trusted from the client.
--      They are now re-validated SERVER-SIDE in create_appointment().
--   4. Two people could book the same slot at once (client-only check).
--      A DB EXCLUDE constraint now makes overlaps impossible.
--
-- Idempotent — safe to run multiple times. Run AFTER schema.sql.
-- ============================================================

-- ---------- (2) remove the wide-open public INSERT path ----------
-- Public bookings now go exclusively through create_appointment() (a
-- SECURITY DEFINER function); the anon role keeps NO direct insert rights.
drop policy if exists "public create appointments" on appointments;

-- ---------- (4) DB-level no-overlap guard ----------
-- Prevents any two non-cancelled appointments from overlapping in time —
-- the real defence against the concurrent double-booking race that a
-- client-side availability check can never win. tsrange defaults to
-- '[)' so back-to-back bookings (end == next start) are allowed.
-- NOTE: if existing rows already overlap, clean them up before this runs.
alter table appointments drop constraint if exists appointments_no_overlap;
alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    tsrange(appointment_date + start_time, appointment_date + end_time) with &&
  ) where (status <> 'cancelled');

-- ---------- (3) server-authoritative booking entry point ----------
-- Re-validates everything the UI checks, computes end_time from the
-- service duration (never trusting the client), and always stores
-- status = 'pending'. Raises clean, user-facing errors:
--   23514 (check_violation)     -> a validation message to show the user
--   23P01 (exclusion_violation) -> the slot was just taken
create or replace function create_appointment(
  p_full_name        text,
  p_email            text,
  p_phone            text,
  p_service_id       uuid,
  p_appointment_date date,
  p_start_time       time,
  p_notes            text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service   services%rowtype;
  v_settings  business_settings%rowtype;
  v_hours     business_hours%rowtype;
  v_start_ts  timestamp;
  v_end_ts    timestamp;
  v_end_time  time;
  v_weekday   int;
  v_new_id    uuid;
begin
  -- ---- never trust the client: normalise + validate the basics ----
  p_full_name := btrim(coalesce(p_full_name, ''));
  p_email     := btrim(coalesce(p_email, ''));
  p_phone     := btrim(coalesce(p_phone, ''));
  p_notes     := nullif(btrim(coalesce(p_notes, '')), '');

  if length(p_full_name) < 2 then
    raise exception 'Please enter your full name.' using errcode = 'check_violation';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.' using errcode = 'check_violation';
  end if;
  if length(p_phone) < 7 then
    raise exception 'Please enter a valid phone number.' using errcode = 'check_violation';
  end if;

  -- ---- the service must exist and be bookable ----
  select * into v_service from services where id = p_service_id;
  if not found or not v_service.is_active then
    raise exception 'That service is not available for booking.' using errcode = 'check_violation';
  end if;

  -- ---- end time is computed from the service duration, server-side ----
  v_start_ts := p_appointment_date + p_start_time;
  v_end_ts   := v_start_ts + make_interval(mins => v_service.duration_minutes);
  v_end_time := v_end_ts::time;

  -- ---- booking rules come from settings ----
  select * into v_settings from business_settings order by created_at limit 1;
  if not found then
    raise exception 'Booking is not configured yet. Please contact us directly.'
      using errcode = 'check_violation';
  end if;

  -- notice window: the slot must be at least N hours out (server local time)
  if v_start_ts < localtimestamp + make_interval(hours => coalesce(v_settings.booking_notice_hours, 0)) then
    raise exception 'That time is too soon to book. Please choose a later slot.'
      using errcode = 'check_violation';
  end if;

  -- ---- the weekday must be open and the slot inside business hours ----
  v_weekday := extract(dow from p_appointment_date)::int; -- 0 = Sun .. 6 = Sat
  select * into v_hours from business_hours where weekday = v_weekday;
  if not found or not v_hours.is_open then
    raise exception 'We are closed on that day. Please choose another date.'
      using errcode = 'check_violation';
  end if;
  if p_start_time < v_hours.start_time or v_end_ts > (p_appointment_date + v_hours.end_time) then
    raise exception 'That time is outside our working hours.' using errcode = 'check_violation';
  end if;

  -- ---- the date must not be blocked ----
  if exists (select 1 from blocked_dates where blocked_date = p_appointment_date) then
    raise exception 'That date is unavailable. Please choose another date.'
      using errcode = 'check_violation';
  end if;

  -- ---- no overlap with an existing (non-cancelled) appointment ----
  -- Friendly pre-check; the exclusion constraint is the race-proof guard.
  if exists (
    select 1 from appointments a
    where a.appointment_date = p_appointment_date
      and a.status <> 'cancelled'
      and a.start_time < v_end_time
      and a.end_time   > p_start_time
  ) then
    raise exception 'Sorry, that time was just booked. Please pick another slot.'
      using errcode = 'exclusion_violation';
  end if;

  -- ---- insert; status always starts as 'pending' ----
  begin
    insert into appointments (
      full_name, email, phone, service_id,
      appointment_date, start_time, end_time, status, notes
    ) values (
      p_full_name, p_email, p_phone, p_service_id,
      p_appointment_date, p_start_time, v_end_time, 'pending', p_notes
    )
    returning id into v_new_id;
  exception when exclusion_violation then
    -- Lost the race to a concurrent booking for the same slot.
    raise exception 'Sorry, that time was just booked. Please pick another slot.'
      using errcode = 'exclusion_violation';
  end;

  return v_new_id;
end;
$$;

grant execute on function create_appointment(text, text, text, uuid, date, time, text)
  to anon, authenticated;
