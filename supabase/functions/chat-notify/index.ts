// chat-notify — outbound ArcSite → Google Chat notifications.
//
// Called by the ArcSite web client (src/lib/api.ts, notifyGoogleChat/sendChatTestMessage) via
// supabase.functions.invoke('chat-notify', { body: { projectKey, text } }). Deployed WITH the
// default JWT verification on (no --no-verify-jwt) — the caller must be a real signed-in Supabase
// session, which this function then re-checks against arcapp_user_allowed_project(projectKey) so
// a user restricted to one project can't make this function post into another project's space.
//
// The actual webhook URL is looked up server-side (service role) rather than read by the browser
// and posted to directly — Google Chat's incoming-webhook endpoint doesn't send CORS headers, so a
// direct browser POST would fail anyway, and this keeps the lookup in one place regardless of how
// arcapp_settings' own RLS changes later.
//
// Deploy: supabase functions deploy chat-notify
// Secrets needed: none beyond the SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// that Supabase injects into every Edge Function automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { projectKey?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const projectKey = (body.projectKey ?? '').trim()
  const text = (body.text ?? '').trim()
  if (!projectKey || !text) return json({ error: 'projectKey and text are required' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  // Re-check authorization with the CALLER's own JWT (not service role) — same function every
  // table's write policy already uses, so this can't be used to reach a project the signed-in
  // user isn't themselves allowed into.
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: allowed, error: allowedErr } = await callerClient.rpc('arcapp_user_allowed_project', { p: projectKey })
  if (allowedErr || !allowed) return json({ error: 'Not authorized for this project.' }, 403)

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: row, error: settingsErr } = await admin
    .from('arcapp_settings')
    .select('setting_value')
    .eq('project_key', projectKey)
    .eq('setting_key', 'google_chat_webhook_url')
    .maybeSingle()
  if (settingsErr) return json({ error: settingsErr.message }, 500)
  const webhookUrl = (row?.setting_value ?? '').trim()
  if (!webhookUrl) return json({ error: "Google Chat isn't configured for this project yet (Settings → Google Chat webhook URL)." }, 400)

  const chatRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!chatRes.ok) {
    const detail = await chatRes.text().catch(() => '')
    return json({ error: `Google Chat rejected the message (${chatRes.status}): ${detail.slice(0, 300)}` }, 502)
  }
  return json({ ok: true })
})
