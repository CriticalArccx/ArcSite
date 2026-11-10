// seal-decision-email — emails a tamper seal break requestor the outcome of their request (ARC-323).
//
// Called by the ArcSite web client right after a CCM submits decisions on a break request
// (src/lib/api.ts, sendBreakDecisionEmail) via
// supabase.functions.invoke('seal-decision-email', { body: { projectKey, requestId } }).
// Deployed WITH the default JWT verification on; the caller's own session is re-checked against
// arcapp_user_allowed_project(projectKey), the same check chat-notify uses.
//
// The browser only says WHICH request was decided. Everything in the email (recipient, seals,
// statuses, notes, reviewer) is read here from <projectKey>BreakRequests and <projectKey>Assets
// with the service role, and it always goes to the requestor_email on that row, so this can't be
// used to send arbitrary mail to arbitrary addresses.
//
// Sends through Resend (https://resend.com). Deploy: supabase functions deploy seal-decision-email
// Secrets needed:
//   RESEND_API_KEY   an API key from Resend
//   SEAL_EMAIL_FROM  the sender, on a domain verified in Resend, e.g. "ArcSite <arcsite@example.com>"
// Without them the function answers { sent: false, error } instead of failing, and the decisions
// themselves are already saved by then.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Same status names as src/lib/api.ts (BREAK_*_STATUS / INTACT_STATUS).
const BREAK_REQUESTED_STATUS = 'Break Requested (Pending Approval)'
const BREAK_APPROVED_STATUS = 'Break Approved by CCM'
const INTACT_STATUS = 'Intact'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function outcome(status: string): string {
  if (status === BREAK_APPROVED_STATUS) return 'Approved'
  if (status === INTACT_STATUS) return 'Denied'
  if (status === BREAK_REQUESTED_STATUS) return 'Still pending'
  return status || 'Unknown'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { projectKey?: string; requestId?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const projectKey = (body.projectKey ?? '').trim()
  const requestId = Number(body.requestId)
  // projectKey doubles as the table prefix (STY4 → STY4BreakRequests), so keep it to plain letters
  // and digits before it goes anywhere near a table name.
  if (!/^[A-Za-z0-9]{1,32}$/.test(projectKey) || !Number.isInteger(requestId) || requestId <= 0) {
    return json({ error: 'projectKey and a numeric requestId are required' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: allowed, error: allowedErr } = await callerClient.rpc('arcapp_user_allowed_project', { p: projectKey })
  if (allowedErr || !allowed) return json({ error: 'Not authorized for this project.' }, 403)

  const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const from = Deno.env.get('SEAL_EMAIL_FROM') ?? ''
  if (!apiKey || !from) {
    return json({ sent: false, error: "Email isn't set up yet (the seal-decision-email function needs RESEND_API_KEY and SEAL_EMAIL_FROM)." })
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: request, error: reqErr } = await admin
    .from(`${projectKey}BreakRequests`)
    .select('id, asset_name, location, requested_seal_numbers, reason, requestor_name, requestor_email, created_at, ccm_decision, decided_by, decided_at, decision_notes')
    .eq('id', requestId)
    .maybeSingle()
  if (reqErr) return json({ error: reqErr.message }, 500)
  if (!request) return json({ error: 'Break request not found.' }, 404)
  if (request.ccm_decision === 'Pending') return json({ sent: false, error: 'Some seals in this request are still pending, so no email was sent yet.' })

  const to = (request.requestor_email ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ sent: false, error: 'This request has no valid requestor email on file.' })

  const sealNumbers = String(request.requested_seal_numbers ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const { data: assets, error: assetsErr } = await admin
    .from(`${projectKey}Assets`)
    .select('seal_number, sub_area, status')
    .eq('asset_name', request.asset_name)
    .in('seal_number', sealNumbers.length ? sealNumbers : [''])
  if (assetsErr) return json({ error: assetsErr.message }, 500)

  const seals = (assets ?? []).map((a) => ({
    label: a.sub_area ? `${a.seal_number} / ${a.sub_area}` : String(a.seal_number ?? ''),
    result: outcome(a.status ?? ''),
  }))
  const approved = seals.filter((s) => s.result === 'Approved').length
  const denied = seals.filter((s) => s.result === 'Denied').length
  const notes = String(request.decision_notes ?? '').trim()
  const reviewer = String(request.decided_by ?? '').trim()
  const asset = String(request.asset_name ?? '')
  const decidedOn = request.decided_at ? new Date(request.decided_at).toUTCString() : ''

  const subject = `Tamper seal break request ${request.ccm_decision}: ${asset}`
  const lines = [
    `Hi ${request.requestor_name || 'there'},`,
    '',
    `Your request to break tamper seals on ${asset}${request.location ? ` (${request.location})` : ''} has been reviewed.`,
    `Decision: ${request.ccm_decision} (${approved} approved, ${denied} denied)`,
    reviewer ? `Reviewed by: ${reviewer}${decidedOn ? ` on ${decidedOn}` : ''}` : '',
    request.reason ? `Your reason: ${request.reason}` : '',
    '',
    'Seals:',
    ...seals.map((s) => `  Seal #${s.label}: ${s.result}`),
    ...(notes ? ['', 'Reviewer notes:', notes] : []),
    '',
    'Only break the seals marked Approved. Denied seals stay intact.',
  ].filter((l, i, all) => l !== '' || all[i - 1] !== '')
  const text = lines.join('\n')

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.5">
<p>Hi ${esc(request.requestor_name || 'there')},</p>
<p>Your request to break tamper seals on <strong>${esc(asset)}</strong>${request.location ? ` (${esc(request.location)})` : ''} has been reviewed.</p>
<p><strong>Decision: ${esc(request.ccm_decision ?? '')}</strong> (${approved} approved, ${denied} denied)<br>
${reviewer ? `Reviewed by ${esc(reviewer)}${decidedOn ? ` on ${esc(decidedOn)}` : ''}<br>` : ''}
${request.reason ? `Your reason: ${esc(request.reason)}` : ''}</p>
<table style="border-collapse:collapse;font-size:14px">
<tr><th style="text-align:left;padding:4px 12px 4px 0;border-bottom:1px solid #ccc">Seal</th><th style="text-align:left;padding:4px 0;border-bottom:1px solid #ccc">Decision</th></tr>
${seals
  .map(
    (s) =>
      `<tr><td style="padding:4px 12px 4px 0">#${esc(s.label)}</td><td style="padding:4px 0;color:${s.result === 'Approved' ? '#1a7f37' : s.result === 'Denied' ? '#b42318' : '#555'}"><strong>${esc(s.result)}</strong></td></tr>`,
  )
  .join('\n')}
</table>
${notes ? `<p><strong>Reviewer notes</strong><br>${esc(notes).replace(/\n/g, '<br>')}</p>` : ''}
<p>Only break the seals marked Approved. Denied seals stay intact.</p>
</div>`

  const mailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html, ...(reviewer.includes('@') ? { reply_to: reviewer } : {}) }),
  })
  if (!mailRes.ok) {
    const detail = await mailRes.text().catch(() => '')
    return json({ sent: false, error: `The email service rejected the message (${mailRes.status}): ${detail.slice(0, 300)}` }, 502)
  }
  return json({ sent: true, to })
})
