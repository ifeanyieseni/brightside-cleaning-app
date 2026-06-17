import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { BusinessSettings, Service } from '../lib/types'
import Navbar from '../components/public/Navbar'
import Hero from '../components/public/Hero'
import Services from '../components/public/Services'
import About from '../components/public/About'
import Footer from '../components/public/Footer'

export default function PublicSite() {
  const [services, setServices] = useState<Service[]>([])
  const [settings, setSettings] = useState<BusinessSettings | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [svc, set] = await Promise.all([
        supabase.from('services').select('*').eq('is_active', true).order('price'),
        supabase.from('business_settings').select('*').limit(1).maybeSingle(),
      ])
      if (cancelled) return
      if (svc.data) setServices(svc.data as Service[])
      if (set.data) setSettings(set.data as BusinessSettings)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Booking lives on its own page; carry the chosen service through the URL.
  const chooseService = (id: string) => {
    navigate(`/booking?service=${id}`)
  }

  return (
    <>
      <Navbar settings={settings} />
      <main>
        <Hero settings={settings} />
        {!isSupabaseConfigured && (
          <p className="setup-note">
            The booking service isn’t connected yet — add your backend credentials to{' '}
            <code>.env</code> and restart the dev server to enable live services and booking.
          </p>
        )}
        <Services services={services} onBook={chooseService} />
        <About />
      </main>
      <Footer settings={settings} />
    </>
  )
}
