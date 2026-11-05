import { useState } from 'react'
import { Send } from 'lucide-react'
import WorkflowsBuilder from './WorkflowsBuilder'
import AuthorizedUsersManager from './AuthorizedUsersManager'
import { Field, ToggleField } from './SettingsControls'
import { useSendChatTestMessage } from '../../../lib/api'

type Props = {
  jointPackEnabled: boolean
  netaTrackerEnabled: boolean
  assetAttributesEnabled: boolean
  cxAlloyLinkBaseDetected: { domain: string; projectId: string } | null
  cxalloyLinkBaseOverride: string
  googleChatWebhookUrl: string
  /** Broader than isAdmin — any signed-in, authorized ArcApp user. Only used here for Workflows
   * (item catalog + building workflows), which isn't admin-restricted. */
  canEdit: boolean
  /** From arcapp_authorized_users.role === 'admin' — every other field on this page requires this,
   * not just canEdit. Settings is specifically an admin-only page; editors can see it (so they
   * know what's configured) but every control is disabled for them. */
  isAdmin: boolean
  /** Separate, looser gate for Workflows specifically — see Dashboard.tsx for why. */
  canManageWorkflows: boolean
  loading: boolean
  onSaveSetting: (key: string, value: string) => Promise<void>
}

/**
 * As of 2026-10-26, this is deliberately NOT the home for most settings anymore — each module
 * (Checklists, Issues, Joint Packs, NETA Tracker, Submittals) has its own collapsed-by-default
 * "Settings" section on its own page now (ModuleSettingsSection.tsx), configuring just that
 * module. What's left here is specifically what doesn't belong to one module:
 *
 *  - CxAlloy project override — used by both Checklist and Issue deep links (and Equipment
 *    Tracker auto-detection), not any one of them.
 *  - Each module's own enable/disable toggle (Joint Pack Photos / Asset Attributes / NETA
 *    Tracker) — has to live here rather than on the module's own page, since that page (and its
 *    Sidebar nav item) doesn't exist to show the toggle on while it's off. Everything else about
 *    those modules (script URLs, folder IDs, To-Do settings) moved to their own pages, since
 *    those only matter once you can already reach the page.
 *  - Workflows — has no page of its own to live on.
 *  - Authorized Users — app-wide access control, not a module.
 */
