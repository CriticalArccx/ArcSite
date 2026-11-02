import { useState } from 'react'

type Props = {
  loading: boolean
  authError: string | null
  onGoogle: () => Promise<{ error: string | null }>
  onEmail: (email: string) => Promise<{ error: string | null }>
  onClearError: () => void
}

/**
 * Replaces the old dismissible SignInModal — ArcApp itself now renders NOTHING else (no sidebar,
 * no data, no routes) until a real, authorized session exists, so a "close and browse anyway"
 * option doesn't make sense anymore. AppShell.tsx shows this in place of the whole app shell
 * whenever `!user`, which covers three cases: nobody's ever signed in yet, a sign-in attempt is
 * still resolving, or a sign-in succeeded at the Supabase Auth level but the email isn't on
 * arcapp_authorized_users (useCurrentUser.ts signs that case back out immediately and surfaces
 * `authError` here instead of a small dismissible banner floating over content that no longer
 * exists to float over).
 */
export default function SignInPage({ loading, authError, onGoogle, onEmail, onClearError }: Props) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  async function handleGoogle() {
    onClearError()
    setBusy(true)
    setMsg({ text: '', cls: 'q-hint' })
    const { error } = await onGoogle()
    if (error) {
      setMsg({ text: 'Google sign-in failed: ' + error, cls: 'q-hint err' })
      setBusy(false)
    }
    // On success the browser navigates away to Google — nothing else to do here.
  }

  async function handleEmail() {
    const trimmed = email.trim()
    if (!trimmed) return
    onClearError()
    setBusy(true)
    setMsg({ text: '', cls: 'q-hint' })
    const { error } = await onEmail(trimmed)
    setBusy(false)
    setMsg(
      error
        ? { text: 'Failed: ' + error, cls: 'q-hint err' }
        : { text: `Check ${trimmed} for a sign-in link.`, cls: 'q-hint ok' },
    )
  }

  return (
    <div className="arcapp">
      <div className="starfield" />
      <div className="signin-page">
        <div className="signin-page-card">
          <div className="signin-page-brand">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <path d="M14 66 A36 36 0 0 1 86 66" fill="none" stroke="url(#arcGrad2)" strokeWidth="8" strokeLinecap="round" />
              <circle cx="50" cy="30" r="3.4" fill="#8cd48d" />
              <defs>
                <linearGradient id="arcGrad2" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#8cd48d" />
                  <stop offset="100%" stopColor="#358537" />
                </linearGradient>
              </defs>
            </svg>
            <div>
              <div className="brand-text">
                Arc<b>App</b>
              </div>
              <div className="brand-tagline">Mission Control for Commissioning</div>
            </div>
          </div>

          <h3 style={{ marginTop: 22 }}>Sign in to continue</h3>
          <p className="q-hint" style={{ marginTop: 0 }}>
            Only pre-authorized emails can access ArcApp — contact an administrator to be added.
          </p>

          {loading ? (
            <div className="q-hint" style={{ marginTop: 18 }}>
              Checking your session…
            </div>
          ) : (
            <>
              <button className="seal-submit-btn" type="button" disabled={busy} onClick={handleGoogle}>
                Sign in with Google
              </button>

              <div className="signin-page-divider">or</div>

              <div className="form-field">
                <label>Work email (magic link)</label>
                <input
                  type="email"
                  value={email}
                  placeholder="you@company.com"
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleEmail()}
                />
              </div>
              <button className="wf-btn" style={{ width: '100%', padding: '10px 0' }} disabled={busy || !email.trim()} onClick={handleEmail}>
                Email me a sign-in link
              </button>

              {authError && <div className="q-hint err" style={{ marginTop: 14 }}>{authError}</div>}
              {msg.text && <div className={msg.cls} style={{ marginTop: 10 }}>{msg.text}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
