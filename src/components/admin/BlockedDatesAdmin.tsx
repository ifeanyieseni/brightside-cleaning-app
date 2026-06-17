import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { CalendarOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { BlockedDate } from '../../lib/types'

export default function BlockedDatesAdmin() {
  const [rows, setRows] = useState<BlockedDate[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function load() {
    const { data } = await supabase
      .from('blocked_dates')
      .select('*')
      .order('blocked_date', { ascending: true })
    setRows((data as BlockedDate[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    setBusy(true)
    setFlash(null)
    const { error } = await supabase
      .from('blocked_dates')
      .insert({ blocked_date: date, reason: reason.trim() || null })
    setBusy(false)
    if (error) {
      setFlash({ kind: 'err', text: 'Could not block that date — please try again.' })
      return
    }
    setDate('')
    setReason('')
    setFlash({ kind: 'ok', text: 'Date blocked. Clients can no longer book it.' })
    load()
  }

  async function remove(id: string) {
    const { error } = await supabase.from('blocked_dates').delete().eq('id', id)
    if (!error) setRows((rs) => rs.filter((r) => r.id !== id))
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <h2>Blocked Dates</h2>
          <p>Holidays, team days off — blocked dates disappear from the booking calendar.</p>
        </div>
      </div>

      {flash && <p className={`flash flash-${flash.kind}`}>{flash.text}</p>}

      <div className="panel panel-pad" style={{ marginBottom: 22 }}>
        <form
          onSubmit={add}
          style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <div className="field" style={{ minWidth: 180 }}>
            <label htmlFor="blk-date">Date</label>
            <input
              id="blk-date"
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="blk-reason">Reason (optional)</label>
            <input
              id="blk-reason"
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Public holiday"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy || !date}>
            {busy ? 'Blocking…' : 'Block date'}
          </button>
        </form>
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty-state">
            <span className="spinner" style={{ margin: '0 auto 12px' }} aria-hidden="true" />
            Loading blocked dates…
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="glyph" aria-hidden="true">
              <CalendarOff size={26} />
            </div>
            <b>No blocked dates</b>
            Every open weekday is currently bookable.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="cell-main">
                        {format(new Date(`${r.blocked_date}T00:00:00`), 'EEEE, MMMM d, yyyy')}
                      </span>
                    </td>
                    <td>{r.reason || <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>
                        Unblock
                      </button>
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
