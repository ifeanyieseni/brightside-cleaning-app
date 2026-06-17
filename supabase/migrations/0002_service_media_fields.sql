-- ============================================================
-- Migration 0002 — Service catalog media + categorisation
-- Extends the existing `services` table with the fields the
-- seed data and richer service pages need:
--   category, slug, featured_image_url, gallery_images.
--
-- Safe to run multiple times (idempotent). Run AFTER schema.sql.
-- ============================================================

alter table services
  add column if not exists category           text,
  add column if not exists slug                text,
  add column if not exists featured_image_url  text,
  add column if not exists gallery_images      jsonb not null default '[]'::jsonb;

-- One service per slug (slug stays nullable for legacy rows).
create unique index if not exists services_slug_key
  on services (slug)
  where slug is not null;

create index if not exists services_category_idx
  on services (category);
