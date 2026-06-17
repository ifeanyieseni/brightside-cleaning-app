import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatTimeLabel, toDateString } from '../../lib/availability'
import type { Appointment } from '../../lib/types'

interface Stats {
  today: number
  pending: number
  upcomingConfirmed: number
  completed: number
}

export default function Overview({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [next, setNext] = useState<Appointment[]>([])

  useEffect(() => {
    async function load() {
      const today = toDateString(new Date())
      const [tod, pen, upc, com, list] = await Promise.all([
        // Today's appointments (anything still on the books for today)
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('appointment_date', today)
          .neq('status', 'cancelled'),
        // Pending requests awaiting a decision
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        // Upcoming confirmed appointments (today or later)
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('appointment_date', today)
          .eq('status', 'confirmed'),
        // Completed appointments
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed'),
        supabase
          .from('appointments')
          .select('*, services(name)')
          .gte('appointment_date', today)
          .in('status', ['pending', 'confirmed'])
          .order('appointment_date', { ascending: true })
          .order('start_time', { ascending: true })
          .limit(6),
      ])
      setStats({
        today: tod.count ?? 0,
        pending: pen.count ?? 0,
        upcomingConfirmed: upc.count ?? 0,
        completed: com.count ?? 0,
      })
      setNext((list.data as Appointment[]) ?? [])
    }
    load()
  }, [])

  const metrics = [
    { label: "Today's appointments", value: stats?.today, wash: 'var(--aqua-soft)' },
    { label: 'Pending requests', value: stats?.pending, wash: 'var(--warn-soft)' },
    { label: 'Upcoming confirmed', value: stats?.upcomingConfirmed, wash: 'var(--info-soft)' },
    { label: 'Completed', value: stats?.completed, wash: 'var(--ok-soft)' },
  ]

  return (
    <>
      <div className="admin-head">
        <div>
          <h2>Overview</h2>
          <p>What's happening across your cleaning schedule.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => onNavigate('appointments')}>
          View all appointments
        </button>
      </div>

      <div className="metric-grid">
        {metrics.map((m) => (
          <div className="metric" key={m.label} style={{ ['--wash' as never]: m.wash }}>
            <span className="label">{m.label}</span>
            <div className="value">{m.value ?? '–'}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-pad" style={{ paddingBottom: 0 }}>
          <h3 style={{ fontSize: '1.15rem' }}>Next appointments</h3>
        </div>
        {next.length === 0 ? (
          <div className="empty-state">
            <div className="glyph" aria-hidden="true">
              <CalendarDays size={26} />
            </div>
            <b>No upcoming appointments</b>
            New booking requests from the website will show up here.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Service</th>
                  <th>When</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {next.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="cell-main">{a.full_name}</span>
                      <span className="cell-sub">{a.phone}</span>
                    </td>
                    <td>{a.services?.name ?? '—'}</td>
                    <td>
                      <span className="cell-main">
                        {format(new Date(`${a.appointment_date}T00:00:00`), 'EEE, MMM d')}
                      </span>
                      <span className="cell-sub">
                        {formatTimeLabel(a.start_time)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${a.status}`}>{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
