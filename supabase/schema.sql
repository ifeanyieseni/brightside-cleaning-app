-- ============================================================
-- Brightside Cleaning — Supabase schema
-- Run this whole file in the Supabase SQL editor (one time).
-- ============================================================

-- ---------- TABLES ----------

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  duration_minutes integer not null default 60,
  price numeric(10, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  service_id uuid references services (id),
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);

-- No two non-cancelled appointments may overlap in time — the DB-level
-- guard against the concurrent double-booking race. Idempotent; tsrange
-- defaults to '[)' so back-to-back bookings (end == next start) are fine.
alter table appointments drop constraint if exists appointments_no_overlap;
alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    tsrange(appointment_date + start_time, appointment_date + end_time) with &&
  ) where (status <> 'cancelled');

create table if not exists business_hours (
  id uuid primary key default gen_random_uuid(),
  weekday integer not null unique, -- 0 = Sunday ... 6 = Saturday
  is_open boolean not null default true,
  start_time time not null default '08:00',
  end_time time not null default '17:00'
);

create table if not exists blocked_dates (
  id uuid primary key default gen_random_uuid(),
  blocked_date date not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists business_settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'Brightside Cleaning',
  business_email text not null default 'hello@brightsidecleaning.com',
  business_phone text not null default '(555) 014-2200',
  business_address text not null default '214 Fairview Avenue, Portland, OR',
  slot_interval_minutes integer not null default 30,
  booking_notice_hours integer not null default 12,
  created_at timestamptz not null default now()
);

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------- ROW LEVEL SECURITY ----------

alter table services enable row level security;
alter table appointments enable row level security;
alter table business_hours enable row level security;
alter table blocked_dates enable row level security;
alter table business_settings enable row level security;
alter table admin_users enable row level security;

-- Helper: is the current auth user an admin?
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- services: everyone can read ACTIVE services; admins manage all
create policy "public read active services" on services
  for select using (is_active = true);
create policy "admin full access services" on services
  for all using (is_admin()) with check (is_admin());

-- appointments: NO public read and NO public insert. Public bookings go
-- through the create_appointment() SECURITY DEFINER function below, which
-- validates server-side and is overlap-guarded. Admins manage everything.
create policy "admin full access appointments" on appointments
  for all using (is_admin()) with check (is_admin());

-- business_hours / blocked_dates / business_settings:
-- public read (needed for booking + site contact info); admins manage
create policy "public read business hours" on business_hours
  for select using (true);
create policy "admin full access business hours" on business_hours
  for all using (is_admin()) with check (is_admin());

create policy "public read blocked dates" on blocked_dates
  for select using (true);
create policy "admin full access blocked dates" on blocked_dates
  for all using (is_admin()) with check (is_admin());

create policy "public read business settings" on business_settings
  for select using (true);
create policy "admin full access business settings" on business_settings
  for all using (is_admin()) with check (is_admin());

-- admin_users: a signed-in user can only see their own row
create policy "read own admin row" on admin_users
  for select using (user_id = auth.uid());

-- ---------- BOOKED-RANGES RPC ----------
-- The public cannot read appointments, but the booking flow needs to
-- know which time ranges are taken. This function returns ONLY the
-- start/end times for a single date — no personal data.

create or replace function get_booked_ranges(p_date date)
returns table (start_time time, end_time time)
language sql stable security definer set search_path = public as $$
  select a.start_time, a.end_time
  from appointments a
  where a.appointment_date = p_date
    and a.status <> 'cancelled';
$$;

grant execute on function get_booked_ranges(date) to anon, authenticated;

