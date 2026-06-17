import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CalendarX2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatTimeLabel } from '../../lib/availability'
import type { Appointment, AppointmentStatus } from '../../lib/types'

const FILTERS: ('all' | AppointmentStatus)[] = [
  'all',
  'pending',
  'confirmed',
  'completed',
  'cancelled',
]

// Every status an admin can move an appointment to.
const ALL_STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'cancelled', 'completed']

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export default function Appointments() {
  const [rows, setRows] = useState<Appointment[]>([])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [dateFilter, setDateFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select('*, services(name)')
      .order('appointment_date', { ascending: false })
      .order('start_time', { ascending: false })
    setRows((data as Appointment[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === 'all' || r.status === filter) &&
          (!dateFilter || r.appointment_date === dateFilter)
      ),
    [rows, filter, dateFilter]
  )

  // Write the new status to Supabase, then mirror it locally so the list
  // never shows a stale value while the next full refetch is unnecessary.
  async function setStatus(a: Appointment, to: AppointmentStatus) {
    if (a.status === to) return
    setUpdatingId(a.id)
    const { error } = await supabase.from('appointments').update({ status: to }).eq('id', a.id)
    setUpdatingId(null)
    if (error) {
      setFlash('Could not update the appointment — please try again.')
      return
    }
    setFlash(null)
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, status: to } : r)))
  }

  const hasFilters = filter !== 'all' || dateFilter !== ''

  return (
    <>
      <div className="admin-head">
        <div>
          <h2>Appointments</h2>
          <p>Every booking request, newest first.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="chip-row">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`chip ${filter === f ? 'on' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : cap(f)}
              </button>
            ))}
          </div>
          <input
            className="input"
            style={{ width: 168 }}
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter appointments by date"
          />
          {hasFilters && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setFilter('all')
                setDateFilter('')
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {flash && <p className="flash flash-err">{flash}</p>}

      <div className="panel">
        {loading ? (
          <div className="empty-state">
            <span className="spinner" style={{ margin: '0 auto 12px' }} aria-hidden="true" />
            Loading appointments…
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <div className="glyph" aria-hidden="true">
              <CalendarX2 size={26} />
            </div>
            <b>Nothing here yet</b>
            {hasFilters
              ? 'No appointments match these filters.'
              : 'When clients book on the website, requests appear here.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Service</th>
                  <th>Date &amp; time</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Set status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="cell-main">{a.full_name}</span>
                      {a.notes && <span className="cell-sub">“{a.notes}”</span>}
                    </td>
                    <td>{a.services?.name ?? '—'}</td>
                    <td>
                      <span className="cell-main">
                        {format(new Date(`${a.appointment_date}T00:00:00`), 'EEE, MMM d, yyyy')}
                      </span>
                      <span className="cell-sub">
                        {formatTimeLabel(a.start_time)} – {formatTimeLabel(a.end_time)}
                      </span>
                    </td>
                    <td>
                      <span className="cell-main">{a.phone}</span>
                      <span className="cell-sub">{a.email}</span>
                    </td>
                    <td>
                      <span className={`badge badge-${a.status}`}>{a.status}</span>
                    </td>
                    <td>
                      <select
                        className="select"
                        style={{ width: 150 }}
                        value={a.status}
                        disabled={updatingId === a.id}
                        onChange={(e) => setStatus(a, e.target.value as AppointmentStatus)}
                        aria-label={`Change status for ${a.full_name}`}
                      >
                        {ALL_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {cap(s)}
                          </option>
                        ))}
                      </select>
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
