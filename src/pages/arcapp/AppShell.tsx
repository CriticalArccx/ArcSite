import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../../lib/useCurrentUser'
import { CURRENT_PROJECT, projectLabel } from '../../lib/project'
import {
  useGetSchedule, useGetResultOptions, useSaveResult, useLogTamperSeals, useSubmitRtft,
  useGetSettings, useSaveSetting, useSaveDefaultAssignee, useGetWorkflows, useGetWorkflowItems, useGetCxAlloyLinkBase, parseCxAlloyLinkBase,
  useGetTasks, useSaveTask, useSetTaskDone, useSetTaskStatus, useDeleteTask, useGetTeams, useSaveTeam, useDeleteTeam,
} from '../../lib/api'
import type { TaskInput, DefaultAssignee, MilestoneStatusStyles } from '../../lib/api'
import { DEFAULT_MILESTONE_STATUS_STYLES } from '../../lib/api'
import type { WorkflowItem } from './workflowItems'
import type { ShellContext } from './ShellContext'
import type { ScheduleRow, ScheduleState, ActivityAnswer, Todo, Team, TeamMember, TaskStatus } from './types'
import { localIsoDate, addDaysIso } from './utils'
import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'
import ContextStrip from './components/ContextStrip'
import ActivityDrawer from './components/ActivityDrawer'
import SignInPage from './components/SignInPage'
import { useOpenItemsData } from './components/OpenItemsTodoPanel'
import type { SealPayloadRow } from './components/TamperSealSection'
import type { RtftPayload } from './components/RtftSection'

const SOURCE_LABEL = `${CURRENT_PROJECT}BackEndData`

/**
 * The persistent app shell: sidebar navigation + everything every routed page might need,
 * fetched/held once here and handed down via <Outlet context>. Replaces the old single-page
 * Dashboard — each nav item that used to scroll to a section on one long page now routes to its
 * own page (see App.tsx), with this shell providing the surrounding chrome (topbar, sidebar,
 * footer) and the Activity Drawer, which can be opened from more than one page.
 */
