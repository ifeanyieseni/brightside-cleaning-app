import { SprayCan } from 'lucide-react'
import { serviceImage } from '../../config/images'
import type { Service } from '../../lib/types'

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr${h > 1 ? 's' : ''}`
  return `${h} hr ${m} min`
}

export default function Services({
  services,
  onBook,
}: {
  services: Service[]
  onBook: (id: string) => void
}) {
  return (
    <section className="section" id="services">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">What we clean</span>
          <h2>Services built around your space</h2>
          <p>
            Every cleaning includes our full supply kit and a careful, room-by-room
            checklist. Pick the service that fits — we handle the rest.
          </p>
        </div>

        {services.length === 0 ? (
          <div className="empty-state panel">
            <div className="glyph" aria-hidden="true">
              <SprayCan size={26} />
            </div>
            <b>Services coming soon</b>
            We’re updating our service list — please check back shortly.
          </div>
        ) : (
          <div className="services-grid">
            {services.map((s) => {
              const fallback = serviceImage(s.name)
              const src = s.featured_image_url || fallback.src
              const alt = s.featured_image_url ? s.name : fallback.alt
              return (
                <article className="service-card" key={s.id}>
                  <div className="service-media">
                    <img src={src} alt={alt} loading="lazy" />
                    <span className="service-price">${Number(s.price).toFixed(0)}</span>
                  </div>
                  <div className="service-body">
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <div className="service-meta">
                      <span className="service-duration">{formatDuration(s.duration_minutes)}</span>
                      <button className="btn btn-quiet btn-sm" onClick={() => onBook(s.id)}>
                        Book this service →
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
