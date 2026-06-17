export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'

export interface Service {
  id: string
  name: string
  description: string
  duration_minutes: number
  price: number
  is_active: boolean
  created_at: string
  /** Added in migration 0002 — present on seeded catalog services. */
  category?: string | null
  slug?: string | null
  featured_image_url?: string | null
  gallery_images?: string[] | null
}

export type MediaType = 'image' | 'video'

export interface MediaAsset {
  id: string
  type: MediaType
  bucket: string
  path: string
  public_url: string
  file_name: string
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  title: string | null
  alt_text: string | null
  created_at: string
}

export interface Appointment {
  id: string
  full_name: string
  email: string
  phone: string
  service_id: string | null
  appointment_date: string
  start_time: string
  end_time: string
  status: AppointmentStatus
  notes: string | null
  created_at: string
  /** present when fetched with `select('*, services(name)')` */
  services?: { name: string } | null
}

export interface BusinessHour {
  id: string
  weekday: number // 0 = Sunday ... 6 = Saturday
  is_open: boolean
  start_time: string
  end_time: string
}

export interface BlockedDate {
  id: string
  blocked_date: string
  reason: string | null
  created_at: string
}

export interface BusinessSettings {
  id: string
  business_name: string
  business_email: string
  business_phone: string
  business_address: string
  slot_interval_minutes: number
  booking_notice_hours: number
  created_at: string
}
