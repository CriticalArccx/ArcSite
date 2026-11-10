// chat-bot — inbound Google Chat → ArcSite interactive bot.
//
// This is the HTTP endpoint you paste into the Chat app's "Interactivity" config in Google Cloud
// Console (APIs & Services → Google Chat API → Configuration). Google Chat POSTs an event here
// every time someone @mentions the bot in a space or messages it directly; this function parses
// the message, runs a command, and returns a Chat message object synchronously as the response.
//
// Auth: Google Chat does NOT send a Supabase-issued JWT, so this function must be deployed with
// --no-verify-jwt (otherwise Supabase's gateway rejects every request before this code even runs).
// In its place, this function checks a shared-secret `token` query param against the
// CHAT_SHARED_SECRET env var — put the same value in both the deployed secret and the endpoint URL
// you give Google Chat, e.g.:
//   https://<project-ref>.supabase.co/functions/v1/chat-bot?token=<secret>&project=STY4
// Treat that URL itself as a secret (don't post it anywhere outside the Cloud Console config).
//
// Scope: one project per deployed endpoint, via the `project` query param (falls back to
// ARCAPP_CHAT_DEFAULT_PROJECT if omitted). To support a second project's own Chat space, set up a
// second Chat app in Cloud Console pointing at this same function with a different `project` value
// — no code change needed.
//
// Deploy: supabase functions deploy chat-bot --no-verify-jwt
// Secrets needed: CHAT_SHARED_SECRET, optionally ARCAPP_CHAT_DEFAULT_PROJECT
//   supabase secrets set CHAT_SHARED_SECRET=<a long random string> ARCAPP_CHAT_DEFAULT_PROJECT=STY4
//
// Commands supported (typed as the message text, with or without the leading "/"):
//   status            — counts of open to-dos, overdue deliverables, lessons learned logged
//   todo <text>       — adds a to-do (arcapp_tasks), tagged "norm", attributed to the Chat sender
//   lesson <text>     — logs a lesson learned (arcapp_lessons_learned), category "Other"
//   anything else     — a short usage reminder

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

type ChatEvent = {
  type?: string
  message?: { text?: string; argumentText?: string }
  user?: { displayName?: string }
}

function chatJson(text: string): Response {
  return new Response(JSON.stringify(text ? { text } : {}), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
function plain(body: string, status: number): Response {
  return new Response(body, { status })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return plain('Method not allowed', 405)

  const url = new URL(req.url)
  const expected = Deno.env.get('CHAT_SHARED_SECRET') ?? ''
  if (!expected || url.searchParams.get('token') !== expected) return plain('Unauthorized', 401)

  const projectKey = (url.searchParams.get('project') || Deno.env.get('ARCAPP_CHAT_DEFAULT_PROJECT') || '').trim()
  if (!projectKey) return chatJson('ArcSite bot: no project configured for this endpoint — add ?project=<KEY> to its URL.')

  let event: ChatEvent
  try {
    event = await req.json()
  } catch {
    return chatJson("Sorry, I couldn't read that.")
  }

  if (event.type === 'ADDED_TO_SPACE') {
    return chatJson(`Hi! I'm the ArcSite bot for ${projectKey}. Try "/status", "/todo <text>", or "/lesson <text>".`)
  }
  if (event.type !== 'MESSAGE') return chatJson('')

  const raw = (event.message?.argumentText ?? event.message?.text ?? '').trim()
  const loggedBy = `${event.user?.displayName || 'Someone in Google Chat'} (Google Chat)`
  const match = raw.match(/^\/?(\w+)\s*([\s\S]*)$/)
  const command = (match?.[1] ?? '').toLowerCase()
  const arg = (match?.[2] ?? '').trim()

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    if (command === 'status') return chatJson(await buildStatus(db, projectKey))

    if (command === 'todo') {
      if (!arg) return chatJson('Usage: /todo <what needs doing>')
      const { error } = await db.from('arcapp_tasks').insert({
        project_key: projectKey,
        text: arg,
        tag: 'norm',
        sys: '',
        status: 'todo',
        done: false,
        created_by: loggedBy,
        updated_by: loggedBy,
      })
      if (error) throw error
      return chatJson(`Added to the To-Do list: "${arg}"`)
    }

    if (command === 'lesson') {
      if (!arg) return chatJson('Usage: /lesson <what you learned>')
      const { error } = await db.from('arcapp_lessons_learned').insert({
        project_key: projectKey,
        title: arg,
        description: '',
        category: 'Other',
        logged_by: loggedBy,
        updated_by: loggedBy,
      })
      if (error) throw error
      return chatJson(`Logged as a lesson learned: "${arg}"`)
    }
  } catch (err) {
    return chatJson(`Sorry, something went wrong: ${err instanceof Error ? err.message : String(err)}`)
  }

  return chatJson('Commands: "/status" for a quick summary, "/todo <text>" to add a to-do, "/lesson <text>" to log a lesson learned.')
})

async function buildStatus(db: SupabaseClient, projectKey: string): Promise<string> {
  const todayIso = new Date().toISOString().slice(0, 10)
  const [openTasks, overdueMilestones, lessonsCount] = await Promise.all([
    db.from('arcapp_tasks').select('id', { count: 'exact', head: true }).eq('project_key', projectKey).eq('done', false),
    db.from('arcapp_milestones').select('id', { count: 'exact', head: true }).eq('project_key', projectKey).lt('due_date', todayIso),
    db.from('arcapp_lessons_learned').select('id', { count: 'exact', head: true }).eq('project_key', projectKey),
  ])
  const n = (r: { count: number | null }) => r.count ?? 0
  return (
    `Status for ${projectKey}:\n` +
    `• ${n(openTasks)} open to-do${n(openTasks) === 1 ? '' : 's'}\n` +
    `• ${n(overdueMilestones)} overdue deliverable${n(overdueMilestones) === 1 ? '' : 's'}\n` +
    `• ${n(lessonsCount)} lesson${n(lessonsCount) === 1 ? '' : 's'} learned logged total`
  )
}
