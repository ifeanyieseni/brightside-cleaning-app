import { Link } from 'react-router-dom'
import type { BusinessSettings } from '../../lib/types'

export default function Footer({ settings }: { settings: BusinessSettings | null }) {
  const name = settings?.business_name ?? 'Brightside Cleaning'
  const year = new Date().getFullYear()

  return (
    <footer className="footer" id="contact">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="brand">
              <span className="brand-bubble" aria-hidden="true" />
              <span className="brand-name">{name}</span>
            </div>
            <p className="footer-tag">
              Premium home and office cleaning with easy online booking and a team that
              sweats the details.
            </p>
          </div>

          <div>
            <h4>Contact</h4>
            <ul className="footer-list">
              {settings?.business_phone && (
                <li>
                  <a href={`tel:${settings.business_phone.replace(/[^\d+]/g, '')}`}>
                    {settings.business_phone}
                  </a>
                </li>
              )}
              {settings?.business_email && (
                <li>
                  <a href={`mailto:${settings.business_email}`}>{settings.business_email}</a>
                </li>
              )}
              {settings?.business_address && <li>{settings.business_address}</li>}
            </ul>
          </div>

          <div>
            <h4>Explore</h4>
            <ul className="footer-list">
              <li>
                <a href="/#services">Services</a>
              </li>
              <li>
                <a href="/#about">About us</a>
              </li>
              <li>
                <Link to="/booking">Book a cleaning</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bar">
          <span>
            © {year} {name}. All rights reserved.
          </span>
          <span>Fresh homes, happy clients.</span>
        </div>
      </div>
    </footer>
  )
}