-- ---------- SECURE BOOKING ENTRY POINT ----------
-- The public has no direct INSERT on appointments. This SECURITY DEFINER
-- function is the only public way to book: it re-validates every rule the
-- UI checks, computes end_time from the service duration (never trusting
-- the client), forces status = 'pending', and is overlap-guarded by the
-- appointments_no_overlap exclusion constraint. It raises clean errors:
--   23514 (check_violation)     -> a user-facing validation message
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
  -- never trust the client: normalise + validate the basics
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

  -- the service must exist and be bookable
  select * into v_service from services where id = p_service_id;
  if not found or not v_service.is_active then
    raise exception 'That service is not available for booking.' using errcode = 'check_violation';
  end if;

  -- end time is computed from the service duration, server-side
  v_start_ts := p_appointment_date + p_start_time;
  v_end_ts   := v_start_ts + make_interval(mins => v_service.duration_minutes);
  v_end_time := v_end_ts::time;

  -- booking rules come from settings
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

  -- the weekday must be open and the slot inside business hours
  v_weekday := extract(dow from p_appointment_date)::int; -- 0 = Sun .. 6 = Sat
  select * into v_hours from business_hours where weekday = v_weekday;
  if not found or not v_hours.is_open then
    raise exception 'We are closed on that day. Please choose another date.'
      using errcode = 'check_violation';
  end if;
  if p_start_time < v_hours.start_time or v_end_ts > (p_appointment_date + v_hours.end_time) then
    raise exception 'That time is outside our working hours.' using errcode = 'check_violation';
  end if;

  -- the date must not be blocked
  if exists (select 1 from blocked_dates where blocked_date = p_appointment_date) then
    raise exception 'That date is unavailable. Please choose another date.'
      using errcode = 'check_violation';
  end if;

  -- no overlap with an existing (non-cancelled) appointment (friendly pre-check)
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

  -- insert; the exclusion constraint is the race-proof guard
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
    raise exception 'Sorry, that time was just booked. Please pick another slot.'
      using errcode = 'exclusion_violation';
  end;

  return v_new_id;
end;
$$;

grant execute on function create_appointment(text, text, text, uuid, date, time, text)
  to anon, authenticated;

-- ---------- SEED DATA ----------

insert into business_settings (business_name)
select 'Brightside Cleaning'
where not exists (select 1 from business_settings);

insert into business_hours (weekday, is_open, start_time, end_time)
values
  (0, false, '09:00', '14:00'), -- Sunday closed
  (1, true,  '08:00', '17:00'),
  (2, true,  '08:00', '17:00'),
  (3, true,  '08:00', '17:00'),
  (4, true,  '08:00', '17:00'),
  (5, true,  '08:00', '17:00'),
  (6, true,  '09:00', '14:00')  -- Saturday short day
on conflict (weekday) do nothing;

insert into services (name, description, duration_minutes, price, is_active)
select * from (values
  ('Standard Home Cleaning', 'Routine cleaning for every room — dusting, vacuuming, mopping, kitchen and bathroom surfaces left fresh.', 120, 120.00, true),
  ('Deep Cleaning', 'A detailed top-to-bottom clean: baseboards, behind furniture, inside appliances, tile and grout attention.', 240, 260.00, true),
  ('Move-In / Move-Out Cleaning', 'Empty-home cleaning that gets every cabinet, closet, and corner ready for handover or a fresh start.', 300, 320.00, true),
  ('Apartment Cleaning', 'Right-sized cleaning for apartments and condos — efficient, thorough, and scheduled around your day.', 90, 95.00, true),
  ('Office Cleaning', 'Workspace cleaning for small offices — desks, floors, kitchens, and shared areas your team will notice.', 180, 210.00, true),
  ('Post-Renovation Cleaning', 'Fine dust removal, surface polishing, and a complete refresh after building or remodeling work.', 300, 340.00, true)
) as seed(name, description, duration_minutes, price, is_active)
where not exists (select 1 from services);

-- ---------- MAKE YOURSELF AN ADMIN ----------
-- 1. In Supabase: Authentication -> Users -> Add user (email + password).
-- 2. Copy that user's UUID.
-- 3. Run:
-- insert into admin_users (user_id) values ('PASTE-AUTH-USER-UUID-HERE');
