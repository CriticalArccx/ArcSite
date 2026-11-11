import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { connectGoogleTasks, disconnectGoogleTasks, getGoogleTasksStatus, syncGoogleTasks } from '../../../lib/api'
import type { GoogleTasksStatus } from '../../../lib/api'

/** While the To-Do page is open, check Google Tasks for completions this often. */
const POLL_MS = 2 * 60 * 1000

function ago(iso: string | null): string {
  if (!iso) return 'not yet'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleDateString()
}

/**
 * ARC-322: the signed-in person's Google Tasks connection, on the To-Do page. Connecting sends
 * them through Google's consent screen once; after that their To-Dos are kept in an "ArcSite"
 * list in their own Google Tasks (the google-tasks Edge Function does the syncing). While this
 * page is open it also pulls in anything completed in Google and reloads the list when it does.
 *
 * Renders nothing when nobody's signed in, or when the google-tasks function isn't deployed or
 * configured yet, so the To-Do page looks the same as before until the setup is done.
 */
export default function GoogleTasksConnect({ signedIn, onPulled }: { signedIn: boolean; onPulled: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [status, setStatus] = useState<GoogleTasksStatus | null>(null)
  const [busy, setBusy] = useState<'' | 'connect' | 'sync' | 'disconnect'>('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const onPulledRef = useRef(onPulled)
  onPulledRef.current = onPulled

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getGoogleTasksStatus())
    } catch {
      setStatus(null)
    }
  }, [])

  const sync = useCallback(
    async (manual: boolean) => {
      if (manual) setBusy('sync')
      try {
        const res = await syncGoogleTasks()
        if (res.pulled > 0) onPulledRef.current()
        if (manual) setMessage(res.myError ? { ok: false, text: res.myError } : { ok: true, text: res.pulled ? `Synced. ${res.pulled} updated from Google Tasks.` : 'Synced.' })
      } catch (e) {
        if (manual) setMessage({ ok: false, text: e instanceof Error ? e.message : 'Sync failed.' })
      } finally {
        if (manual) setBusy('')
        void refreshStatus()
      }
    },
    [refreshStatus],
  )

  // Coming back from Google's consent screen: /todo?gtasks=connected|error&reason=…
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const result = params.get('gtasks')
    if (!result) return
    setMessage(
      result === 'connected'
        ? { ok: true, text: 'Google Tasks connected. Your To-Dos are in the "ArcSite" list in Google Tasks.' }
        : { ok: false, text: params.get('reason') || 'Google Tasks could not be connected.' },
    )
    if (result === 'connected') onPulledRef.current()
    params.delete('gtasks')
    params.delete('reason')
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (signedIn) void refreshStatus()
  }, [signedIn, refreshStatus])

  const connected = Boolean(status?.connected)
  useEffect(() => {
    if (!connected) return
    void sync(false)
    const timer = setInterval(() => void sync(false), POLL_MS)
    return () => clearInterval(timer)
  }, [connected, sync])

  if (!signedIn || !status || !status.configured) return null

  async function connect() {
    setBusy('connect')
    setMessage(null)
    try {
      await connectGoogleTasks() // navigates away to Google
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not start the Google connection.' })
      setBusy('')
    }
  }

  async function disconnect() {
    setBusy('disconnect')
    try {
      await disconnectGoogleTasks()
      setMessage({ ok: true, text: 'Google Tasks disconnected, and the "ArcSite" list was removed from your Google Tasks.' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not disconnect.' })
    } finally {
      setBusy('')
      setConfirmDisconnect(false)
      void refreshStatus()
    }
  }

  return (
    <div className="gtasks">
      {!connected ? (
        <button type="button" className="wf-btn" disabled={busy !== ''} onClick={connect}>
          {busy === 'connect' ? 'Opening Google…' : 'Connect Google Tasks'}
        </button>
      ) : (
        <div className="gtasks-row">
          <span className="gtasks-label" title={status.googleEmail ?? undefined}>
            Google Tasks · synced {ago(status.lastSyncAt)}
          </span>
          <button type="button" className="wf-btn gtasks-icon-btn" disabled={busy !== ''} onClick={() => void sync(true)} aria-label="Sync with Google Tasks now" title="Sync now">
            <RefreshCw className={busy === 'sync' ? 'spin' : undefined} style={{ width: 13, height: 13 }} />
          </button>
          {confirmDisconnect ? (
            <span className="wf-confirm">
              Remove the ArcSite list from your Google Tasks?
              <button type="button" className="wf-btn" disabled={busy !== ''} onClick={disconnect}>
                {busy === 'disconnect' ? '…' : 'Disconnect'}
              </button>
              <button type="button" className="wf-btn" disabled={busy !== ''} onClick={() => setConfirmDisconnect(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="wf-btn" disabled={busy !== ''} onClick={() => setConfirmDisconnect(true)}>
              Disconnect
            </button>
          )}
        </div>
      )}
      {connected && status.lastError && !message && (
        <div className="q-hint err gtasks-msg">
          {status.lastError}{' '}
          <button type="button" className="gtasks-link" onClick={connect}>
            Reconnect
          </button>
        </div>
      )}
      {message && <div className={`q-hint ${message.ok ? 'ok' : 'err'} gtasks-msg`}>{message.text}</div>}
    </div>
  )
}
