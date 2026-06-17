import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { format } from 'date-fns'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import {
  fetchBookedRanges,
  generateSlots,
  toDateString,
  toTimeString,
  upcomingDays,
  type Slot,
} from '../../lib/availability'
import type { BlockedDate, BusinessHour, BusinessSettings, Service } from '../../lib/types'

const STEPS = ['Service', 'Date & time', 'Your details', 'Done'] as const

interface BookingProps {
  services: Service[]
  settings: BusinessSettings | null
  hours: BusinessHour[]
  blocked: BlockedDate[]
  selectedServiceId: string | null
  onSelectService: (id: string) => void
}

export default function Booking({
  services,
  settings,
  hours,
  blocked,
  selectedServiceId,
  onSelectService,
}: BookingProps) {
  const [step, setStep] = useState(0)
  const [day, setDay] = useState<Date | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ranges booked during this session, so a just-booked slot disappears
  // from availability immediately even before the RPC reflects it.
  const [justBooked, setJustBooked] = useState<{ date: string; start: Date; end: Date }[]>([])
  const [confirmed, setConfirmed] = useState<{
    service: Service
    day: Date
    slot: Slot
    name: string
    email: string
  } | null>(null)

  const service = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  )

  const days = useMemo(() => upcomingDays(hours, blocked, 14), [hours, blocked])

  // When a service is picked from the services section, jump to step 2
  useEffect(() => {
    if (service && step === 0) setStep(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServiceId])

  // Changing the service invalidates any chosen time and computed slots.
  useEffect(() => {
    setSlot(null)
    setSlots([])
  }, [service?.id])

  // Recompute slots whenever the selected day, service or session bookings
  // change. Required inputs are guarded; failures fall back to an empty,
  // non-crashing "No availability" state with the real reason logged.
  useEffect(() => {
    let cancelled = false
    async function compute() {
      // State rule: do not calculate slots if required inputs are missing.
      if (!day || !service || !settings) {
        setSlots([])
        return
      }
      setLoadingSlots(true)
      try {
        const booked = await fetchBookedRanges(day)
        if (cancelled) return
        const dayKey = toDateString(day)
        const localRanges = justBooked
          .filter((b) => b.date === dayKey)
          .map((b) => ({ start: b.start, end: b.end }))
        const next = generateSlots({
          day,
          service,
          hours,
          settings,
          blockedDates: blocked,
          booked: [...booked, ...localRanges],
        })
        if (!cancelled) setSlots(next)
      } catch (err) {
        console.error('[booking] failed to compute availability:', err)
        if (!cancelled) setSlots([])
      } finally {
        if (!cancelled) setLoadingSlots(false)
      }
    }
    compute()
    return () => {
      cancelled = true
    }
  }, [day, service, settings, hours, blocked, justBooked])

  const pickService = (id: string) => {
    onSelectService(id)
    setSlot(null)
    setStep(1)
  }

  const pickDay = (d: Date) => {
    setDay(d)
    setSlot(null)
  }

  const canSubmit =
    form.full_name.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    form.phone.trim().length >= 7

  async function submit() {
    if (!service || !day || !slot || !canSubmit) return
    setSubmitting(true)
    setError(null)

    // Snapshot the confirmed selection so async state changes can't shift it.
    const chosen = { service, day, slot }

    try {
      // The public can no longer INSERT directly. The create_appointment RPC
      // re-validates every rule server-side, computes end_time from the
      // service duration, forces status = 'pending', and is overlap-guarded
      // at the DB level against concurrent double-booking.
      const { error: rpcError } = await supabase.rpc('create_appointment', {
        p_full_name: form.full_name.trim(),
        p_email: form.email.trim(),
        p_phone: form.phone.trim(),
        p_service_id: chosen.service.id,
        p_appointment_date: toDateString(chosen.day),
        p_start_time: toTimeString(chosen.slot.start),
        p_notes: form.notes.trim() || null,
      })
      if (rpcError) throw rpcError

      // Make the booked slot stop appearing as available right away.
      setJustBooked((prev) => [
        ...prev,
        { date: toDateString(chosen.day), start: chosen.slot.start, end: chosen.slot.end },
      ])
      setSlots((prev) => prev.filter((s) => s.start.getTime() !== chosen.slot.start.getTime()))

      setConfirmed({
        service: chosen.service,
        day: chosen.day,
        slot: chosen.slot,
        name: form.full_name.trim(),
        email: form.email.trim(),
      })
      setStep(3)
    } catch (err) {
      const e = err as { code?: string; message?: string }
      console.error('[booking] create_appointment failed:', err)
      if (!isSupabaseConfigured) {
        setError('Booking isn’t available right now — please try again later, or call us directly.')
      } else if (e.code === '23P01') {
        // Slot was taken by a concurrent booking — drop it from availability
        // and send them back to pick another time.
        setJustBooked((prev) => [
          ...prev,
          { date: toDateString(chosen.day), start: chosen.slot.start, end: chosen.slot.end },
        ])
        setSlot(null)
        setStep(1)
        setError('Sorry — that time was just booked. Please choose another slot.')
      } else if (e.code === '23514' && e.message && e.message.length <= 140) {
        // Server validation rejected the request with a user-facing reason.
        setError(e.message)
      } else {
        setError('We could not save your booking. Please try again, or call us directly.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function resetAll() {
    setStep(0)
    setDay(null)
    setSlot(null)
    setForm({ full_name: '', email: '', phone: '', notes: '' })
    setConfirmed(null)
    setError(null)
  }

  return (
    <section className="section" id="booking">
      <div className="container">
        {!confirmed && (
          <div className="section-head center">
            <span className="eyebrow">Online booking</span>
            <h2>Reserve your cleaning in four easy steps</h2>
          </div>
        )}

        <div className={`booking-shell${step === 3 && confirmed ? ' booking-shell--success' : ''}`}>
          {step === 3 && confirmed ? (
            <SuccessScreen confirmed={confirmed} onAgain={resetAll} settings={settings} />
          ) : (
            <div className="booking-inner">
              <div className="booking-main">
                <div className="stepper" aria-label="Booking progress">
                  {STEPS.slice(0, 3).map((label, i) => (
                    <div
                      key={label}
                      className={`step ${i < step ? 'done' : ''} ${i === step ? 'now' : ''}`}
                    >
                      <span>
                        {i + 1}. {label}
                      </span>
                    </div>
                  ))}
                </div>

                {step === 0 && (
                  <div className="pick-grid">
                    {services.map((s) => (
                      <button
                        key={s.id}
                        className={`pick-card ${s.id === selectedServiceId ? 'selected' : ''}`}
                        onClick={() => pickService(s.id)}
                      >
                        <span className="pick-name">{s.name}</span>
                        <span className="pick-desc">{s.description}</span>
                        <span className="pick-meta">
                          <span className="muted">{s.duration_minutes} min</span>
                          <span>${Number(s.price).toFixed(0)}</span>
                        </span>
                      </button>
                    ))}
                    {services.length === 0 && (
                      <div className="slot-empty" style={{ gridColumn: '1 / -1' }}>
                        Services will appear here soon.
                      </div>
                    )}
                  </div>
                )}

                {step === 1 && (
                  <>
                    <div className="date-strip">
                      {days.slice(0, 7).map((d) => {
                        const selected = day !== null && toDateString(d) === toDateString(day)
                        return (
                          <button
                            key={d.toISOString()}
                            className={`date-pill ${selected ? 'selected' : ''}`}
                            onClick={() => pickDay(d)}
                          >
                            <span className="dow">{format(d, 'EEE')}</span>
                            <span className="day">{format(d, 'd')}</span>
                            <span className="mon">{format(d, 'MMM')}</span>
                          </button>
                        )
                      })}
                    </div>

                    {!day ? (
                      <div className="slot-empty">Pick a day to see available times.</div>
                    ) : loadingSlots ? (
                      <div className="slot-empty">
                        <span
                          className="spinner"
                          style={{ margin: '0 auto 10px' }}
                          aria-hidden="true"
                        />
                        Checking availability…
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="slot-empty">
                        No times left on {format(day, 'EEEE, MMM d')} — try another day.
                      </div>
                    ) : (
                      <div className="slot-grid">
                        {slots.map((s) => {
                          const selected = slot?.start.getTime() === s.start.getTime()
                          return (
                            <button
                              key={s.start.toISOString()}
                              className={`slot ${selected ? 'selected' : ''}`}
                              onClick={() => setSlot(s)}
                            >
                              {s.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {step === 2 && (
                  <div className="details-grid">
                    <div className="field">
                      <label htmlFor="bk-name">Full name</label>
                      <input
                        id="bk-name"
                        className="input"
                        value={form.full_name}
                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                        placeholder="Adaeze Johnson"
                        autoComplete="name"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="bk-phone">Phone</label>
                      <input
                        id="bk-phone"
                        className="input"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="(555) 014-2200"
                        autoComplete="tel"
                      />
                    </div>
                    <div className="field span-2">
                      <label htmlFor="bk-email">Email</label>
                      <input
                        id="bk-email"
                        className="input"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                    <div className="field span-2">
                      <label htmlFor="bk-notes">Notes for the team (optional)</label>
                      <textarea
                        id="bk-notes"
                        className="textarea"
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Gate code, pets, focus areas, parking…"
                      />
                    </div>
                  </div>
                )}

                {error && <p className="booking-error">{error}</p>}

                <div className="booking-nav">
                  {step > 0 ? (
                    <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                      ← Back
                    </button>
                  ) : (
                    <span />
                  )}

                  {step === 1 && (
                    <button
                      className="btn btn-primary"
                      disabled={!slot}
                      onClick={() => setStep(2)}
                    >
                      Continue →
                    </button>
                  )}
                  {step === 2 && (
                    <button
                      className="btn btn-primary"
                      disabled={!canSubmit || submitting}
                      onClick={submit}
                    >
                      {submitting ? 'Booking…' : 'Confirm booking'}
                    </button>
                  )}
                </div>
              </div>

              <aside className="booking-rail" aria-label="Booking summary">
                <h3>Your appointment</h3>
                <div className="rail-row">
                  <span>Service</span>
                  {service ? <b>{service.name}</b> : <span className="placeholder">Not selected</span>}
                </div>
                <div className="rail-row">
                  <span>Date</span>
                  {day ? <b>{format(day, 'EEE, MMM d')}</b> : <span className="placeholder">—</span>}
                </div>
                <div className="rail-row">
                  <span>Time</span>
                  {slot ? (
                    <b>
                      {format(slot.start, 'h:mm a')} – {format(slot.end, 'h:mm a')}
                    </b>
                  ) : (
                    <span className="placeholder">—</span>
                  )}
                </div>
                <div className="rail-total">
                  <span>Total</span>
                  <span>{service ? `$${Number(service.price).toFixed(0)}` : '—'}</span>
                </div>
                <p className="rail-note">
                  No payment due now — we confirm your appointment and you pay after the
                  cleaning is done.
                </p>
              </aside>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function SuccessScreen({
  confirmed,
  onAgain,
  settings,
}: {
  confirmed: { service: Service; day: Date; slot: Slot; name: string; email: string }
  onAgain: () => void
  settings: BusinessSettings | null
}) {
  return (
    <div className="success-wrap">
      <div className="success-burst" aria-hidden="true">
        <Check size={40} strokeWidth={3} />
      </div>
      <h3>Your cleaning request is in, {confirmed.name.split(' ')[0]}!</h3>
      <p>
        We've received your appointment request and will confirm it shortly
        {settings?.business_email ? ` from ${settings.business_email}` : ''}. A summary is
        below — see you soon.
      </p>
      <div className="success-card">
        <div className="row">
          <span>Service</span>
          <b>{confirmed.service.name}</b>
        </div>
        <div className="row">
          <span>Date</span>
          <b>{format(confirmed.day, 'EEEE, MMMM d, yyyy')}</b>
        </div>
        <div className="row">
          <span>Time</span>
          <b>
            {format(confirmed.slot.start, 'h:mm a')} – {format(confirmed.slot.end, 'h:mm a')}
          </b>
        </div>
        <div className="row">
          <span>Price</span>
          <b>${Number(confirmed.service.price).toFixed(0)}</b>
        </div>
        <div className="row">
          <span>Confirmation to</span>
          <b>{confirmed.email}</b>
        </div>
      </div>
      <div className="success-actions">
        <button className="btn btn-primary" onClick={onAgain}>
          Book another cleaning
        </button>
        <Link className="btn btn-ghost" to="/">
          Back to home
        </Link>
      </div>
    </div>
  )
}