export default function AppShell() {
  const { user, loading: userLoading, authError, signInWithGoogle, signInWithEmail, signOut, clearAuthError } = useCurrentUser()
  const location = useLocation()
  // The tracker is a wide, data-dense grid — it gets the whole page (no 1200px content cap, no
  // card chrome, no footer) instead of living in the standard boxed-panel content column every
  // other page uses.
  const isFullBleed = location.pathname.startsWith('/equipmenttracker')

  const scheduleFn = useGetSchedule()
  const optionsFn = useGetResultOptions()
  const saveResultFn = useSaveResult()
  const logSealsFn = useLogTamperSeals()
  const submitRtftFn = useSubmitRtft()
  const settingsFn = useGetSettings()
  const saveSettingFn = useSaveSetting()
  const saveDefaultAssigneeFn = useSaveDefaultAssignee()
  const cxAlloyLinkBaseFn = useGetCxAlloyLinkBase()
  const workflowsFn = useGetWorkflows()
  const workflowItemsFn = useGetWorkflowItems()
  const tasksFn = useGetTasks()
  const saveTaskFn = useSaveTask()
  const setTaskDoneFn = useSetTaskDone()
  const setTaskStatusFn = useSetTaskStatus()
  const deleteTaskFn = useDeleteTask()
  const teamsFn = useGetTeams()
  const saveTeamFn = useSaveTeam()
  const deleteTeamFn = useDeleteTeam()

  const [selectedDate, setSelectedDate] = useState<string>(localIsoDate())
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [todos, setTodos] = useState<Todo[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(null)
  const [answers, setAnswers] = useState<Record<string, ActivityAnswer>>({})

  // Load schedule whenever the selected day changes — gated on being signed in (see the
  // `!user` early return near the bottom of this component) so nothing fetches at all before
  // that, not just before it's shown.
  useEffect(() => {
    if (!user) return
    setSelectedRowId(null)
    void scheduleFn.trigger({ date: selectedDate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, !!user])

  // Sync local rows from the fetched data.
  useEffect(() => {
    if (scheduleFn.data) {
      setRows(scheduleFn.data as ScheduleRow[])
      setLastSync(new Date().toLocaleTimeString())
    }
  }, [scheduleFn.data])

  // Load result options + settings once sign-in resolves (this used to fire unconditionally on
  // mount — now it waits for `user`, so a signed-out/not-yet-authorized visitor triggers zero
  // Supabase queries, not just zero visible UI).
  useEffect(() => {
    if (!user) return
    void optionsFn.trigger()
    void settingsFn.trigger()
    void cxAlloyLinkBaseFn.trigger()
    void workflowsFn.trigger()
    void workflowItemsFn.trigger()
    void tasksFn.trigger()
    void teamsFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user])

  useEffect(() => {
    if (tasksFn.data) setTodos(tasksFn.data as Todo[])
  }, [tasksFn.data])
  useEffect(() => {
    if (teamsFn.data) setTeams(teamsFn.data as Team[])
  }, [teamsFn.data])

  const scheduleState: ScheduleState = scheduleFn.error
    ? 'error'
    : scheduleFn.loading || !scheduleFn.data
      ? 'loading'
      : 'ready'

  const resultOptions = (optionsFn.data as string[] | undefined) ?? []
  // As of 2026-09-24: the whole site requires a signed-in, authorized (arcapp_authorized_users)
  // user — see the `!user` gate near the bottom of this component — so `canEdit` no longer needs
  // its own separate authorization check the way it did when the app was browsable while signed
  // out. It's just "is anyone signed in at all" now (admin or editor); `isAdmin` is the narrower
  // gate Settings actually uses. Deliberately ArcApp's own role (arcapp_authorized_users.role),
  // not LaunchPad's shared STY4authorized_editors — see src/lib/useCurrentUser.ts.
  const canEdit = !!user
  const isAdmin = user?.role === 'admin'
  const canManageWorkflows = canEdit

  const workflows = (workflowsFn.data as Array<{ id: string; activities: string[]; items: string[] }> | undefined) ?? []
  const workflowItems = (workflowItemsFn.data as WorkflowItem[] | undefined) ?? []

  const settingsData = settingsFn.data as
    | {
        jointPackPhotosFolder?: string
        jointPackEnabled?: boolean
        jointPackScriptUrl?: string
        netaTrackerEnabled?: boolean
        netaTrackerScriptUrl?: string
        assetAttributesEnabled?: boolean
        checklistReadyStatuses?: string[]
        issueReviewStatuses?: string[]
        issueCreatorCompanyFilter?: string
        submittalExemptAssets?: string[]
        checklistTodoEnabled?: boolean
        issueTodoEnabled?: boolean
        netaSubmissionsTodoEnabled?: boolean
        netaReturnedTodoEnabled?: boolean
        checklistDefaultAssignee?: DefaultAssignee
        issueDefaultAssignee?: DefaultAssignee
        netaSubmissionsDefaultAssignee?: DefaultAssignee
        netaReturnedDefaultAssignee?: DefaultAssignee
        cxalloyLinkBaseOverride?: string
        milestoneCompleteThreshold?: number
        milestoneGoThreshold?: number
        milestoneCautionThreshold?: number
        milestoneStatusStyles?: MilestoneStatusStyles
        equipmentTrackerScriptUrl?: string
      }
    | undefined
  const jointPackFolder = settingsData?.jointPackPhotosFolder ?? ''
  const jointPackEnabled = settingsData?.jointPackEnabled ?? false
  const jointPackScriptUrl = settingsData?.jointPackScriptUrl ?? ''
  const netaTrackerEnabled = settingsData?.netaTrackerEnabled ?? false
  const netaTrackerScriptUrl = settingsData?.netaTrackerScriptUrl ?? ''
  const assetAttributesEnabled = settingsData?.assetAttributesEnabled ?? false
  const checklistReadyStatuses = settingsData?.checklistReadyStatuses ?? []
  const issueReviewStatuses = settingsData?.issueReviewStatuses ?? []
  const issueCreatorCompanyFilter = settingsData?.issueCreatorCompanyFilter ?? ''
  const submittalExemptAssets = settingsData?.submittalExemptAssets ?? []
  const checklistTodoEnabled = settingsData?.checklistTodoEnabled ?? false
  const issueTodoEnabled = settingsData?.issueTodoEnabled ?? false
  const netaSubmissionsTodoEnabled = settingsData?.netaSubmissionsTodoEnabled ?? false
  const netaReturnedTodoEnabled = settingsData?.netaReturnedTodoEnabled ?? false
  const checklistDefaultAssignee = settingsData?.checklistDefaultAssignee ?? { teamId: null, email: null, name: null }
  const issueDefaultAssignee = settingsData?.issueDefaultAssignee ?? { teamId: null, email: null, name: null }
  const netaSubmissionsDefaultAssignee = settingsData?.netaSubmissionsDefaultAssignee ?? { teamId: null, email: null, name: null }
  const netaReturnedDefaultAssignee = settingsData?.netaReturnedDefaultAssignee ?? { teamId: null, email: null, name: null }
  const cxalloyLinkBaseOverride = settingsData?.cxalloyLinkBaseOverride ?? ''
  const milestoneCompleteThreshold = settingsData?.milestoneCompleteThreshold ?? 100
  const milestoneGoThreshold = settingsData?.milestoneGoThreshold ?? 70
  const milestoneCautionThreshold = settingsData?.milestoneCautionThreshold ?? 40
  const milestoneStatusStyles = settingsData?.milestoneStatusStyles ?? DEFAULT_MILESTONE_STATUS_STYLES
  const equipmentTrackerScriptUrl = settingsData?.equipmentTrackerScriptUrl ?? ''
  const cxAlloyLinkBaseDetected = (cxAlloyLinkBaseFn.data as { domain: string; projectId: string } | null | undefined) ?? null
  // A manual Settings override always wins over auto-detection — see getCxAlloyLinkBase in
  // api.ts for why auto-detection alone can come back null (no Equipment Tracker data synced yet
  // for this project) or, in principle, find the wrong thing.
  const cxAlloyLinkBase = parseCxAlloyLinkBase(cxalloyLinkBaseOverride) ?? cxAlloyLinkBaseDetected
  const currentUserEmail = user?.email ?? null

  // Fetched once here rather than lazily inside TodoPage, so Checklist/Issue/NETA To-Do markers —
  // both the "My Tasks" rows and the Settings-driven summary cards — are already loaded by the
  // time someone opens the To-Do page or Dashboard, instead of only starting once the To-Do page
  // itself mounts. `&& !!user` on each enabled flag keeps this from firing before sign-in resolves
  // (AppShell's hooks all run before the `!user` gate below, same as every other fetch here).
  const openItems = useOpenItemsData({
    checklistTodoEnabled: checklistTodoEnabled && !!user,
    issueTodoEnabled: issueTodoEnabled && !!user,
    netaTrackerEnabled,
    netaSubmissionsTodoEnabled: netaSubmissionsTodoEnabled && !!user,
    netaReturnedTodoEnabled: netaReturnedTodoEnabled && !!user,
    checklistDefaultAssignee,
    issueDefaultAssignee,
    netaSubmissionsDefaultAssignee,
    netaReturnedDefaultAssignee,
    teams,
    currentUserEmail,
    cxAlloyLinkBase,
  })

  const userName = user?.name ?? null
  const initials = user
    ? (() => {
        const parts = user.name.trim().split(/\s+/).filter(Boolean)
        const fromName = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) ?? ''
        return (fromName || user.email.slice(0, 2)).toUpperCase()
      })()
    : '?'

  function goToDate(iso: string) {
    setSelectedDate(iso)
  }

  // The topbar this belongs to only renders once `user` is truthy (see the `!user` gate below),
  // so this is only ever reachable as "sign out" now — there's no app behind SignInPage left to
  // click a "sign in" trigger from.
  function handleAuthClick() {
    void signOut()
  }

  function handleRefresh() {
    setRefreshing(true)
    Promise.resolve(scheduleFn.trigger({ date: selectedDate }).result)
      .catch(() => {})
      .finally(() => setTimeout(() => setRefreshing(false), 400))
  }

  async function toggleTodo(id: string) {
    const current = todos.find((t) => t.id === id)
    if (!current) return
    const done = !current.done
    await setTaskDoneFn.trigger({ id, done }).result
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done, status: done ? 'done' : 'todo', completedAt: done ? new Date().toISOString() : null } : t)),
    )
  }

  async function moveTaskStatus(id: string, status: TaskStatus) {
    await setTaskStatusFn.trigger({ id, status }).result
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status, done: status === 'done', completedAt: status === 'done' ? new Date().toISOString() : null } : t)),
    )
  }

  const saveTaskRecord = useCallback(
    async (input: TaskInput) => {
      await saveTaskFn.trigger(input).result
      void tasksFn.trigger()
    },
    [saveTaskFn, tasksFn],
  )
  const deleteTaskRecord = useCallback(
    async (id: string) => {
      await deleteTaskFn.trigger({ id }).result
      setTodos((prev) => prev.filter((t) => t.id !== id))
    },
    [deleteTaskFn],
  )

  const saveTeamRecord = useCallback(
    async (input: { id?: string; name: string; members: TeamMember[] }) => {
      await saveTeamFn.trigger(input).result
      void teamsFn.trigger()
    },
    [saveTeamFn, teamsFn],
  )
  const deleteTeamRecord = useCallback(
    async (id: string) => {
      await deleteTeamFn.trigger({ id }).result
      setTeams((prev) => prev.filter((t) => t.id !== id))
      // A deleted team's tasks fall back to unassigned server-side (ON DELETE SET NULL) — refetch
      // so the task list reflects that instead of still showing the removed team.
      void tasksFn.trigger()
    },
    [deleteTeamFn, tasksFn],
  )

  const selectedRow = rows.find((r) => String(r.id) === String(selectedRowId)) ?? null

  function handleAnswerChange(rowId: string | number, answer: ActivityAnswer) {
    setAnswers((prev) => ({ ...prev, [String(rowId)]: answer }))
  }

  const saveResult = useCallback(
    async (id: string | number, value: string) => {
      await saveResultFn.trigger({ id, result: value }).result
      setRows((prev) => prev.map((r) => (String(r.id) === String(id) ? { ...r, result: value || '—' } : r)))
    },
    [saveResultFn],
  )

  // Tamper seals log to STY4Assets; RTFT stores to STY4RTFT (signoff stamped server-side).
  const saveSeals = useCallback(
    async (rows: SealPayloadRow[]) => {
      await logSealsFn.trigger({ rows }).result
    },
    [logSealsFn],
  )
  const submitRTFT = useCallback(
    async (payload: RtftPayload) => {
      await submitRtftFn.trigger(payload).result
    },
    [submitRtftFn],
  )

  const openPhotos = useCallback((row: ScheduleRow) => {
    // eslint-disable-next-line no-console
    console.info('Log photos requested for', row.activity, '·', row.asset, '·', row.date)
  }, [])

  const saveSetting = useCallback(
    async (key: string, value: string) => {
      await saveSettingFn.trigger({ key, value }).result
      void settingsFn.trigger()
    },
    [saveSettingFn, settingsFn],
  )

  const saveDefaultAssignee = useCallback(
    async (prefix: string, result: DefaultAssignee) => {
      await saveDefaultAssigneeFn.trigger({ prefix, ...result }).result
      void settingsFn.trigger()
    },
    [saveDefaultAssigneeFn, settingsFn],
  )

  const answeredIds = new Set<string | number>(
    Object.keys(answers).map((k) => {
      const match = rows.find((r) => String(r.id) === k)
      return match ? match.id : k
    }),
  )

  const currentAnswer: ActivityAnswer = selectedRow
    ? answers[String(selectedRow.id)] ?? { offsetHrs: 0, caCount: 1 }
    : { offsetHrs: 0, caCount: 1 }

  const outletContext: ShellContext = {
    todos,
    onToggleTodo: toggleTodo,
    onMoveTaskStatus: moveTaskStatus,
    tasksLoading: tasksFn.loading || !tasksFn.data,
    tasksError: tasksFn.error ?? '',
    onSaveTask: saveTaskRecord,
    onDeleteTask: deleteTaskRecord,

    teams,
    teamsLoading: teamsFn.loading || !teamsFn.data,
    teamsError: teamsFn.error ?? '',
    onSaveTeam: saveTeamRecord,
    onDeleteTeam: deleteTeamRecord,

    currentUserEmail,

    scheduleState,
    rows,
    scheduleError: scheduleFn.error ?? '',
    selectedDate,
    lastSync,
    refreshing,
    selectedRowId,
    answeredIds,
    onPrevDay: () => goToDate(addDaysIso(selectedDate, -1)),
    onNextDay: () => goToDate(addDaysIso(selectedDate, 1)),
    onToday: () => goToDate(localIsoDate()),
    onPickDate: goToDate,
    onRefresh: handleRefresh,
    onRowClick: (r) => setSelectedRowId(r.id),
    onScheduleRetry: () => void scheduleFn.trigger({ date: selectedDate }),

    jointPackFolder,
    jointPackEnabled,
    jointPackScriptUrl,
    netaTrackerEnabled,
    netaTrackerScriptUrl,
    assetAttributesEnabled,

    canEdit,
    isAdmin,
    canManageWorkflows,

    checklistReadyStatuses,
    issueReviewStatuses,
    issueCreatorCompanyFilter,
    submittalExemptAssets,
    checklistTodoEnabled,
    issueTodoEnabled,
    netaSubmissionsTodoEnabled,
    netaReturnedTodoEnabled,
    checklistDefaultAssignee,
    issueDefaultAssignee,
    netaSubmissionsDefaultAssignee,
    netaReturnedDefaultAssignee,
    cxAlloyLinkBase,
    cxAlloyLinkBaseDetected,
    cxalloyLinkBaseOverride,
    milestoneCompleteThreshold,
    milestoneGoThreshold,
    milestoneCautionThreshold,
    milestoneStatusStyles,
    equipmentTrackerScriptUrl,
    settingsLoading: settingsFn.loading,
    onSaveSetting: saveSetting,
    onSaveDefaultAssignee: saveDefaultAssignee,
    openItems,
  }

  // Hard gate: nothing else in this component renders until there's a real, authorized session.
  // Every hook above this point still runs on every render regardless (rules-of-hooks requires
  // that) — this only decides what JSX comes out the other end, and now that the fetch effects
  // above are themselves gated on `!!user`, no data request goes out before this point either.
  if (!user) {
    return (
      <SignInPage
        loading={userLoading}
        authError={authError}
        onGoogle={signInWithGoogle}
        onEmail={signInWithEmail}
        onClearError={clearAuthError}
      />
    )
  }

  return (
    <div className="arcapp">
      <div className="starfield" />

      <Topbar userName={userName} userInitials={initials} allowedProjects={user.allowedProjects} onAuthClick={handleAuthClick} />
      <ContextStrip />

      <div className="arcapp-layout">
        <Sidebar jointPackEnabled={jointPackEnabled} assetAttributesEnabled={assetAttributesEnabled} netaTrackerEnabled={netaTrackerEnabled} />

        <main className={isFullBleed ? 'main-full' : undefined}>
          <Outlet context={outletContext} />

          {!isFullBleed && (
            <footer>
              ArcApp Commissioning · {projectLabel(CURRENT_PROJECT)} · Deliverables are computed live
              from their completion criteria, To-Dos read live from arcapp_tasks, and Scheduled
              Activities from {SOURCE_LABEL}
            </footer>
          )}
        </main>
      </div>

      {selectedRow && (
        <ActivityDrawer
          row={selectedRow}
          authUser={user?.email ?? null}
          resultOptions={resultOptions}
          selectedDate={selectedDate}
          answer={currentAnswer}
          workflows={workflows}
          workflowItems={workflowItems}
          onAnswerChange={handleAnswerChange}
          onClose={() => setSelectedRowId(null)}
          onSaveResult={saveResult}
          onSaveSeals={saveSeals}
          onSubmitRTFT={submitRTFT}
          onOpenPhotos={openPhotos}
        />
      )}
    </div>
  )
}
