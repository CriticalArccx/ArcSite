import type { ComputedMilestone } from '../milestones'
import type { ScheduleRow, Todo } from '../types'
import { localIsoDate, todoDueDisplay } from '../utils'

type Props = {
  milestones: ComputedMilestone[]
  /** Same `todos` + `extraOpenCount` the "Your To-Dos" widget (TodoPanel.tsx) is given, so this
   * tile's count is computed with the exact same formula instead of a second, possibly-diverging
   * one — see TodoPanel's own `open = todos.filter(t => !t.done).length + extraOpenCount`. */
  todos: Todo[]
  extraOpenCount: number
  /** The currently-loaded Schedule rows (ctx.rows) — whatever day's Schedule panel is showing. */
  scheduleRows: ScheduleRow[]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Whole days from today to an ISO due date — negative once it's past. */
function daysUntil(dueDateIso: string): number {
  const today = new Date(`${localIsoDate()}T00:00:00`)
  const due = new Date(`${dueDateIso}T00:00:00`)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

export default function KpiRow({ milestones, todos, extraOpenCount, scheduleRows }: Props) {
  const goCount = milestones.filter((m) => m.progress.status === 'go').length
  const completeCount = milestones.filter((m) => m.progress.status === 'complete').length
  const attentionCount = milestones.filter((m) => m.progress.status === 'caution' || m.progress.status === 'hold').length
  const milestoneSubClass = milestones.length === 0 ? '' : attentionCount > 0 ? (milestones.some((m) => m.progress.status === 'hold') ? 'bad' : 'warn') : 'good'
  const milestoneSub =
    milestones.length === 0
      ? 'No deliverables entered yet'
      : attentionCount > 0
        ? `${attentionCount} need${attentionCount === 1 ? 's' : ''} attention`
        : completeCount === milestones.length
          ? 'All complete'
          : 'All on track'

  const openTodos = todos.filter((t) => !t.done).length + extraOpenCount
  const dueToday = todos.filter((t) => !t.done && todoDueDisplay(t).today).length

  const disciplines = new Set(scheduleRows.map((r) => r.trade).filter(Boolean)).size

  const upcoming = milestones
    .filter((m) => m.progress.status !== 'complete' && m.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const upcomingDays = upcoming ? daysUntil(upcoming.dueDate) : null

  return (
    <div className="kpi-row">
      <div className="kpi">
        <div className="kpi-label">Deliverables GO</div>
        <div className="kpi-value">
          {milestones.length === 0 ? (
            '—'
          ) : (
            <>
              {goCount} <small>/ {milestones.length}</small>
            </>
          )}
        </div>
        <div className={`kpi-sub ${milestoneSubClass}`}>{milestoneSub}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Open to-dos</div>
        <div className="kpi-value">{openTodos}</div>
        <div className={`kpi-sub ${dueToday > 0 ? 'warn' : ''}`}>{dueToday > 0 ? `${dueToday} due today` : 'None due today'}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Scheduled Activities</div>
        <div className="kpi-value">{scheduleRows.length}</div>
        <div className="kpi-sub">{disciplines > 0 ? `${disciplines} discipline${disciplines === 1 ? '' : 's'} active` : 'Nothing scheduled'}</div>
      </div>
      <div className="kpi clock">
        <div className="kpi-label">Next deliverable</div>
        {upcoming && upcomingDays !== null ? (
          <>
            <div className="kpi-value">
              {upcomingDays > 0 ? (
                <>
                  T&#8722;<span className="unit">{pad2(upcomingDays)}D</span>
                </>
              ) : upcomingDays === 0 ? (
                <span className="unit">Today</span>
              ) : (
                <span className="unit">{pad2(-upcomingDays)}D late</span>
              )}
            </div>
            <div className={`kpi-sub ${upcomingDays <= 0 ? 'bad' : upcomingDays <= 3 ? 'warn' : ''}`}>{upcoming.name}</div>
          </>
        ) : (
          <>
            <div className="kpi-value">—</div>
            <div className="kpi-sub">No upcoming deliverables</div>
          </>
        )}
      </div>
    </div>
  )
}
