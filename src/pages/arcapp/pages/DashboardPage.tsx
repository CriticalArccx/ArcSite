import { useNavigate, useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import { useMilestonesWithProgress } from '../milestones'
import { isTodoMine, fmtDate } from '../utils'
import { CURRENT_PROJECT, projectLabel } from '../../../lib/project'
import KpiRow from '../components/KpiRow'
import TodoPanel from '../components/TodoPanel'
import { MyItemRow, MySummaryCard, todoSummaryRoute } from '../components/OpenItemsTodoPanel'
import MilestonesPanel from '../components/MilestonesPanel'
import SchedulePanel from '../components/SchedulePanel'

const SOURCE_LABEL = `${CURRENT_PROJECT}BackEndData`

/** The landing page — an at-a-glance overview. Each widget's "expand" now navigates to that
 * section's own full page (via the sidebar) instead of opening an in-page overlay. */
export default function DashboardPage() {
  const ctx = useOutletContext<ShellContext>()
  const navigate = useNavigate()

  // Milestones used to be hardcoded sample data here — now the same live, criteria-driven
  // progress the Milestones page itself computes (see useMilestonesWithProgress), so the two never
  // disagree about what's actually complete. Same configured status thresholds too, not the
  // function's hardcoded fallback, so a status shown here always matches the Milestones page.
  const { computed: milestoneRows } = useMilestonesWithProgress(
    { neta: ctx.netaTrackerEnabled, jointPack: ctx.jointPackEnabled },
    { complete: ctx.milestoneCompleteThreshold, go: ctx.milestoneGoThreshold, caution: ctx.milestoneCautionThreshold },
    ctx.milestoneStatusStyles,
  )
  const dashboardMilestones = milestoneRows.map((m) => ({
    name: m.name,
    pct: m.progress.pct,
    due: m.dueDate ? fmtDate(m.dueDate) : 'No due date',
    status: m.progress.status,
    label: m.progress.label,
    color: m.progress.color,
  }))

  // "Your To-Dos" personalizes once someone's signed in (mine + my teams'); falls back to every
  // open task when signed out, same as before this widget could know who "you" are.
  const myTodos = ctx.currentUserEmail
    ? ctx.todos.filter((t) => isTodoMine(t, ctx.currentUserEmail, ctx.teams))
    : ctx.todos

  // Checklist/Issue/NETA markers (individual "assigned to you" rows + Settings' default-assignee
  // summary cards) — same data the To-Do page shows, read from the shared fetch in AppShell.tsx
  // (ctx.openItems) so it's already loaded here without a second trip to CxAlloy/NETA. Clicking a
  // summary card navigates straight to that category's own page (Checklists/Issues/NETA Tracker).
  const { myItems, mySummaries, onAssign } = ctx.openItems
  const dashboardExtraRows =
    myItems.length > 0 || mySummaries.length > 0 ? (
      <div className="oi-rows" style={{ marginBottom: myTodos.length > 0 ? 14 : 0 }}>
        {mySummaries.map((entry) => (
          <MySummaryCard key={entry.itemType} entry={entry} onView={(itemType) => navigate(todoSummaryRoute(itemType))} />
        ))}
        {myItems.map((entry) => (
          <MyItemRow key={`${entry.itemType}:${entry.item.id}`} entry={entry} teams={ctx.teams} onAssign={onAssign} />
        ))}
      </div>
    ) : null

  return (
    <>
      <div className="page-heading">
        <h1>Mission Dashboard</h1>
        <p>Your checklist, deliverables, and live activity feed for {projectLabel(CURRENT_PROJECT)}.</p>
      </div>

      <KpiRow milestones={milestoneRows} todos={myTodos} extraOpenCount={myItems.length + mySummaries.length} scheduleRows={ctx.rows} />

      <div className="dash-grid">
        <TodoPanel
          todos={myTodos}
          onToggle={ctx.onToggleTodo}
          onExpand={() => navigate('/todo')}
          extraRows={dashboardExtraRows}
          extraOpenCount={myItems.length + mySummaries.length}
        />
        <MilestonesPanel milestones={dashboardMilestones} onExpand={() => navigate('/milestones')} />
      </div>

      <SchedulePanel
        state={ctx.scheduleState}
        rows={ctx.rows}
        errorMsg={ctx.scheduleError}
        selectedDate={ctx.selectedDate}
        sourceLabel={SOURCE_LABEL}
        lastSync={ctx.lastSync}
        refreshing={ctx.refreshing}
        selectedRowId={ctx.selectedRowId}
        answeredIds={ctx.answeredIds}
        onPrevDay={ctx.onPrevDay}
        onNextDay={ctx.onNextDay}
        onToday={ctx.onToday}
        onPickDate={ctx.onPickDate}
        onRefresh={ctx.onRefresh}
        onExpand={() => navigate('/schedule')}
        onRowClick={ctx.onRowClick}
        onRetry={ctx.onScheduleRetry}
      />
    </>
  )
}
