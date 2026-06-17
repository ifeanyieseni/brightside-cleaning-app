import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { BlockedDate, BusinessHour, BusinessSettings, Service } from '../lib/types'
import Navbar from '../components/public/Navbar'
import Booking from '../components/public/Booking'
import Footer from '../components/public/Footer'

export default function BookingPage() {
  const [services, setServices] = useState<Service[]>([])
  const [settings, setSettings] = useState<BusinessSettings | null>(null)
  const [hours, setHours] = useState<BusinessHour[]>([])
  const [blocked, setBlocked] = useState<BlockedDate[]>([])
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const requestedServiceId = searchParams.get('service')

  // Land at the top of the booking flow when arriving from another page.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [svc, set, hrs, blk] = await Promise.all([
        supabase.from('services').select('*').eq('is_active', true).order('price'),
        supabase.from('business_settings').select('*').limit(1).maybeSingle(),
        supabase.from('business_hours').select('*').order('weekday'),
        supabase.from('blocked_dates').select('*'),
      ])
      if (cancelled) return
      if (svc.data) setServices(svc.data as Service[])
      if (set.data) setSettings(set.data as BusinessSettings)
      if (hrs.data) setHours(hrs.data as BusinessHour[])
      if (blk.data) setBlocked(blk.data as BlockedDate[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Pre-select the service passed via ?service= once the services have loaded,
  // so the booking flow can jump straight past the service picker.
  useEffect(() => {
    if (requestedServiceId && services.some((s) => s.id === requestedServiceId)) {
      setSelectedServiceId(requestedServiceId)
    }
  }, [requestedServiceId, services])

  return (
    <>
      <Navbar settings={settings} />
      <main>
        {!isSupabaseConfigured && (
          <p className="setup-note">
            The booking service isn’t connected yet — add your backend credentials to{' '}
            <code>.env</code> and restart the dev server to enable live services and booking.
          </p>
        )}
        <Booking
          services={services}
          settings={settings}
          hours={hours}
          blocked={blocked}
          selectedServiceId={selectedServiceId}
          onSelectService={setSelectedServiceId}
        />
      </main>
      <Footer settings={settings} />
    </>
  )
}
