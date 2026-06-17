import { Link } from 'react-router-dom'
import { heroImages } from '../../config/images'
import type { BusinessSettings } from '../../lib/types'

export default function Hero({ settings }: { settings: BusinessSettings | null }) {
  return (
    <section className="hero" id="top">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="eyebrow rise">Premium home &amp; office cleaning</span>
          <h1 className="rise rise-1">
            A fresh, <em>spotless</em> home without lifting a finger
          </h1>
          <p className="hero-sub rise rise-2">
            Book a trusted cleaning team in under a minute. Flexible scheduling, careful
            attention to detail, and a home that feels brand new every visit.
          </p>
          <div className="hero-actions rise rise-3">
            <Link className="btn btn-primary" to="/booking">
              Book your cleaning
            </Link>
            <a className="btn btn-ghost" href="#services">
              See services &amp; pricing
            </a>
          </div>
          <div className="hero-note rise rise-4">
            <span className="dot-row" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Easy online booking · Vetted professional cleaners
            {settings?.business_phone ? <> · {settings.business_phone}</> : null}
          </div>
        </div>

        <div className="hero-visual rise rise-2">
          <div className="hero-img-main">
            <img src={heroImages.main.src} alt={heroImages.main.alt} />
          </div>
          <div className="hero-img-accent">
            <img src={heroImages.accent.src} alt={heroImages.accent.alt} loading="lazy" />
          </div>
          <div className="hero-chip">
            <span className="tick" aria-hidden="true">
              ✓
            </span>
            Cleaning booked for Saturday
          </div>
        </div>
      </div>
    </section>
  )
}
