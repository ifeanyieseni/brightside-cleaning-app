// ============================================================
// Edge Function: notify-booking
//
// Fires from a Supabase Database Webhook on `appointments` INSERT.
// Sends booking notifications through whichever channels are configured —
// each is independent, so set only the secrets for the ones you want:
//   • Email (Resend)       — owner alert + customer confirmation
//   • WhatsApp (CallMeBot)  — owner alert to your own WhatsApp number
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY     re_xxx                         (enables email)
//   NOTIFY_FROM        "Brightside <bookings@you.com>" (verified-domain sender)
//   NOTIFY_OWNER       you@example.com                (optional owner-email override)
//   CALLMEBOT_PHONE    +2348012345678                 (enables WhatsApp — YOUR number)
//   CALLMEBOT_APIKEY   123456                         (from CallMeBot activation)
//   WEBHOOK_SECRET     <random>                       (optional shared-secret check)
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('NOTIFY_FROM') ?? 'Brightside Cleaning <onboarding@resend.dev>'
const OWNER_OVERRIDE = Deno.env.get('NOTIFY_OWNER') ?? ''
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? ''
const CALLMEBOT_PHONE = Deno.env.get('CALLMEBOT_PHONE') ?? ''
const CALLMEBOT_APIKEY = Deno.env.get('CALLMEBOT_APIKEY') ?? ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Escape user-supplied text before putting it into HTML email bodies.
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !to) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!res.ok) console.error('[notify-booking] Resend error', res.status, await res.text())
  return res.ok
}

// CallMeBot sends a WhatsApp message — but ONLY to the number that activated
// the API key (i.e. your own). Perfect for an owner alert, not for customers.
async function sendWhatsApp(text: string) {
  if (!CALLMEBOT_PHONE || !CALLMEBOT_APIKEY) return false
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(CALLMEBOT_PHONE)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`
  const res = await fetch(url)
  if (!res.ok) console.error('[notify-booking] CallMeBot error', res.status, await res.text())
  return res.ok
}

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  // Supabase DB webhook payload: { type, table, record, old_record, schema }
  const payload = await req.json().catch(() => null)
  const appt = payload?.record
  if (!appt?.email) return new Response('no record', { status: 400 })

  // Service role bypasses RLS — look up the service name and owner contact.
  const [{ data: service }, { data: settings }] = await Promise.all([
    supabase.from('services').select('name, price').eq('id', appt.service_id).maybeSingle(),
    supabase
      .from('business_settings')
      .select('business_name, business_email')
      .limit(1)
      .maybeSingle(),
  ])

  const serviceName = service?.name ?? 'Cleaning service'
  const bizName = settings?.business_name ?? 'Brightside Cleaning'
  const ownerEmail = OWNER_OVERRIDE || settings?.business_email || ''
  const when = `${appt.appointment_date} at ${String(appt.start_time).slice(0, 5)}`
  const firstName = String(appt.full_name ?? '').split(' ')[0] || 'there'

  // ----- Email: owner alert -----
  await sendEmail(
    ownerEmail,
    `New booking — ${serviceName} on ${appt.appointment_date}`,
    `<h2>New booking request</h2>
     <p><b>${esc(appt.full_name)}</b> booked <b>${esc(serviceName)}</b>.</p>
     <ul>
       <li><b>When:</b> ${esc(when)}</li>
       <li><b>Phone:</b> ${esc(appt.phone)}</li>
       <li><b>Email:</b> ${esc(appt.email)}</li>
       ${appt.notes ? `<li><b>Notes:</b> ${esc(appt.notes)}</li>` : ''}
     </ul>`
  )

  // ----- Email: customer confirmation -----
  await sendEmail(
    appt.email,
    `We received your booking — ${bizName}`,
    `<h2>Thanks, ${esc(firstName)}!</h2>
     <p>We've received your request for <b>${esc(serviceName)}</b> on
        <b>${esc(when)}</b> and will confirm it shortly.</p>
     <p>— ${esc(bizName)}</p>`
  )

  // ----- WhatsApp: owner alert via CallMeBot -----
  await sendWhatsApp(
    `🧽 New booking\n` +
      `${appt.full_name} — ${serviceName}\n` +
      `${when}\n` +
      `Phone: ${appt.phone}` +
      (appt.notes ? `\nNotes: ${appt.notes}` : '')
  )

  return new Response('ok', { status: 200 })
})
