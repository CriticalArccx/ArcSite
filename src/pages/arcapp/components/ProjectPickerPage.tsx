import { PROJECTS, type ProjectKey } from '../../../lib/project'

type Props = {
  /** Which projects this person can actually reach — already filtered to their allowed_projects
   * (or every project, for an unrestricted account). Always length > 1: useCurrentUser only shows
   * this page at all when there's a real choice to make. */
  options: ProjectKey[]
  /** Pre-highlighted as "Last used" — CURRENT_PROJECT if it's one of `options`, else options[0]. */
  defaultKey: ProjectKey
  onChoose: (key: ProjectKey) => void
  onSignOut: () => void
}

/**
 * Shown once per browser session (see PROJECT_CONFIRMED_KEY in useCurrentUser.ts) right after
 * sign-in, for anyone who can reach more than one project — replaces silently landing in whatever
 * project localStorage last had (or the STY4 default) without ever being asked. Picking a project
 * other than CURRENT_PROJECT reloads the page (ProjectPickerPage itself doesn't need to handle
 * that — see confirmProject in useCurrentUser.ts); picking the one already current just continues
 * straight into the app shell.
 */
export default function ProjectPickerPage({ options, defaultKey, onChoose, onSignOut }: Props) {
  const items = PROJECTS.filter((p) => options.includes(p.key))

  return (
    <div className="arcapp">
      <div className="starfield" />
      <div className="signin-page">
        <div className="signin-page-card">
          <div className="signin-page-brand">
            <svg viewBox="0 0 100 100" width="44" height="44">
              <path d="M14 66 A36 36 0 0 1 86 66" fill="none" stroke="url(#arcGrad3)" strokeWidth="8" strokeLinecap="round" />
              <circle cx="50" cy="30" r="3.4" fill="#8cd48d" />
              <defs>
                <linearGradient id="arcGrad3" x1="0" y1="0" x2="1" y2="0">
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

          <h3 style={{ marginTop: 22 }}>Which project?</h3>
          <p className="q-hint" style={{ marginTop: 0 }}>You have access to more than one — pick one to continue.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {items.map((p) => (
              <button
                key={p.key}
                type="button"
                className="seal-submit-btn"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                onClick={() => onChoose(p.key)}
              >
                <span>{p.label}</span>
                {p.key === defaultKey && (
                  <span className="status-chip muted" style={{ fontSize: 11 }}>
                    Last used
                  </span>
                )}
              </button>
            ))}
          </div>

          <button className="wf-btn" style={{ width: '100%', padding: '10px 0', marginTop: 18 }} type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
