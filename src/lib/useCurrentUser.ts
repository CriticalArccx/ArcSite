import { useEffect, useState, useCallback, useRef } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { UserRole } from './api'
import { CURRENT_PROJECT, PROJECTS, isProjectKey, setCurrentProject } from './project'
import type { ProjectKey } from './project'

/** Set once per browser session (sessionStorage, not localStorage — cleared when the tab/browser
 * closes, not just on sign-out) after someone confirms which project to work in via
 * ProjectPickerPage. Lets a mid-session project switch (which reloads the page via
 * setCurrentProject) or a plain page refresh skip straight back into the app instead of asking
 * again — "every sign-in" means once per real sign-in, not once per reload. */
const PROJECT_CONFIRMED_KEY = 'arcapp_project_confirmed'

function hasConfirmedProjectThisSession(): boolean {
  try {
    return sessionStorage.getItem(PROJECT_CONFIRMED_KEY) === '1'
  } catch {
    return false
  }
}

export type CurrentUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  /** Display name — from arcapp_authorized_users if an admin set one, else Google's profile name, else the email. */
  name: string
  /** From arcapp_authorized_users.role — 'admin' can edit Settings, 'editor' can't. Deliberately
   * ArcApp's own concept, not shared with LaunchPad's STY4authorized_editors table (which has its
   * own separate is_admin/role columns for a different purpose — edit rights on the CxAlloy-shared
   * side of things). */
  role: UserRole
  /** From arcapp_authorized_users.allowed_projects — null means every project (PROJECTS in
   * project.ts), a non-null array restricts this person to just those. Used by Topbar's project
   * switcher to only list what this person can actually reach; the server-side half of this same
   * restriction lives in RLS (arcapp_user_allowed_project() in supabase/policies.sql). */
  allowedProjects: ProjectKey[] | null
}

function toRawUser(u: SupabaseUser | null): { id: string; email: string; firstName: string; lastName: string; googleName: string } | null {
  if (!u || !u.email) return null
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const googleName = typeof meta['full_name'] === 'string' ? (meta['full_name'] as string) : typeof meta['name'] === 'string' ? (meta['name'] as string) : ''
  return {
    id: u.id,
    email: u.email,
    firstName: typeof meta['first_name'] === 'string' ? (meta['first_name'] as string) : '',
    lastName: typeof meta['last_name'] === 'string' ? (meta['last_name'] as string) : '',
    googleName,
  }
}

/**
 * Replaces Retool's platform-provided `useCurrentUser`. Retool used to inject the signed-in
 * user's session automatically; here we use Supabase Auth directly.
 *
 * Sign-in is gated: after ANY successful auth (Google or the magic-link fallback), this checks
 * the signed-in email against `arcapp_authorized_users` and immediately signs back out anyone
 * not on that list, surfacing why via `authError`. See supabase/schema.sql for that table and
 * supabase/policies.sql for why its RLS only lets you read your own row.
 */
/** What ProjectPickerPage needs to render — exposed by the hook whenever someone who's allowed
 * into more than one project hasn't yet confirmed one this session (see PROJECT_CONFIRMED_KEY). */
export type ProjectChoice = { options: ProjectKey[]; defaultKey: ProjectKey }

type PendingUser = { base: NonNullable<ReturnType<typeof toRawUser>>; row: { name: string | null; role: string | null }; rawAllowed: ProjectKey[] | null }

