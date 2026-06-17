import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { BusinessSettings } from '../../lib/types'

interface SettingsForm {
  business_name: string
  business_email: string
  business_phone: string
  business_address: string
  slot_interval_minutes: string
  booking_notice_hours: string
}

export default function SettingsAdmin() {
  const [row, setRow] = useState<BusinessSettings | null>(null)
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('business_settings').select('*').limit(1).maybeSingle()
      if (data) {
        const s = data as BusinessSettings
        setRow(s)
        setForm({
          business_name: s.business_name,
          business_email: s.business_email,
          business_phone: s.business_phone,
          business_address: s.business_address,
          slot_interval_minutes: String(s.slot_interval_minutes),
          booking_notice_hours: String(s.booking_notice_hours),
        })
      } else {
        // No settings yet — show a blank form so the first save creates the row.
        setForm({
          business_name: '',
          business_email: '',
          business_phone: '',
          business_address: '',
          slot_interval_minutes: '30',
          booking_notice_hours: '12',
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setFlash(null)

    const payload = {
      business_name: form.business_name.trim(),
      business_email: form.business_email.trim(),
      business_phone: form.business_phone.trim(),
      business_address: form.business_address.trim(),
      slot_interval_minutes: Math.max(5, parseInt(form.slot_interval_minutes, 10) || 30),
      booking_notice_hours: Math.max(0, parseInt(form.booking_notice_hours, 10) || 0),
    }

    const result = row
      ? await supabase.from('business_settings').update(payload).eq('id', row.id)
      : await supabase.from('business_settings').insert(payload)

    setSaving(false)
    if (result.error) {
      setFlash({ kind: 'err', text: 'Could not save settings — please try again.' })
      return
    }
    setFlash({
      kind: 'ok',
      text: 'Settings saved. The public website and booking rules now use these values.',
    })
  }

  if (loading) {
    return (
      <div className="panel">
        <div className="empty-state">
          <span className="spinner" style={{ margin: '0 auto 12px' }} aria-hidden="true" />
          Loading settings…
        </div>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="glyph" aria-hidden="true">
            <Settings size={26} />
          </div>
          <b>Business settings aren’t set up yet</b>
          They’ll be created automatically the first time you save your details.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <h2>Business Settings</h2>
          <p>Company details shown on the website, plus the rules behind the booking calendar.</p>
        </div>
      </div>

      {flash && <p className={`flash flash-${flash.kind}`}>{flash.text}</p>}

      <form className="panel panel-pad" onSubmit={save} style={{ display: 'grid', gap: 18 }}>
        <div className="form-row-2">
          <div className="field">
            <label htmlFor="set-name">Company Name</label>
            <input
              id="set-name"
              className="input"
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="set-email">Company Email</label>
            <input
              id="set-email"
              className="input"
              type="email"
              value={form.business_email}
              onChange={(e) => setForm({ ...form, business_email: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row-2">
          <div className="field">
            <label htmlFor="set-phone">Company Phone</label>
            <input
              id="set-phone"
              className="input"
              value={form.business_phone}
              onChange={(e) => setForm({ ...form, business_phone: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="set-address">Company Address</label>
            <input
              id="set-address"
              className="input"
              value={form.business_address}
              onChange={(e) => setForm({ ...form, business_address: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row-2">
          <div className="field">
            <label htmlFor="set-interval">Slot Interval (minutes)</label>
            <input
              id="set-interval"
              className="input"
              type="number"
              min={5}
              step={5}
              value={form.slot_interval_minutes}
              onChange={(e) => setForm({ ...form, slot_interval_minutes: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="set-notice">Booking Notice (hours)</label>
            <input
              id="set-notice"
              className="input"
              type="number"
              min={0}
              value={form.booking_notice_hours}
              onChange={(e) => setForm({ ...form, booking_notice_hours: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </>
  )
}
