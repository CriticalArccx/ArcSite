import { Maximize2 } from 'lucide-react'
import type { Milestone } from '../types'
import { statusColor } from '../utils'

const R = 24
const C = 2 * Math.PI * R

export function MilestoneArc({ pct, status, color }: { pct: number; status: Milestone['status']; color?: string }) {
  const offset = C - (pct / 100) * C
  return (
    <div className="arc-wrap">
      <svg viewBox="0 0 56 56">
        <circle className="arc-bg" cx="28" cy="28" r={R} />
        <circle className="arc-fg" cx="28" cy="28" r={R} stroke={color ?? statusColor(status)} strokeDasharray={C} strokeDashoffset={offset} />
      </svg>
      <div className="arc-pct">{pct}%</div>
    </div>
  )
}

export function MilestoneList({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="milestone-list">
      {milestones.map((m) => (
        <div key={m.name} className="milestone-item">
          <MilestoneArc pct={m.pct} status={m.status} color={m.color} />
          <div className="milestone-main">
            <p className="milestone-name">{m.name}</p>
            <div className="milestone-meta">
              <span className="status-chip" style={{ color: m.color, background: `${m.color}24` }}>
                {m.label}
              </span>
              <span className="milestone-date">{m.due}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MilestonesPanel({ milestones, onExpand }: { milestones: Milestone[]; onExpand: () => void }) {
  return (
    <section className="panel" id="milestones">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Deliverables</h2>
          <span className="panel-count">{milestones.length} tracked</span>
        </div>
        <div className="panel-header-right">
          <button className="icon-btn" title="Expand" onClick={onExpand} aria-label="Expand deliverables">
            <Maximize2 />
          </button>
        </div>
      </div>
      <div className="panel-body">
        <MilestoneList milestones={milestones} />
      </div>
    </section>
  )
}
