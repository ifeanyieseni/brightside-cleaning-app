/**
 * Every external image used on the public site, in one place.
 * All URLs are direct images.unsplash.com links, verified to load.
 * Swap any URL here and the site updates everywhere it is used.
 */

export const heroImages = {
  main: {
    src: 'https://images.unsplash.com/photo-1615529179035-e760f6a2dcee?auto=format&fit=crop&w=1600&q=80',
    alt: 'A bright, freshly cleaned living room filled with natural light',
  },
  accent: {
    src: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=800&q=80',
    alt: 'A gloved hand holding a spray bottle against a mint background',
  },
}

export const aboutImages = {
  main: {
    src: 'https://images.unsplash.com/photo-1758273705627-937374bfa978?auto=format&fit=crop&w=1200&q=80',
    alt: 'A professional cleaner vacuuming a bright living room',
  },
  secondary: {
    src: 'https://images.unsplash.com/photo-1758272421751-963195322eaa?auto=format&fit=crop&w=800&q=80',
    alt: 'A cleaner in gloves carefully wiping wooden shelves',
  },
}

/**
 * Service card images, matched by keywords in the service name so that
 * services created later in the dashboard still get a sensible visual.
 */
const serviceImagePool: { match: RegExp; src: string; alt: string }[] = [
  {
    match: /deep/i,
    src: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?auto=format&fit=crop&w=800&q=80',
    alt: 'Detailed surface cleaning with gloves and a spray bottle',
  },
  {
    match: /move/i,
    src: 'https://images.unsplash.com/photo-1613668816690-546c6fa9ad42?auto=format&fit=crop&w=800&q=80',
    alt: 'A bright, empty apartment room ready for handover',
  },
  {
    match: /apartment|condo/i,
    src: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80',
    alt: 'A tidy, well-kept apartment living room',
  },
  {
    match: /office|workspace|commercial/i,
    src: 'https://images.unsplash.com/photo-1604328727766-a151d1045ab4?auto=format&fit=crop&w=800&q=80',
    alt: 'A clean, modern office space with fresh plants',
  },
  {
    match: /renovation|construction|post/i,
    src: 'https://images.unsplash.com/photo-1632829882891-5047ccc421bc?auto=format&fit=crop&w=800&q=80',
    alt: 'A bright finished room, dust-free after renovation',
  },
  {
    match: /standard|home|house|regular|routine/i,
    src: 'https://images.unsplash.com/photo-1633505899118-4ca6bd143043?auto=format&fit=crop&w=800&q=80',
    alt: 'A spotless, calm living room after a routine cleaning',
  },
]

const fallbackServiceImage = {
  src: 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=800&q=80',
  alt: 'A fresh, clean home interior',
}

export function serviceImage(name: string): { src: string; alt: string } {
  const hit = serviceImagePool.find((p) => p.match.test(name))
  return hit ? { src: hit.src, alt: hit.alt } : fallbackServiceImage
}
