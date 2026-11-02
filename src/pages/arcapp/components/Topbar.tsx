import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CURRENT_PROJECT, PROJECTS, projectLabel, setCurrentProject } from '../../../lib/project'
import type { ProjectKey } from '../../../lib/project'

type TopbarProps = {
  userName: string | null
  userInitials: string
  /** null = every project (PROJECTS); a non-null array restricts the switcher to just those — see
   * CurrentUser.allowedProjects in useCurrentUser.ts. Server-side writes are restricted the same
   * way via RLS, so this isn't just cosmetic — it's the one place in the UI someone would otherwise
   * be able to reach a project they're not assigned to from. */
  allowedProjects: ProjectKey[] | null
  onAuthClick: () => void
}

function ProjectSwitcher({ allowedProjects }: { allowedProjects: ProjectKey[] | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const options = allowedProjects === null ? PROJECTS : PROJECTS.filter((p) => allowedProjects.includes(p.key))

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Nothing to switch between — render the current project as a plain, non-interactive label
  // instead of a dropdown with one disabled-looking option.
  if (options.length <= 1) {
    return (
      <div className="site-chip" style={{ cursor: 'default' }}>
        <span className="led" /> {projectLabel(CURRENT_PROJECT)}
      </div>
    )
  }

  return (
    <div className="project-switcher" ref={ref}>
      <button type="button" className="site-chip" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="led" /> {projectLabel(CURRENT_PROJECT)}
        <ChevronDown style={{ width: 12, height: 12 }} />
      </button>
      {open && (
        <div className="project-switcher-menu" role="listbox">
          {options.map((p) => (
            <button
              key={p.key}
              type="button"
              role="option"
              aria-selected={p.key === CURRENT_PROJECT}
              className={p.key === CURRENT_PROJECT ? 'project-switcher-item active' : 'project-switcher-item'}
              onClick={() => {
                setOpen(false)
                setCurrentProject(p.key)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Topbar({ userName, userInitials, allowedProjects, onAuthClick }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 100 100" width="38" height="38">
            <path d="M14 66 A36 36 0 0 1 86 66" fill="none" stroke="url(#arcGrad)" strokeWidth="8" strokeLinecap="round" />
            <circle cx="50" cy="30" r="3.4" fill="#8cd48d" />
            <defs>
              <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8cd48d" />
                <stop offset="100%" stopColor="#358537" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="brand-text-wrap">
          <div className="brand-text">
            Arc<b>App</b>
          </div>
          <div className="brand-tagline">Mission Control for Commissioning</div>
        </div>
      </div>

      <div className="topbar-right">
        <ProjectSwitcher allowedProjects={allowedProjects} />
        <div
          className={userName ? 'auth-pill signed-in' : 'auth-pill'}
          title={userName ? `Signed in as ${userName} — click to sign out` : 'Click to sign in'}
          onClick={onAuthClick}
          role="button"
          tabIndex={0}
        >
          <div className="avatar">{userInitials}</div>
          <span>{userName ? userName.split('@')[0] : 'Sign In'}</span>
        </div>
      </div>
    </div>
  )
}
