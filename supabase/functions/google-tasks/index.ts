// google-tasks — two-way sync between ArcSite To-Dos and each person's Google Tasks (ARC-322).
//
// How it works:
// - Each person clicks "Connect Google Tasks" on the To-Do page once and approves access to their
//   own Google Tasks (nothing else). Their refresh token is kept in arcapp_google_tasks_accounts,
//   which only this function (service role) can read.
// - Every To-Do assigned to them, directly or through a team they're on, is kept in an "ArcSite"
//   list in their Google Tasks, so it also shows in Google Calendar's Tasks panel. Creating tasks
//   through the API sends no notifications, as ARC-322 asks.
// - Marking a task complete (or not) in either place updates the other. When both sides changed
//   between two syncs, ArcSite wins. Deleting the task in Google just stops syncing it for that
//   person; deleting or reassigning the To-Do in ArcSite removes it from their Google Tasks.
//
// Requests:
//   POST {action:'connect', returnTo}  signed-in user → { url } of Google's consent screen
//   GET  /google-tasks/callback        Google redirects here after consent
//   POST {action:'status'}             signed-in user → whether they're connected
//   POST {action:'disconnect'}         signed-in user → removes the ArcSite list and the token
//   POST {action:'sync'}               signed-in user, or the scheduled job with header
//                                      x-sync-secret → syncs every connected account
//
// Deploy with --no-verify-jwt, because Google's redirect to /callback carries no Supabase session.
// Every other action checks the caller's session itself (see getCaller).
//   supabase functions deploy google-tasks --no-verify-jwt
// Secrets:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  OAuth client (Web application) from Google Cloud
//   APP_ORIGINS               comma-separated ArcSite origins allowed to return to after connecting,
//                             e.g. "https://arcsite.example.com,https://arcsite-*.vercel.app".
//                             The first one is also used for the "Open in ArcSite" link.
//   GOOGLE_TASKS_SYNC_SECRET  shared secret for the scheduled sync (pg_cron; see README)

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const SCOPES = 'openid email https://www.googleapis.com/auth/tasks'
const LIST_TITLE = 'ArcSite'
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1'
const STATE_MAX_AGE_MS = 15 * 60 * 1000
const TAG_LABEL: Record<string, string> = { crit: 'Critical', high: 'High', norm: 'Normal' }

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const SUPABASE_URL = env('SUPABASE_URL')
const CLIENT_ID = env('GOOGLE_CLIENT_ID')
const CLIENT_SECRET = env('GOOGLE_CLIENT_SECRET')
const SYNC_SECRET = env('GOOGLE_TASKS_SYNC_SECRET')
const APP_ORIGINS = env('APP_ORIGINS')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean)
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-tasks/callback`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

const admin = () => createClient(SUPABASE_URL, env('SUPABASE_SERVICE_ROLE_KEY'))

// ---------------------------------------------------------------------------
// who's calling
// ---------------------------------------------------------------------------

/** The signed-in ArcSite user's email (lowercased), or null. Must also be on
 * arcapp_authorized_users, the same list the app's sign-in gate uses. */
async function getCaller(req: Request, db: SupabaseClient): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data, error } = await db.auth.getUser(jwt)
  const email = data?.user?.email?.toLowerCase()
  if (error || !email) return null
  const { data: row } = await db.from('arcapp_authorized_users').select('email').ilike('email', email).maybeSingle()
  return row ? email : null
}

// ---------------------------------------------------------------------------
// signed OAuth state, so the callback knows which ArcSite user started it
// ---------------------------------------------------------------------------

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enc = new TextEncoder()

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))))
}

async function makeState(email: string, returnTo: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ e: email, r: returnTo, t: Date.now() })))
  return `${payload}.${await hmac(payload)}`
}

async function readState(state: string): Promise<{ e: string; r: string } | null> {
  const [payload, sig] = state.split('.')
  if (!payload || !sig || (await hmac(payload)) !== sig) return null
  try {
    const parsed = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    if (typeof parsed.e !== 'string' || Date.now() - Number(parsed.t) > STATE_MAX_AGE_MS) return null
    return { e: parsed.e, r: String(parsed.r ?? '') }
  } catch {
    return null
  }
}

/** Only send people back to an ArcSite origin listed in APP_ORIGINS ('*' matches any run of
 * characters, for Vercel preview URLs). Anything else goes to the first listed origin. */
function safeReturnOrigin(returnTo: string): string {
  let origin = ''
  try {
    origin = new URL(returnTo).origin
  } catch {
    /* fall through */
  }
  const ok = APP_ORIGINS.some((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`).test(origin))
  return ok ? origin : (APP_ORIGINS.find((o) => !o.includes('*')) ?? '')
}

