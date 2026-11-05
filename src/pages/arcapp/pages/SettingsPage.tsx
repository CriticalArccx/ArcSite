import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import SettingsPanel from '../components/SettingsPanel'

export default function SettingsPage() {
  const ctx = useOutletContext<ShellContext>()
  return (
    <SettingsPanel
      jointPackEnabled={ctx.jointPackEnabled}
      netaTrackerEnabled={ctx.netaTrackerEnabled}
      assetAttributesEnabled={ctx.assetAttributesEnabled}
      cxAlloyLinkBaseDetected={ctx.cxAlloyLinkBaseDetected}
      cxalloyLinkBaseOverride={ctx.cxalloyLinkBaseOverride}
      googleChatWebhookUrl={ctx.googleChatWebhookUrl}
      canEdit={ctx.canEdit}
      isAdmin={ctx.isAdmin}
      canManageWorkflows={ctx.canManageWorkflows}
      loading={ctx.settingsLoading}
      onSaveSetting={ctx.onSaveSetting}
    />
  )
}
