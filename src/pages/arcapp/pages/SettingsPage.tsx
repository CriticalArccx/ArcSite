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
      showTodo={ctx.showTodo}
      showMilestones={ctx.showMilestones}
      showSchedule={ctx.showSchedule}
      showChecklists={ctx.showChecklists}
      showIssues={ctx.showIssues}
      showSubmittals={ctx.showSubmittals}
      showLessonsLearned={ctx.showLessonsLearned}
      showTamperSeals={ctx.showTamperSeals}
      showRtft={ctx.showRtft}
      showEquipmentTracker={ctx.showEquipmentTracker}
      canEdit={ctx.canEdit}
      isAdmin={ctx.isAdmin}
      canManageWorkflows={ctx.canManageWorkflows}
      loading={ctx.settingsLoading}
      onSaveSetting={ctx.onSaveSetting}
    />
  )
}
