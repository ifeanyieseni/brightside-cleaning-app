import { useState } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'

export default function AdminLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (signInError) {
      setError(
        isSupabaseConfigured
          ? 'Sign in failed — check your email and password and try again.'
          : 'The service isn’t connected yet. Add your backend credentials to .env first.'
      )
      return
    }
    onSignedIn()
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-bubble" aria-hidden="true" />
          <span className="brand-name">Brightside Admin</span>
        </div>
        <h2>Welcome back</h2>
        <p className="auth-sub">Sign in to manage appointments, services and settings.</p>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="adm-email">Email</label>
            <input
              id="adm-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="adm-pass">Password</label>
            <input
              id="adm-pass"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="flash flash-err" style={{ margin: 0 }}>{error}</p>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
