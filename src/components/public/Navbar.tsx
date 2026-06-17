import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BusinessSettings } from '../../lib/types'

const links = [
  { label: 'Services', href: '/#services' },
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/#contact' },
]

export default function Navbar({ settings }: { settings: BusinessSettings | null }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const name = settings?.business_name ?? 'Brightside Cleaning'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => setOpen(false)

  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="container nav-inner">
        <a href="/#top" className="brand" onClick={close}>
          <span className="brand-bubble" aria-hidden="true" />
          <span className="brand-name">{name}</span>
        </a>

        <nav className="nav-links" aria-label="Primary">
          {links.map((l) => (
            <a key={l.href} className="nav-link" href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="nav-cta">
          <Link className="btn btn-primary btn-sm" to="/booking">
            Book a Cleaning
          </Link>
        </div>

        <button
          className={`nav-burger ${open ? 'open' : ''}`}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className={`nav-panel ${open ? 'open' : ''}`}>
        {links.map((l) => (
          <a key={l.href} href={l.href} onClick={close}>
            {l.label}
          </a>
        ))}
        <Link className="btn btn-primary" to="/booking" onClick={close}>
          Book a Cleaning
        </Link>
      </div>
    </header>
  )
}
