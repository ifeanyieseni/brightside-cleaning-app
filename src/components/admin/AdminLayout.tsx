import { useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  SprayCan,
  Images,
  Clock,
  CalendarOff,
  Settings,
  LogOut,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Overview from './Overview'
import Appointments from './Appointments'
import ServicesAdmin from './ServicesAdmin'
import MediaAdmin from './MediaAdmin'
import BusinessHoursAdmin from './BusinessHoursAdmin'
import BlockedDatesAdmin from './BlockedDatesAdmin'
import SettingsAdmin from './SettingsAdmin'

const pages = [
  { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { key: 'appointments', label: 'Appointments', Icon: CalendarDays },
  { key: 'services', label: 'Services', Icon: SprayCan },
  { key: 'media', label: 'Media Library', Icon: Images },
  { key: 'hours', label: 'Business Hours', Icon: Clock },
  { key: 'blocked', label: 'Blocked Dates', Icon: CalendarOff },
  { key: 'settings', label: 'Settings', Icon: Settings },
] as const

type PageKey = (typeof pages)[number]['key']

export default function AdminLayout({ email }: { email: string | null }) {
  const [page, setPage] = useState<PageKey>('overview')

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div>
          <span className="brand-name">Brightside</span>
          <span className="brand-sub">Cleaning Admin</span>
        </div>

        <nav className="admin-nav" aria-label="Dashboard">
          {pages.map((p) => (
            <button
              key={p.key}
              className={page === p.key ? 'active' : ''}
              onClick={() => setPage(p.key)}
            >
              <span className="icon" aria-hidden="true">
                <p.Icon size={18} />
              </span>
              {p.label}
            </button>
          ))}
        </nav>

        <button
          className="signout"
          onClick={async () => {
            await supabase.auth.signOut()
          }}
          title={email ?? undefined}
        >
          <LogOut size={15} aria-hidden="true" style={{ marginRight: 8, verticalAlign: '-2px' }} />
          Sign out{email ? ` (${email})` : ''}
        </button>
      </aside>

      <main className="admin-main">
        {page === 'overview' && <Overview onNavigate={(k) => setPage(k as PageKey)} />}
        {page === 'appointments' && <Appointments />}
        {page === 'services' && <ServicesAdmin />}
        {page === 'media' && <MediaAdmin />}
        {page === 'hours' && <BusinessHoursAdmin />}
        {page === 'blocked' && <BlockedDatesAdmin />}
        {page === 'settings' && <SettingsAdmin />}
      </main>
    </div>
  )
}
