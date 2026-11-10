import type { ScheduleRow, ScheduleState, Team, TeamMember, Todo, TaskStatus } from './types'
import type { CxAlloyLinkBase, DefaultAssignee, TaskInput, MilestoneStatusStyles } from '../../lib/api'
import type { OpenItemsData } from './components/OpenItemsTodoPanel'

/**
 * Passed down via react-router's <Outlet context={...}> from AppShell to whichever page is
 * currently routed. Only the pages that actually need shared/live state pull from this
 * (useOutletContext<ShellContext>()) — the fully self-contained panels (Checklists, Issues,
 * Tamper Seals log, RTFT tracker) fetch their own data and don't need it at all.
 */
export type ShellContext = {
  todos: Todo[]
  onToggleTodo: (id: string) => void
  /** Kanban board's per-card move buttons (added 2026-10-30) — a 3-way version of onToggleTodo,
   * see setTaskStatus in src/lib/api.ts. */
  onMoveTaskStatus: (id: string, status: TaskStatus) => Promise<void>
  tasksLoading: boolean
  tasksError: string
  onSaveTask: (input: TaskInput) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>

  teams: Team[]
  teamsLoading: boolean
  teamsError: string
  onSaveTeam: (input: { id?: string; name: string; members: TeamMember[] }) => Promise<void>
  onDeleteTeam: (id: string) => Promise<void>

  /** For "assigned to me" — null when nobody's signed in (task/team browsing still works). */
  currentUserEmail: string | null

  scheduleState: ScheduleState
  rows: ScheduleRow[]
  scheduleError: string
  selectedDate: string
  lastSync: string | null
  refreshing: boolean
  selectedRowId: string | number | null
  answeredIds: Set<string | number>
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onPickDate: (iso: string) => void
  onRefresh: () => void
  onRowClick: (row: ScheduleRow) => void
  onScheduleRetry: () => void

  /** Google Drive folder ID photos upload into — see JointPackPhotosPanel, which fetches/logs
   * Joint Pack data itself (this is the only piece of it that lives on shared shell state). */
  jointPackFolder: string
  /** Per-project on/off switch for the whole Joint Pack Photos module — see AppSettings in
   * api.ts. Drives the Sidebar nav item and the page itself, same pattern as netaTrackerEnabled. */
  jointPackEnabled: boolean
  /** Per-project on/off switch for Asset Attributes — see AppSettings in api.ts. Drives the
   * Sidebar nav item and the page itself; deliberately independent of `cxAlloyActions`. */
  assetAttributesEnabled: boolean

  /** Any signed-in, authorized ArcSite user (admin or editor) — governs Submittals, Asset
   * Attributes, Workflow item catalog, etc. Settings specifically requires `isAdmin` instead. */
  canEdit: boolean
  /** From arcapp_authorized_users.role === 'admin' — the only role that can change Settings
   * (including managing the authorized-users list itself). See src/lib/useCurrentUser.ts. */
  isAdmin: boolean
  canManageWorkflows: boolean

  /** Per-project on/off switch for the whole NETA Tracker module — see AppSettings in api.ts.
   * Drives the Sidebar nav item, the page itself, its Settings section, and its To-Do
   * integration, replacing what used to be a project.ts capability constant. */
  netaTrackerEnabled: boolean
  /** Apps Script Web App URLs, editable from Settings — only read there (as a Field's `initial`),
   * not used elsewhere in the app (every actual request goes through api.ts, which reads these
   * straight from Supabase itself rather than being passed them). */
  jointPackScriptUrl: string
  netaTrackerScriptUrl: string
  checklistReadyStatuses: string[]
  issueReviewStatuses: string[]
  /** See AppSettings in api.ts — only read in Settings (as a Field's `initial`); the actual
   * filtering happens inside getIssues/getOpenIssues, not here. */
  issueCreatorCompanyFilter: string
  submittalExemptAssets: string[]
  checklistTodoEnabled: boolean
  issueTodoEnabled: boolean
  netaSubmissionsTodoEnabled: boolean
  netaReturnedTodoEnabled: boolean
  /** Default assignee per To-Do category — see AppSettings in api.ts for the summary-card
   * behavior this drives. Blank (all-null) when no default is set for that category. */
  checklistDefaultAssignee: DefaultAssignee
  issueDefaultAssignee: DefaultAssignee
  netaSubmissionsDefaultAssignee: DefaultAssignee
  netaReturnedDefaultAssignee: DefaultAssignee
  /** Effective CxAlloy domain+project id for building checklist/issue deep links — the Settings
   * override if one's set, else whatever was auto-detected from this project's Equipment Tracker
   * data. Null while still loading, or if neither is available yet (checklist/issue rows without
   * their own link just render as plain text in that case, not a broken link). */
  cxAlloyLinkBase: CxAlloyLinkBase | null
  /** What auto-detection actually found, regardless of whether an override is also set — shown in
   * Settings next to the override field so it's visible without opening dev tools. */
  cxAlloyLinkBaseDetected: CxAlloyLinkBase | null
  cxalloyLinkBaseOverride: string
  /** Milestone pct → status thresholds, editable from the Milestones page's own Settings drawer —
   * see computeMilestoneProgress in src/pages/arcapp/milestones.ts, the only thing that reads
   * these. Defaults (100/70/40) match what shipped before they were configurable. */
  milestoneCompleteThreshold: number
  milestoneGoThreshold: number
  milestoneCautionThreshold: number
  /** Per-status label text + color (Milestones page's own Settings drawer) — see
   * computeMilestoneProgress in src/pages/arcapp/milestones.ts, the only thing that reads these. */
  milestoneStatusStyles: MilestoneStatusStyles
  /** This project's own dedicated Equipment Tracker Apps Script URL — see saveEquipmentTrackerSettings
   * in api.ts for why Phase Rules specifically need it (Supabase alone isn't enough for them). */
  equipmentTrackerScriptUrl: string
  /** This project's Google Chat incoming webhook URL (Settings → "Google Chat") — see
   * notifyGoogleChat in api.ts for who posts to it and the README's Google Chat section for setup. */
  googleChatWebhookUrl: string
  /** Sidebar tab visibility toggles (Settings → "Sidebar tabs") — see AppSettings in api.ts for
   * why these default to visible rather than hidden. Sidebar.tsx is the only thing that reads these. */
  showTodo: boolean
  showMilestones: boolean
  showSchedule: boolean
  showChecklists: boolean
  showIssues: boolean
  showSubmittals: boolean
  showLessonsLearned: boolean
  showTamperSeals: boolean
  showRtft: boolean
  showEquipmentTracker: boolean
  settingsLoading: boolean
  onSaveSetting: (key: string, value: string) => Promise<void>
  onSaveDefaultAssignee: (prefix: string, result: DefaultAssignee) => Promise<void>

  /** Checklist/Issue/NETA "My Tasks" rows + default-assignee summary cards — fetched once at
   * sign-in (see useOpenItemsData in AppShell.tsx) rather than lazily when the To-Do page mounts,
   * so the Dashboard's "Your To-Dos" widget and the To-Do page's "My Tasks" tab read from the same
   * already-warm data instead of each triggering their own fetch. */
  openItems: OpenItemsData
}