export function useCurrentUser(): {
  user: CurrentUser | null
  loading: boolean
  /** Set when a sign-in succeeded at the Supabase Auth level but the email isn't authorized — cleared on the next sign-in attempt or sign-out. */
  authError: string | null
  /** Non-null exactly when ProjectPickerPage should be shown instead of either SignInPage or the
   * app shell — someone authorized for more than one project who hasn't picked one this session yet. */
  projectChoice: ProjectChoice | null
  /** Call with the chosen project key. Picking anything other than CURRENT_PROJECT reloads the
   * page (via setCurrentProject); picking CURRENT_PROJECT itself just continues into the app
   * shell without a reload. Either way, this session won't be asked again (see PROJECT_CONFIRMED_KEY) */
  confirmProject: (key: ProjectKey) => void
  signInWithGoogle: () => Promise<{ error: string | null }>
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  clearAuthError: () => void
} {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [projectChoice, setProjectChoice] = useState<ProjectChoice | null>(null)
  // Guards against the SIGNED_OUT event we trigger ourselves (below) re-entering this same check.
  const checking = useRef(false)
  const pendingRef = useRef<PendingUser | null>(null)

  // Used by both the normal sign-in path and confirmProject (picking the already-current project
  // from ProjectPickerPage, which doesn't need a reload) — kept as one function so the two paths
  // can't drift apart on what "finishing" sign-in actually means.
  const finish = useCallback(({ base, row, rawAllowed }: PendingUser) => {
    // Signed in fine, but the project this browser last had selected (CURRENT_PROJECT, read from
    // localStorage at module load — see project.ts) isn't one this person can reach. Rather than
    // showing them someone else's project, switch them straight into one they can — setCurrentProject
    // reloads the page, so this request's `user`/`loading` state doesn't need settling; the reload
    // re-runs this whole check against the new project.
    if (rawAllowed && !rawAllowed.includes(CURRENT_PROJECT)) {
      setCurrentProject(rawAllowed[0])
      return
    }
    setAuthError(null)
    setProjectChoice(null)
    setUser({
      id: base.id,
      email: base.email,
      firstName: base.firstName,
      lastName: base.lastName,
      name: row.name || base.googleName || `${base.firstName} ${base.lastName}`.trim() || base.email,
      role: row.role === 'admin' ? 'admin' : 'editor',
      allowedProjects: rawAllowed,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function applySession(rawUser: SupabaseUser | null) {
      const base = toRawUser(rawUser)
      if (!base) {
        if (!cancelled) setUser(null)
        if (!cancelled) setProjectChoice(null)
        if (!cancelled) setLoading(false)
        return
      }
      if (checking.current) return
      checking.current = true
      try {
        const email = base.email.toLowerCase().trim()
        const res = await supabase
          .from('arcapp_authorized_users')
          .select('name, role, allowed_projects')
          .ilike('email', email)
          .limit(1)
          .maybeSingle()
        if (cancelled) return
        if (res.error) throw new Error(res.error.message)
        if (!res.data) {
          setAuthError(`${base.email} isn't authorized for ArcApp yet. Contact an administrator to be added.`)
          setUser(null)
          setLoading(false)
          await supabase.auth.signOut()
          return
        }
        const row = res.data as { name: string | null; role: string | null; allowed_projects: string[] | null }
        const rawAllowed = Array.isArray(row.allowed_projects) ? row.allowed_projects.filter(isProjectKey) : null
        // Empty array (every entry pruned, or an admin genuinely assigned zero projects) means
        // "authorized for ArcApp but not let into any site" — a real state, not a bug, so it gets
        // its own clear message rather than silently falling back to "all projects".
        if (rawAllowed && rawAllowed.length === 0) {
          setAuthError(`${base.email} is authorized for ArcApp but isn't assigned to any project yet. Contact an administrator.`)
          setUser(null)
          setLoading(false)
          await supabase.auth.signOut()
          return
        }

        const choices: ProjectKey[] = rawAllowed ?? PROJECTS.map((p) => p.key)
        if (choices.length > 1 && !hasConfirmedProjectThisSession()) {
          setAuthError(null)
          pendingRef.current = { base, row, rawAllowed }
          setProjectChoice({ options: choices, defaultKey: choices.includes(CURRENT_PROJECT) ? CURRENT_PROJECT : choices[0] })
          setLoading(false)
          return
        }

        finish({ base, row, rawAllowed })
      } catch (err) {
        if (cancelled) return
        setAuthError('Could not verify authorization: ' + (err instanceof Error ? err.message : String(err)))
        setUser(null)
        setLoading(false)
      } finally {
        checking.current = false
      }
    }

    supabase.auth.getSession().then(({ data }) => void applySession(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user ?? null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [finish])

  const confirmProject = useCallback(
    (key: ProjectKey) => {
      try {
        sessionStorage.setItem(PROJECT_CONFIRMED_KEY, '1')
      } catch {
        // Private browsing etc. — worst case this asks again next reload, not a functional break.
      }
      if (key !== CURRENT_PROJECT) {
        setCurrentProject(key) // Reloads the page; PROJECT_CONFIRMED_KEY is already set by then.
        return
      }
      // Same project as already current — no reload needed, just hand off from the picker
      // straight into the app shell.
      if (pendingRef.current) {
        const pending = pendingRef.current
        pendingRef.current = null
        finish(pending)
      }
    },
    [finish],
  )

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return { error: error?.message ?? null }
  }, [])

  const signInWithEmail = useCallback(async (email: string) => {
    setAuthError(null)
    // Without emailRedirectTo this fell back to the shared Supabase project's default Site URL
    // — which is LaunchPad's, since this project is shared with it — landing the magic-link
    // click there instead of back in ArcApp. Google sign-in already passed its own redirectTo
    // (see signInWithGoogle above); this was the one place it was missing.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)
    try {
      // So the picker is asked again on the next sign-in in this same tab, not just on a fresh
      // browser session — matches "every sign-in" rather than "every sessionStorage lifetime".
      sessionStorage.removeItem(PROJECT_CONFIRMED_KEY)
    } catch {
      // Private browsing etc. — harmless if this doesn't persist.
    }
    await supabase.auth.signOut()
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])

  return { user, loading, authError, projectChoice, confirmProject, signInWithGoogle, signInWithEmail, signOut, clearAuthError }
}