// ---------------------------------------------------------------------------
// Google calls
// ---------------------------------------------------------------------------

class GoogleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function tokenRequest(params: Record<string, string>): Promise<Record<string, string>> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new GoogleError(res.status, body.error === 'invalid_grant' ? 'invalid_grant' : body.error_description || body.error || `token ${res.status}`)
  return body
}

async function g<T = Record<string, unknown>>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${TASKS_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (res.status === 204) return {} as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new GoogleError(res.status, body?.error?.message || `Google Tasks ${res.status}`)
  return body as T
}

type GTask = { id: string; title?: string; notes?: string; due?: string; status?: 'needsAction' | 'completed' }

async function listAllTasks(token: string, listId: string): Promise<GTask[]> {
  const out: GTask[] = []
  let pageToken = ''
  do {
    const qs = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', maxResults: '100' })
    if (pageToken) qs.set('pageToken', pageToken)
    const page = await g<{ items?: GTask[]; nextPageToken?: string }>(token, `/lists/${encodeURIComponent(listId)}/tasks?${qs}`)
    out.push(...(page.items ?? []))
    pageToken = page.nextPageToken ?? ''
  } while (pageToken)
  return out
}

/** The person's "ArcSite" list: the stored one if it still exists, else one with that title,
 * else a new one. `fresh` is true when the stored list was gone, so old links are meaningless. */
async function ensureList(token: string, storedId: string | null): Promise<{ id: string; fresh: boolean }> {
  if (storedId) {
    try {
      await g(token, `/users/@me/lists/${encodeURIComponent(storedId)}`)
      return { id: storedId, fresh: false }
    } catch (e) {
      if (!(e instanceof GoogleError) || e.status !== 404) throw e
    }
  }
  const lists = await g<{ items?: Array<{ id: string; title: string }> }>(token, '/users/@me/lists?maxResults=100')
  const existing = (lists.items ?? []).find((l) => l.title === LIST_TITLE)
  if (existing) return { id: existing.id, fresh: true }
  const created = await g<{ id: string }>(token, '/users/@me/lists', { method: 'POST', body: JSON.stringify({ title: LIST_TITLE }) })
  return { id: created.id, fresh: true }
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

type Account = { email: string; refresh_token: string; tasklist_id: string | null }
type TaskRow = {
  id: string
  project_key: string
  text: string
  tag: string
  sys: string
  due_date: string | null
  done: boolean
  assigned_team_id: string | null
  assigned_email: string | null
}
type Link = { task_id: string; email: string; google_task_id: string; synced_done: boolean; synced_hash: string; google_deleted: boolean }
type Summary = { accounts: number; pushed: number; pulled: number; removed: number; failed: Record<string, string> }

function desiredFields(t: TaskRow, teamName: string | null) {
  const appUrl = APP_ORIGINS.find((o) => !o.includes('*'))
  const notes = [
    `Priority: ${TAG_LABEL[t.tag] ?? 'Normal'}`,
    t.sys ? `System: ${t.sys}` : '',
    `Project: ${t.project_key}`,
    teamName ? `Assigned to team: ${teamName}` : '',
    appUrl ? `Open in ArcSite: ${appUrl}/todo` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return { title: t.text.slice(0, 1000), notes, due: t.due_date ? `${t.due_date}T00:00:00.000Z` : null }
}

async function sha(s: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))))
}

