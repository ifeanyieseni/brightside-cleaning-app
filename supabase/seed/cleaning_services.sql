-- ============================================================
-- Seed — Cleaning service catalog (18 services, 3 categories)
-- Each service gets: title (name), description, category, slug,
-- a featured image and a 3–5 image gallery. All photos are
-- direct images.unsplash.com links, each verified to return 200.
--
-- Idempotent: upserts by slug, so re-running refreshes content
-- without creating duplicates. Run AFTER migration 0002.
--
-- NOTE: the six starter services from schema.sql (no slug) are
-- left untouched. Deactivate or delete them in the dashboard if
-- you want only this catalog to show publicly.
-- ============================================================

with img(k, url) as (values
  ('living',    'https://images.unsplash.com/photo-1615529179035-e760f6a2dcee?auto=format&fit=crop&w=1200&q=80'),
  ('spray',     'https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=1200&q=80'),
  ('vacuum',    'https://images.unsplash.com/photo-1758273705627-937374bfa978?auto=format&fit=crop&w=1200&q=80'),
  ('shelves',   'https://images.unsplash.com/photo-1758272421751-963195322eaa?auto=format&fit=crop&w=1200&q=80'),
  ('detail',    'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=1200&q=80'),
  ('empty',     'https://images.unsplash.com/photo-1613668816690-546c6fa9ad42?auto=format&fit=crop&w=1200&q=80'),
  ('apt',       'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80'),
  ('office1',   'https://images.unsplash.com/photo-1604328727766-a151d1045ab4?auto=format&fit=crop&w=1200&q=80'),
  ('postreno',  'https://images.unsplash.com/photo-1632829882891-5047ccc421bc?auto=format&fit=crop&w=1200&q=80'),
  ('spotless',  'https://images.unsplash.com/photo-1633505899118-4ca6bd143043?auto=format&fit=crop&w=1200&q=80'),
  ('fresh',     'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=1200&q=80'),
  ('supplies',  'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80'),
  ('spray2',    'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=1200&q=80'),
  ('products',  'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80'),
  ('office2',   'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=1200&q=80'),
  ('office3',   'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80'),
  ('office4',   'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=80'),
  ('kitchen1',  'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1200&q=80'),
  ('window',    'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=1200&q=80'),
  ('carpet',    'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=1200&q=80'),
  ('bath1',     'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80'),
  ('bath2',     'https://images.unsplash.com/photo-1584622781564-1d987f7333c1?auto=format&fit=crop&w=1200&q=80'),
  ('wipe',      'https://images.unsplash.com/photo-1581578017093-cd30fce4eeb7?auto=format&fit=crop&w=1200&q=80'),
  ('kitchen2',  'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=1200&q=80'),
  ('kitchen3',  'https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=1200&q=80')
),
svc(name, slug, category, description, duration_minutes, price, featured_key, gallery_keys) as (values
  -- ---------- Residential ----------
  ('Home Cleaning', 'home-cleaning', 'Residential',
   'Routine whole-home cleaning — dusting, vacuuming, mopping, and fresh kitchen and bathroom surfaces, room by room.',
   120, 120.00, 'living', array['vacuum','spotless','fresh','shelves']),
  ('Apartment Cleaning', 'apartment-cleaning', 'Residential',
   'Right-sized cleaning for apartments and condos — efficient, thorough, and scheduled around your day.',
   90, 95.00, 'apt', array['living','fresh','spotless']),
  ('Deep Cleaning', 'deep-cleaning', 'Residential',
   'A detailed top-to-bottom clean: baseboards, behind furniture, inside appliances, and careful tile and grout attention.',
   240, 260.00, 'detail', array['spray','shelves','supplies','spotless']),
  ('Kitchen Deep Cleaning', 'kitchen-deep-cleaning', 'Residential',
   'Degreased hoods, scrubbed backsplashes, sanitised counters, and cleaned appliance interiors — a spotless, ready-to-cook kitchen.',
   150, 160.00, 'kitchen1', array['kitchen2','kitchen3','detail']),
  ('Bathroom Deep Cleaning', 'bathroom-deep-cleaning', 'Residential',
   'Descaled tiles, polished fixtures, sanitised toilets and showers — a fresh, hygienic bathroom from floor to fittings.',
   120, 140.00, 'bath1', array['bath2','detail','spray']),
  ('Airbnb Cleaning', 'airbnb-cleaning', 'Residential',
   'Fast, reliable turnover cleaning between guests — fresh linens, restocked essentials, and a five-star-ready space every time.',
   120, 130.00, 'fresh', array['living','kitchen2','bath2','spotless']),

  -- ---------- Commercial ----------
  ('Office Cleaning', 'office-cleaning', 'Commercial',
   'Workspace cleaning for small offices — desks, floors, kitchens, and shared areas your team will notice.',
   180, 210.00, 'office1', array['office2','office3','office4']),
  ('Corporate Cleaning', 'corporate-cleaning', 'Commercial',
   'Scheduled cleaning programs for larger corporate floors — meeting rooms, reception, breakout spaces, and high-touch points.',
   240, 320.00, 'office3', array['office1','office4','office2']),
  ('Workspace Sanitation', 'workspace-sanitation', 'Commercial',
   'Disinfection-focused service targeting desks, keyboards, door handles, and shared surfaces to keep teams healthy.',
   120, 180.00, 'office2', array['spray','products','office4']),
  ('Industrial Cleaning', 'industrial-cleaning', 'Commercial',
   'Heavy-duty cleaning for warehouses, plants, and facilities — durable surfaces, machinery surrounds, and large floor areas.',
   300, 420.00, 'postreno', array['supplies','detail','office4']),
  ('School Cleaning', 'school-cleaning', 'Commercial',
   'Classroom, hallway, and common-area cleaning on a schedule that keeps learning spaces safe, tidy, and sanitised.',
   240, 300.00, 'office4', array['office1','vacuum','spray2']),
  ('Hospital Cleaning', 'hospital-cleaning', 'Commercial',
   'Clinical-grade cleaning and disinfection for healthcare settings, following strict hygiene and infection-control standards.',
   300, 480.00, 'products', array['spray','detail','supplies']),

  -- ---------- Specialty ----------
  ('Move-In / Move-Out Cleaning', 'move-in-move-out-cleaning', 'Specialty',
   'Empty-home cleaning that gets every cabinet, closet, and corner ready for handover or a fresh start.',
   300, 320.00, 'empty', array['apt','fresh','spotless']),
  ('Post-Construction Cleaning', 'post-construction-cleaning', 'Specialty',
   'Fine dust removal, surface polishing, and a complete refresh after building, renovation, or remodeling work.',
   360, 460.00, 'postreno', array['detail','supplies','fresh']),
  ('Carpet Cleaning', 'carpet-cleaning', 'Specialty',
   'Deep extraction cleaning that lifts dirt, allergens, and stains from carpets and rugs, leaving fibres fresh and soft.',
   120, 150.00, 'carpet', array['vacuum','living','spotless']),
  ('Upholstery Cleaning', 'upholstery-cleaning', 'Specialty',
   'Gentle, fabric-safe cleaning for sofas, chairs, and soft furnishings — refreshed colour and lifted, ground-in grime.',
   120, 140.00, 'shelves', array['spray','detail','living']),
  ('Window Cleaning', 'window-cleaning', 'Specialty',
   'Streak-free interior and exterior glass, frames, and sills — brighter rooms and a crisp, clear view.',
   90, 110.00, 'window', array['spray2','fresh','living']),
  ('Event Cleanup', 'event-cleanup', 'Specialty',
   'Before-and-after event cleaning — rapid setup tidying and full post-event cleanup so the venue is spotless again.',
   180, 240.00, 'spray2', array['supplies','vacuum','fresh'])
)
insert into services
  (name, slug, category, description, duration_minutes, price, is_active, featured_image_url, gallery_images)
select
  s.name, s.slug, s.category, s.description, s.duration_minutes, s.price, true,
  (select url from img where img.k = s.featured_key),
  (
    select coalesce(jsonb_agg(img.url order by g.ord), '[]'::jsonb)
    from unnest(s.gallery_keys) with ordinality as g(gkey, ord)
    join img on img.k = g.gkey
  )
from svc s
-- Match the PARTIAL unique index from migration 0002
-- (services_slug_key ... where slug is not null); the predicate is
-- required for Postgres to infer a partial index as the conflict target.
on conflict (slug) where slug is not null do update set
  name               = excluded.name,
  category           = excluded.category,
  description        = excluded.description,
  duration_minutes   = excluded.duration_minutes,
  price              = excluded.price,
  is_active          = excluded.is_active,
  featured_image_url = excluded.featured_image_url,
  gallery_images     = excluded.gallery_images;
