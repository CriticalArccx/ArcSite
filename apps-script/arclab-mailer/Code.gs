/**
 * ArcLab mailer: sends email from arclab@criticalarccx.com for ArcSite (ARC-323).
 *
 * The seal-decision-email Supabase Edge Function POSTs here with a JSON body:
 *   { secret, to, subject, text, html, replyTo }
 * and this script sends it with GmailApp, as the account that deployed it.
 *
 * Setup (once, signed in to Google as arclab@criticalarccx.com):
 *   1. script.google.com → New project, name it "ArcLab mailer", paste this file in as Code.gs.
 *   2. Project Settings → Script properties → add MAILER_SECRET with a long random value.
 *   3. Deploy → New deployment → type "Web app", Execute as: Me, Who has access: Anyone.
 *      Authorize when asked (it needs permission to send email as arclab@).
 *   4. Copy the web app URL (ends in /exec) and set the function secrets:
 *        supabase secrets set ARCLAB_MAILER_URL=<that URL> ARCLAB_MAILER_SECRET=<same value as step 2>
 *
 * "Anyone" access is needed because the Edge Function has no Google sign-in. Every request without
 * the matching secret is refused, and the secret is only stored in Supabase function secrets and
 * in this script's properties, never in the browser.
 */

var SENDER = 'arclab@criticalarccx.com'
var SENDER_NAME = 'ArcSite'

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    var expected = PropertiesService.getScriptProperties().getProperty('MAILER_SECRET')
    if (!expected || body.secret !== expected) return reply({ ok: false, error: 'Not authorized.' })

    // Guard against the script being deployed from the wrong account by mistake.
    var me = (Session.getEffectiveUser().getEmail() || '').toLowerCase()
    if (me !== SENDER) return reply({ ok: false, error: 'This mailer is running as ' + (me || 'an unknown account') + ', not ' + SENDER + '.' })

    var to = String(body.to || '').trim()
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return reply({ ok: false, error: 'Invalid recipient.' })
    var subject = String(body.subject || '').slice(0, 250)
    if (!subject) return reply({ ok: false, error: 'Missing subject.' })

    var options = { name: SENDER_NAME, htmlBody: String(body.html || '') }
    var replyTo = String(body.replyTo || '').trim()
    if (/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(replyTo)) options.replyTo = replyTo

    GmailApp.sendEmail(to, subject, String(body.text || ''), options)
    return reply({ ok: true })
  } catch (err) {
    return reply({ ok: false, error: String((err && err.message) || err) })
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