async function syncAll(db: SupabaseClient, onlyEmail?: string): Promise<Summary> {
  let accountsQuery = db.from('arcapp_google_tasks_accounts').select('email, refresh_token, tasklist_id')
  if (onlyEmail) accountsQuery = accountsQuery.eq('email', onlyEmail)
  const { data: accounts, error: accErr } = await accountsQuery
  if (accErr) throw new Error(accErr.message)
  const summary: Summary = { accounts: accounts?.length ?? 0, pushed: 0, pulled: 0, removed: 0, failed: {} }
  if (!accounts?.length) return summary

  const [tasksRes, teamsRes, linksRes] = await Promise.all([
    db.from('arcapp_tasks').select('id, project_key, text, tag, sys, due_date, done, assigned_team_id, assigned_email'),
    db.from('arcapp_teams').select('id, name, members'),
    db.from('arcapp_google_task_links').select('task_id, email, google_task_id, synced_done, synced_hash, google_deleted').in(
      'email',
      accounts.map((a) => a.email),
    ),
  ])
  for (const r of [tasksRes, teamsRes, linksRes]) if (r.error) throw new Error(r.error.message)
  // One shared copy of every task, so a completion pulled from one person's Google Tasks is pushed
  // to the other members of the same team in this same run.
  const tasks = new Map((tasksRes.data as TaskRow[]).map((t) => [t.id, t]))
  const teams = new Map(
    (teamsRes.data as Array<{ id: string; name: string; members: Array<{ email?: string }> | null }>).map((t) => [
      t.id,
      { name: t.name, members: new Set((t.members ?? []).map((m) => (m.email ?? '').trim().toLowerCase()).filter(Boolean)) },
    ]),
  )
  const links = (linksRes.data as Link[]) ?? []

  for (const account of accounts as Account[]) {
    try {
      const counts = await syncAccount(db, account, tasks, teams, links.filter((l) => l.email === account.email))
      summary.pushed += counts.pushed
      summary.pulled += counts.pulled
      summary.removed += counts.removed
      await db.from('arcapp_google_tasks_accounts').update({ last_sync_at: new Date().toISOString(), last_error: null }).eq('email', account.email)
    } catch (e) {
      const message =
        e instanceof GoogleError && e.message === 'invalid_grant'
          ? 'Google access was revoked or has expired. Reconnect Google Tasks.'
          : e instanceof Error
            ? e.message
            : String(e)
      summary.failed[account.email] = message
      await db.from('arcapp_google_tasks_accounts').update({ last_error: message }).eq('email', account.email)
    }
  }
  return summary
}

