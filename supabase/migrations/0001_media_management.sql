-- ============================================================
-- Migration 0001 — Admin Media Management
-- Adds the media_assets metadata table, two PUBLIC storage
-- buckets (images + videos), and row-level-security policies so
-- ONLY admins (admin_users) can upload / replace / delete, while
-- the public can read (needed for public URLs to resolve).
--
-- Safe to run multiple times (idempotent). Run AFTER schema.sql
-- in the Supabase SQL editor.
-- ============================================================

-- ---------- METADATA TABLE ----------

create table if not exists media_assets (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('image', 'video')),
  bucket      text not null,
  path        text not null,            -- object key within the bucket
  public_url  text not null,            -- generated public URL
  file_name   text not null,            -- original upload filename
  mime_type   text not null,
  size_bytes  bigint not null default 0,
  width       integer,                  -- images only (optional)
  height      integer,                  -- images only (optional)
  title       text,
  alt_text    text,
  created_at  timestamptz not null default now(),
  unique (bucket, path)
);

create index if not exists media_assets_type_idx       on media_assets (type);
create index if not exists media_assets_created_at_idx on media_assets (created_at desc);

-- ---------- ADMIN HELPER ----------
-- Some setups defined RLS with an inline admin check instead of this
-- helper. Define it here (idempotently) so this migration is fully
-- self-contained. security definer lets the Storage policies below read
-- admin_users regardless of that table's own select policy.

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- ---------- ROW LEVEL SECURITY (metadata) ----------

alter table media_assets enable row level security;

-- Public can READ metadata (so the site can render media). No PII here.
drop policy if exists "public read media assets" on media_assets;
create policy "public read media assets" on media_assets
  for select using (true);

-- Admins manage everything.
drop policy if exists "admin full access media assets" on media_assets;
create policy "admin full access media assets" on media_assets
  for all using (is_admin()) with check (is_admin());

-- ---------- STORAGE BUCKETS ----------
-- Public buckets so getPublicUrl() resolves without signing.
-- Per-bucket size limits + allowed MIME types are enforced by Storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-images', 'media-images', true,
  10485760,                                   -- 10 MB
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-videos', 'media-videos', true,
  209715200,                                  -- 200 MB
  array['video/mp4', 'video/quicktime', 'video/mov', 'video/webm']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------- STORAGE OBJECT POLICIES ----------
-- storage.objects already has RLS enabled by Supabase.
-- Scope every policy to OUR two buckets only.

drop policy if exists "public read media objects" on storage.objects;
create policy "public read media objects" on storage.objects
  for select using (bucket_id in ('media-images', 'media-videos'));

drop policy if exists "admin upload media objects" on storage.objects;
create policy "admin upload media objects" on storage.objects
  for insert with check (
    bucket_id in ('media-images', 'media-videos') and public.is_admin()
  );

drop policy if exists "admin update media objects" on storage.objects;
create policy "admin update media objects" on storage.objects
  for update using (
    bucket_id in ('media-images', 'media-videos') and public.is_admin()
  )
  with check (
    bucket_id in ('media-images', 'media-videos') and public.is_admin()
  );

drop policy if exists "admin delete media objects" on storage.objects;
create policy "admin delete media objects" on storage.objects
  for delete using (
    bucket_id in ('media-images', 'media-videos') and public.is_admin()
  );
