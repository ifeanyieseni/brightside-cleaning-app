import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import AdminLogin from '../components/admin/AdminLogin'
import AdminLayout from '../components/admin/AdminLayout'

type GateState =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'unauthorized'; email: string | null }
  | { kind: 'admin'; email: string | null }

/**
 * Admin gate. Flow per spec:
 *  - getSession(); no session -> show login
 *  - session -> getUser() -> query admin_users by user_id with maybeSingle()
 *  - row found -> dashboard; not found -> unauthorized message
 *  - loading always cleared in finally; never auto sign-out on errors
 */
export default function AdminPage() {
  const [gate, setGate] = useState<GateState>({ kind: 'loading' })
  const checking = useRef(false)

  const checkAccess = useCallback(async () => {
    if (checking.current) return
    checking.current = true
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        setGate({ kind: 'signedOut' })
        return
      }

      const { data: userData, error: userError } = await supabase.auth.getUser()
      const user = userData?.user
      if (userError || !user) {
        // Session exists but the user could not be fetched (e.g. transient
        // network error). Do NOT sign out — just show login for this render.
        setGate({ kind: 'signedOut' })
        return
      }

      const { data: adminRow, error: adminError } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (adminError) {
        // Temporary query error: keep the user signed in, surface as
        // unauthorized-with-retry rather than kicking them out.
        setGate({ kind: 'unauthorized', email: user.email ?? null })
        return
      }

      setGate(
        adminRow
          ? { kind: 'admin', email: user.email ?? null }
          : { kind: 'unauthorized', email: user.email ?? null }
      )
    } finally {
      checking.current = false
    }
  }, [])

  useEffect(() => {
    checkAccess()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setGate({ kind: 'signedOut' })
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Keep the dashboard available; re-verify admin access in background.
        checkAccess()
      }
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [checkAccess])

  if (gate.kind === 'loading') {
    return (
      <div className="auth-status">
        <div className="inner">
          <span className="spinner" aria-hidden="true" />
          Verifying access…
        </div>
      </div>
    )
  }

  if (gate.kind === 'signedOut') {
    return <AdminLogin onSignedIn={checkAccess} />
  }

  if (gate.kind === 'unauthorized') {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="brand">
            <span className="brand-bubble" aria-hidden="true" />
            <span className="brand-name">Admin</span>
          </div>
          <h2>Not authorized</h2>
          <p className="auth-sub">
            You are signed in{gate.email ? ` as ${gate.email}` : ''}, but you are not
            authorized as an admin.
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button className="btn btn-primary" onClick={checkAccess}>
              Check again
            </button>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await supabase.auth.signOut()
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <AdminLayout email={gate.email} />
}