async function syncAccount(
  db: SupabaseClient,
  account: Account,
  tasks: Map<string, TaskRow>,
  teams: Map<string, { name: string; members: Set<string> }>,
  links: Link[],
): Promise<{ pushed: number; pulled: number; removed: number }> {
  const email = account.email
  const counts = { pushed: 0, pulled: 0, removed: 0 }
  const { access_token: token } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: account.refresh_token })

  const list = await ensureList(token, account.tasklist_id)
  if (list.id !== account.tasklist_id) await db.from('arcapp_google_tasks_accounts').update({ tasklist_id: list.id }).eq('email', email)
  if (list.fresh && links.length) {
    // The old list is gone, so its links point nowhere. Start over in the new list.
    await db.from('arcapp_google_task_links').delete().eq('email', email)
    links = []
  }
  const listPath = `/lists/${encodeURIComponent(list.id)}/tasks`
  const google = new Map((await listAllTasks(token, list.id)).map((t) => [t.id, t]))
  const linkByTask = new Map(links.map((l) => [l.task_id, l]))

  const mine = [...tasks.values()].filter(
    (t) => (t.assigned_email ?? '').trim().toLowerCase() === email || (t.assigned_team_id != null && teams.get(t.assigned_team_id)?.members.has(email)),
  )
  const mineIds = new Set(mine.map((t) => t.id))

  for (const task of mine) {
    const fields = desiredFields(task, task.assigned_team_id ? (teams.get(task.assigned_team_id)?.name ?? null) : null)
    const hash = await sha(JSON.stringify(fields))
    const link = linkByTask.get(task.id)

    if (!link) {
      if (task.done) continue // don't fill a newly connected list with already-finished work
      const created = await g<GTask>(token, listPath, { method: 'POST', body: JSON.stringify({ ...fields, status: 'needsAction' }) })
      const ins = await db
        .from('arcapp_google_task_links')
        .insert({ task_id: task.id, email, google_task_id: created.id, synced_done: false, synced_hash: hash })
      if (ins.error) {
        // Another sync running at the same moment already linked this task; drop our duplicate.
        await g(token, `${listPath}/${encodeURIComponent(created.id)}`, { method: 'DELETE' }).catch(() => {})
        if (ins.error.code !== '23505') throw new Error(ins.error.message)
        continue
      }
      counts.pushed++
      continue
    }
    if (link.google_deleted) continue

    const gt = google.get(link.google_task_id)
    if (!gt) {
      // Deleted in Google by its owner: stop syncing it for them, but leave the To-Do alone.
      await db.from('arcapp_google_task_links').update({ google_deleted: true, updated_at: new Date().toISOString() }).eq('task_id', task.id).eq('email', email)
      continue
    }

    const googleDone = gt.status === 'completed'
    let target = task.done
    if (task.done === link.synced_done && googleDone !== link.synced_done) {
      // Only Google changed: apply it to ArcSite.
      const now = new Date().toISOString()
      const upd = await db
        .from('arcapp_tasks')
        .update({
          done: googleDone,
          status: googleDone ? 'done' : 'todo',
          completed_at: googleDone ? now : null,
          updated_at: now,
          updated_by: `Google Tasks (${email})`,
        })
        .eq('id', task.id)
      if (upd.error) throw new Error(upd.error.message)
      task.done = googleDone
      target = googleDone
      counts.pulled++
    }

    if (googleDone !== target || hash !== link.synced_hash) {
      await g(token, `${listPath}/${encodeURIComponent(gt.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...fields, status: target ? 'completed' : 'needsAction', ...(target ? {} : { completed: null }) }),
      })
      if (googleDone !== target) counts.pushed++
    }
    if (target !== link.synced_done || hash !== link.synced_hash) {
      await db
        .from('arcapp_google_task_links')
        .update({ synced_done: target, synced_hash: hash, updated_at: new Date().toISOString() })
        .eq('task_id', task.id)
        .eq('email', email)
    }
  }

  // To-Dos that were deleted in ArcSite or are no longer assigned to this person.
  for (const link of links) {
    if (mineIds.has(link.task_id)) continue
    if (!link.google_deleted) {
      await g(token, `${listPath}/${encodeURIComponent(link.google_task_id)}`, { method: 'DELETE' }).catch((e) => {
        if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e
      })
      counts.removed++
    }
    await db.from('arcapp_google_task_links').delete().eq('task_id', link.task_id).eq('email', email)
  }
  return counts
}

// ---------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------

async function handleCallback(url: URL, db: SupabaseClient): Promise<Response> {
  const state = await readState(url.searchParams.get('state') ?? '')
  const back = (origin: string, params: Record<string, string>) =>
    new Response(null, { status: 302, headers: { Location: `${origin}/todo?${new URLSearchParams(params)}` } })
  if (!state) return new Response('This Google Tasks link has expired. Go back to ArcSite and click Connect again.', { status: 400 })
  const origin = safeReturnOrigin(state.r)
  if (!origin) return new Response('APP_ORIGINS is not set on the google-tasks function.', { status: 500 })

  const code = url.searchParams.get('code')
  if (!code) return back(origin, { gtasks: 'error', reason: url.searchParams.get('error') === 'access_denied' ? 'You cancelled the Google approval.' : 'Google did not approve access.' })

  try {
    const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
    const claims = JSON.parse(atob((tokens.id_token ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const googleEmail = String(claims.email ?? '').toLowerCase()
    if (googleEmail !== state.e) {
      return back(origin, { gtasks: 'error', reason: `You approved access as ${googleEmail || 'another account'}, but you're signed in to ArcSite as ${state.e}. Connect with ${state.e}.` })
    }
    if (!tokens.refresh_token) return back(origin, { gtasks: 'error', reason: 'Google did not return offline access. Try connecting again.' })
    const up = await db.from('arcapp_google_tasks_accounts').upsert({
      email: state.e,
      google_email: googleEmail,
      refresh_token: tokens.refresh_token,
      connected_at: new Date().toISOString(),
      last_error: null,
    })
    if (up.error) throw new Error(up.error.message)
    await syncAll(db, state.e)
    return back(origin, { gtasks: 'connected' })
  } catch (e) {
    return back(origin, { gtasks: 'error', reason: e instanceof Error ? e.message : String(e) })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  const url = new URL(req.url)
  const db = admin()

  if (req.method === 'GET' && url.pathname.endsWith('/callback')) return handleCallback(url, db)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { action?: string; returnTo?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body */
  }
  const configured = Boolean(CLIENT_ID && CLIENT_SECRET && APP_ORIGINS.length)

  // The scheduled job authenticates with the shared secret instead of a user session.
  const syncSecret = req.headers.get('x-sync-secret') ?? ''
  if (body.action === 'sync' && SYNC_SECRET && syncSecret === SYNC_SECRET) {
    if (!configured) return json({ error: 'Google Tasks is not configured.' }, 500)
    return json(await syncAll(db))
  }

  const email = await getCaller(req, db)
  if (!email) return json({ error: 'Sign in to ArcSite first.' }, 401)

  switch (body.action) {
    case 'status': {
      const { data } = await db.from('arcapp_google_tasks_accounts').select('google_email, last_sync_at, last_error').eq('email', email).maybeSingle()
      return json({ configured, connected: Boolean(data), googleEmail: data?.google_email ?? null, lastSyncAt: data?.last_sync_at ?? null, lastError: data?.last_error ?? null })
    }
    case 'connect': {
      if (!configured) return json({ error: "Google Tasks isn't set up yet (the google-tasks function needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_ORIGINS)." }, 400)
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        login_hint: email,
        state: await makeState(email, String(body.returnTo ?? '')),
      })
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
    }
    case 'disconnect': {
      const { data: acct } = await db.from('arcapp_google_tasks_accounts').select('refresh_token, tasklist_id').eq('email', email).maybeSingle()
      if (acct) {
        try {
          const { access_token } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: acct.refresh_token })
          // The list only ever holds ArcSite To-Dos, and it would go stale once syncing stops.
          if (acct.tasklist_id) await g(access_token, `/users/@me/lists/${encodeURIComponent(acct.tasklist_id)}`, { method: 'DELETE' }).catch(() => {})
        } catch {
          /* token already revoked: nothing left to clean up on Google's side */
        }
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acct.refresh_token)}`, { method: 'POST' }).catch(() => {})
      }
      await db.from('arcapp_google_task_links').delete().eq('email', email)
      await db.from('arcapp_google_tasks_accounts').delete().eq('email', email)
      return json({ ok: true })
    }
    case 'sync': {
      if (!configured) return json({ pulled: 0, skipped: true })
      const s = await syncAll(db)
      // Counts only; other people's errors aren't the caller's business.
      return json({ pulled: s.pulled, pushed: s.pushed, removed: s.removed, myError: s.failed[email] ?? null })
    }
    default:
      return json({ error: 'Unknown action' }, 400)
  }
})
