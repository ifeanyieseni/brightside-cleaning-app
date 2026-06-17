import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * True once real credentials are pasted into .env. Until then the app
 * still renders (with a friendly setup notice) instead of crashing.
 */
export const isSupabaseConfigured = Boolean(
  url && anonKey && url.startsWith('https://') && !url.includes('PASTE_')
)

/**
 * Resolved project URL + anon key. Exposed so the media uploader can talk
 * to the Storage REST endpoint directly via XHR (for real upload progress,
 * which supabase-js's `.upload()` does not surface).
 */
export const supabaseUrl = isSupabaseConfigured ? url! : 'https://placeholder.supabase.co'
export const supabaseAnonKey = isSupabaseConfigured ? anonKey! : 'placeholder-anon-key'

// Default client options keep normal browser session persistence and
// auto token refresh — the admin stays signed in until they sign out.
export const supabase = createClient(
  isSupabaseConfigured ? url! : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? anonKey! : 'placeholder-anon-key'
)
