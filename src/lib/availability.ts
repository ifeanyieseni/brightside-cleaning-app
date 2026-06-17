import { addMinutes, format, isBefore, isSameDay, isValid, startOfDay } from 'date-fns'
import { supabase } from './supabase'
import type { BlockedDate, BusinessHour, BusinessSettings, Service } from './types'

/**
 * The single normalized slot shape used across the booking UI.
 * `start`/`end` are always REAL, valid Date objects; `label` is the
 * pre-built display string so the UI never reformats during render.
 */
export interface Slot {
  start: Date
  end: Date
  label: string
}

/**
 * Combine a real day with a "HH:mm" / "HH:mm:ss" time into a real Date.
 * Returns null (never an Invalid Date) for missing/garbage input so callers
 * can skip safely instead of crashing later in format().
 */
export function timeOnDate(day: Date, time: string | null | undefined): Date | null {
  if (!time || typeof time !== 'string') return null
  const [hRaw, mRaw = '0'] = time.split(':')
  const h = parseInt(hRaw, 10)
  const m = parseInt(mRaw, 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  const d = startOfDay(day)
  d.setHours(h, m, 0, 0)
  return isValid(d) ? d : null
}

/** Date -> "yyyy-MM-dd" (only ever called on real Dates). */
export function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Date -> "HH:mm:ss" (only ever called on real slot Dates). */
export function toTimeString(d: Date): string {
  return format(d, 'HH:mm:ss')
}

/**
 * Safe "h:mm a" display label for a stored "HH:mm:ss" time string.
 * Returns '' (never throws "Invalid time value") when the input is missing
 * or unparseable — guards every place that formats a DB time for display.
 */
export function formatTimeLabel(time: string | null | undefined, ref: Date = new Date()): string {
  const d = timeOnDate(ref, time)
  return d ? format(d, 'h:mm a') : ''
}

interface BookedRange {
  start: Date
  end: Date
}

/**
 * Booked (non-cancelled) time ranges for a date, via the security-definer
 * RPC `get_booked_ranges` — the public has no SELECT access to appointments.
 * Always resolves to a safe array; logs the real reason on failure.
 */
export async function fetchBookedRanges(day: Date): Promise<BookedRange[]> {
  try {
    const { data, error } = await supabase.rpc('get_booked_ranges', {
      p_date: toDateString(day),
    })
    if (error) {
      console.error('[booking] get_booked_ranges failed:', error.message, error)
      return []
    }
    if (!Array.isArray(data)) return []
    const ranges: BookedRange[] = []
    for (const r of data as { start_time: string; end_time: string }[]) {
      const start = timeOnDate(day, r.start_time)
      const end = timeOnDate(day, r.end_time)
      if (start && end) ranges.push({ start, end })
    }
    return ranges
  } catch (err) {
    console.error('[booking] get_booked_ranges threw:', err)
    return []
  }
}

export function isDateBlocked(day: Date, blocked: BlockedDate[]): boolean {
  const key = toDateString(day)
  return blocked.some((b) => b.blocked_date === key)
}

export function isDayOpen(day: Date, hours: BusinessHour[]): boolean {
  const row = hours.find((h) => h.weekday === day.getDay())
  return Boolean(row?.is_open)
}

/**
 * Generate the available slots for ONE day from the exact schema:
 *   - candidates step across `business_hours` by `slot_interval_minutes`
 *   - each slot's end = start + service.duration_minutes
 *   - excluded when the day is blocked, the slot is before
 *     now + booking_notice_hours, or it overlaps a booked range.
 *
 * Overlap rule (used everywhere): new_start < existing_end AND new_end > existing_start.
 *
 * Pure and defensive: never throws — returns [] on any bad input so the
 * UI can render a safe "No availability" state instead of crashing.
 */
export function generateSlots(args: {
  day: Date
  service: Service
  hours: BusinessHour[]
  settings: BusinessSettings
  blockedDates: BlockedDate[]
  booked: BookedRange[]
  now?: Date
}): Slot[] {
  try {
    const { day, service, hours, settings, blockedDates, booked } = args
    const now = args.now ?? new Date()

    // Required inputs must be real / valid.
    if (!day || !isValid(day) || !service) return []
    if (!Number.isFinite(service.duration_minutes) || service.duration_minutes <= 0) return []

    // Rule 7: blocked dates have no slots.
    if (isDateBlocked(day, blockedDates)) return []

    // Rule 4: only inside business hours of an OPEN day.
    const dayHours = hours.find((h) => h.weekday === day.getDay())
    if (!dayHours || !dayHours.is_open) return []

    const open = timeOnDate(day, dayHours.start_time)
    const close = timeOnDate(day, dayHours.end_time)
    if (!open || !close || close.getTime() <= open.getTime()) return []

    const duration = service.duration_minutes
    const interval = Math.max(5, settings?.slot_interval_minutes || 30) // Rule 6
    const noticeHours = Math.max(0, settings?.booking_notice_hours || 0) // Rule 10
    const earliest = addMinutes(now, noticeHours * 60)

    const slots: Slot[] = []
    for (let start = open; ; start = addMinutes(start, interval)) {
      const end = addMinutes(start, duration) // Rule 5

      // Stop once the service would run past closing time.
      if (end.getTime() > close.getTime()) break

      // Rule 10: respect the booking-notice window.
      if (isBefore(start, earliest)) continue

      // Rules 8 & 9: skip overlaps (booked ranges already exclude cancelled).
      const clashes = booked.some((b) => start < b.end && end > b.start)
      if (clashes) continue

      slots.push({ start: new Date(start), end: new Date(end), label: format(start, 'h:mm a') })
    }
    return slots
  } catch (err) {
    console.error('[booking] generateSlots error:', err)
    return []
  }
}

/** The next `count` bookable calendar days (open + not blocked). */
export function upcomingDays(
  hours: BusinessHour[],
  blockedDates: BlockedDate[],
  count = 14,
  from = new Date()
): Date[] {
  const days: Date[] = []
  const cursor = startOfDay(from)
  for (let i = 0; days.length < count && i < 60; i++) {
    const d = new Date(cursor)
    d.setDate(d.getDate() + i)
    if (!isDayOpen(d, hours)) continue
    if (isDateBlocked(d, blockedDates)) continue
    if (isBefore(d, startOfDay(from)) && !isSameDay(d, from)) continue
    days.push(d)
  }
  return days
}