export default function SettingsPanel({
  jointPackEnabled,
  netaTrackerEnabled,
  assetAttributesEnabled,
  cxAlloyLinkBaseDetected,
  cxalloyLinkBaseOverride,
  googleChatWebhookUrl,
  canEdit,
  isAdmin,
  canManageWorkflows,
  loading,
  onSaveSetting,
}: Props) {
  return (
    <section className="panel" id="settings">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Settings</h2>
          <span className="panel-count">app-wide</span>
        </div>
      </div>
      {!isAdmin && (
        <div className="q-hint" style={{ padding: '0 20px 12px' }}>
          You can see how this project is configured, but only an admin can change it.
        </div>
      )}
      <div className="panel-body">
        <div className="q-hint" style={{ marginBottom: 16, maxWidth: 560 }}>
          Most settings now live on the page they configure — look for a &quot;Settings&quot;
          button on Checklists, Issues, Joint Packs, NETA Tracker, and Submittals. What&apos;s here
          is either used by more than one page, or controls whether a page/module exists at all.
        </div>
        <Field
          label="CxAlloy project override — domain/project id"
          hint={
            `Format: domain/projectId, e.g. google.cxalloy.com/70. Checklist/Issue deep links use this ` +
            `to build their URL. Auto-detected from this project's Equipment Tracker data by default ` +
            (cxAlloyLinkBaseDetected
              ? `(currently detected: ${cxAlloyLinkBaseDetected.domain}/${cxAlloyLinkBaseDetected.projectId}) — leave blank to keep using that.`
              : `— nothing detected yet for this project (no Equipment Tracker data synced, or none of it has a link field). Set this manually until it does.`)
          }
          initial={cxalloyLinkBaseOverride}
          canEdit={isAdmin}
          loading={loading}
          onSave={(v) => onSaveSetting('cxalloy_link_base_override', v)}
        />
        <ToggleField
          label="Joint Pack Photos enabled for this project"
          hint="Turns on the Joint Packs page and its Sidebar nav item. Requires this project's own Joint Pack Sheet + Apps Script to already be deployed (see README) — turning this on before that's ready shows a clean 'not wired up yet' error instead of breaking anything. The rest of Joint Pack Photos' settings (script URL, Drive folder) are on the Joint Packs page itself once this is on."
          initial={jointPackEnabled}
          canEdit={isAdmin}
          loading={loading}
          onSave={(v) => onSaveSetting('joint_pack_enabled', v ? 'true' : '')}
        />
        <ToggleField
          label="Asset Attributes enabled for this project"
          hint="Turns on the Asset Attributes page and its Sidebar nav item. Separate from Checklists/Issues — these are pre-existing LaunchPad actions on this project's shared Apps Script, so this can work even where Checklists/Issues can't yet, or vice versa."
          initial={assetAttributesEnabled}
          canEdit={isAdmin}
          loading={loading}
          onSave={(v) => onSaveSetting('asset_attributes_enabled', v ? 'true' : '')}
        />
        <ToggleField
          label="NETA Tracker enabled for this project"
          hint="Turns on the NETA Tracker page and its Sidebar nav item. Requires this project's own NETA Sheet + Apps Script to already be deployed (see README) — turning this on before that's ready shows a clean 'not wired up yet' error instead of breaking anything. The rest of NETA Tracker's settings (script URL, To-Do) are on the NETA Tracker page itself once this is on."
          initial={netaTrackerEnabled}
          canEdit={isAdmin}
          loading={loading}
          onSave={(v) => onSaveSetting('neta_tracker_enabled', v ? 'true' : '')}
        />
        <Field
          label="Google Chat webhook URL"
          hint={
            'Posts a message here whenever a critical to-do or a new lesson learned is logged. In the target ' +
            'Google Chat space: Apps & integrations → Webhooks → Add webhook, then paste the URL it gives you. ' +
            "Leave blank to turn Chat notifications off for this project. The interactive bot (type \"/status\", " +
            '"/todo", or "/lesson" to it) is a separate setup — see the Google Chat section of README.md.'
          }
          initial={googleChatWebhookUrl}
          canEdit={isAdmin}
          loading={loading}
          onSave={(v) => onSaveSetting('google_chat_webhook_url', v)}
        />
        {isAdmin && googleChatWebhookUrl && <ChatTestButton />}

        <WorkflowsBuilder canEdit={canManageWorkflows} canEditItems={canEdit} />

        <AuthorizedUsersManager canEdit={isAdmin} />
      </div>
    </section>
  )
}

/** Separate from the Field above so it can show its own send-in-flight / success / failure state
 * without that state getting wiped by Field's own `initial` effect on every settings refetch. */
function ChatTestButton() {
  const sendTestFn = useSendChatTestMessage()
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })

  async function send() {
    setMsg({ text: 'Sending…', cls: 'q-hint' })
    try {
      await sendTestFn.trigger().result
      setMsg({ text: 'Sent — check the Google Chat space.', cls: 'q-hint ok' })
    } catch (err) {
      setMsg({ text: 'Failed: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    }
  }

  return (
    <div style={{ marginBottom: 22, maxWidth: 560 }}>
      <button
        className="seal-submit-btn"
        type="button"
        style={{ maxWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        disabled={sendTestFn.loading}
        onClick={send}
      >
        <Send style={{ width: 15, height: 15 }} />
        Send test message
      </button>
      {msg.text && <div className={msg.cls}>{msg.text}</div>}
    </div>
  )
}
