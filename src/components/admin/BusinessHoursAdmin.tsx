import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { BusinessHour } from '../../lib/types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "HH:mm:ss" -> "HH:mm" for <input type="time"> */
const toInput = (t: string) => t.slice(0, 5)

export default function BusinessHoursAdmin() {
  const [rows, setRows] = useState<BusinessHour[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('business_hours').select('*').order('weekday')
      setRows((data as BusinessHour[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  function patch(id: string, changes: Partial<BusinessHour>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  }

  async function saveAll() {
    setSaving(true)
    setFlash(null)
    const results = await Promise.all(
      rows.map((r) =>
        supabase
          .from('business_hours')
          .update({
            is_open: r.is_open,
            start_time: toInput(r.start_time),
            end_time: toInput(r.end_time),
          })
          .eq('id', r.id)
      )
    )
    setSaving(false)
    if (results.some((r) => r.error)) {
      setFlash({ kind: 'err', text: 'Some days could not be saved — please try again.' })
    } else {
      setFlash({
        kind: 'ok',
        text: 'Business hours saved. The booking calendar now follows the new schedule.',
      })
    }
  }

  // Order Monday-first for a natural reading, Sunday last
  const ordered = [...rows].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))

  return (
    <>
      <div className="admin-head">
        <div>
          <h2>Business Hours</h2>
          <p>When clients can book. Closed days never show time slots.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={saveAll} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save hours'}
        </button>
      </div>

      {flash && <p className={`flash flash-${flash.kind}`}>{flash.text}</p>}

      <div className="panel panel-pad">
        {loading ? (
          <div className="empty-state">
            <span className="spinner" style={{ margin: '0 auto 12px' }} aria-hidden="true" />
            Loading hours…
          </div>
        ) : (
          ordered.map((r) => (
            <div className="hours-row" key={r.id}>
              <span className="dayname">{DAY_NAMES[r.weekday]}</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={r.is_open}
                  onChange={(e) => patch(r.id, { is_open: e.target.checked })}
                  aria-label={`${DAY_NAMES[r.weekday]} open`}
                />
                <span className="track" />
              </span>
              {r.is_open ? (
                <>
                  <input
                    className="input"
                    type="time"
                    value={toInput(r.start_time)}
                    onChange={(e) => patch(r.id, { start_time: e.target.value })}
                    aria-label={`${DAY_NAMES[r.weekday]} opening time`}
                  />
                  <input
                    className="input"
                    type="time"
                    value={toInput(r.end_time)}
                    onChange={(e) => patch(r.id, { end_time: e.target.value })}
                    aria-label={`${DAY_NAMES[r.weekday]} closing time`}
                  />
                </>
              ) : (
                <span className="closed-note">Closed — no bookings this day</span>
              )}
            </div>
          ))
        )}
      </div>
    </>
  )
}
