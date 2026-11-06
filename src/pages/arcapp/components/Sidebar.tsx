import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckSquare,
  Flag,
  CalendarDays,
  ListChecks,
  AlertTriangle,
  FileCheck2,
  Camera,
  ShieldAlert,
  ClipboardCheck,
  Tag,
  Grid3x3,
  FileSpreadsheet,
  Lightbulb,
  Settings as SettingsIcon,
} from 'lucide-react'
import { hasCapability, type Capability } from '../../../lib/project'

const NAV: Array<{ to: string; label: string; icon: typeof LayoutDashboard; requires?: Capability }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/todo', label: 'To-Do', icon: CheckSquare },
  { to: '/milestones', label: 'Deliverables', icon: Flag },
  { to: '/schedule', label: 'Activities', icon: CalendarDays },
  { to: '/checklists', label: 'Checklists', icon: ListChecks, requires: 'cxAlloyActions' },
  { to: '/issues', label: 'Issues', icon: AlertTriangle, requires: 'cxAlloyActions' },
  { to: '/submittals', label: 'Submittals', icon: FileCheck2 },
  { to: '/lessonslearned', label: 'Lessons Learned', icon: Lightbulb },
  { to: '/tamperseals', label: 'Tamper Seals', icon: ShieldAlert, requires: 'siteLogging' },
  { to: '/rtft', label: 'RTFT', icon: ClipboardCheck, requires: 'siteLogging' },
  { to: '/equipmenttracker', label: 'Equipment Tracker', icon: Grid3x3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

/** Joint Packs, Asset Attributes, and NETA Tracker aren't in the static NAV list above — unlike
 * the other gated items, their availability is a per-project Settings toggle
 * (`jointPackEnabled`/`assetAttributesEnabled`/`netaTrackerEnabled`), not a project.ts capability,
 * so they're spliced in conditionally instead of filtered via `requires`. */
const JOINT_PACKS_NAV_ITEM = { to: '/jointpacks', label: 'Joint Packs', icon: Camera }
const ASSET_ATTRIBUTES_NAV_ITEM = { to: '/attributes', label: 'Asset Attributes', icon: Tag }
const NETA_NAV_ITEM = { to: '/netatracker', label: 'NETA Tracker', icon: FileSpreadsheet }

/** Where to insert a spliced-in item: right before `before`, or at the end if `before` got
 * filtered out by its own `requires` gate (e.g. "Tamper Seals" on a `siteLogging`-less project) —
 * `findIndex` returning -1 would otherwise splice before the LAST item instead of at the end. */
function insertionIndex(items: Array<{ to: string }>, before: string): number {
  const idx = items.findIndex((i) => i.to === before)
  return idx === -1 ? items.length : idx
}

type Props = {
  jointPackEnabled: boolean
  assetAttributesEnabled: boolean
  netaTrackerEnabled: boolean
  /** Settings → "Sidebar tabs" — admin-controlled per-project visibility for everything below
   * except Dashboard ('/') and Settings itself ('/settings'), which are never toggleable: Dashboard
   * is the landing page and Settings is where you'd turn either of those back on. Narrows further
   * on top of the `requires` capability gate above where both apply (Checklists/Issues/Tamper
   * Seals/RTFT) — never overrides it. */
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
}

export default function Sidebar({
  jointPackEnabled,
  assetAttributesEnabled,
  netaTrackerEnabled,
  showTodo,
  showMilestones,
  showSchedule,
  showChecklists,
  showIssues,
  showSubmittals,
  showLessonsLearned,
  showTamperSeals,
  showRtft,
  showEquipmentTracker,
}: Props) {
  const visible: Record<string, boolean> = {
    '/todo': showTodo,
    '/milestones': showMilestones,
    '/schedule': showSchedule,
    '/checklists': showChecklists,
    '/issues': showIssues,
    '/submittals': showSubmittals,
    '/lessonslearned': showLessonsLearned,
    '/tamperseals': showTamperSeals,
    '/rtft': showRtft,
    '/equipmenttracker': showEquipmentTracker,
  }
  const items = NAV.filter((item) => (!item.requires || hasCapability(item.requires)) && visible[item.to] !== false)
  // Slotted after "Submittals" / before "Tamper Seals", matching where Joint Packs used to sit.
  if (jointPackEnabled) items.splice(insertionIndex(items, '/tamperseals'), 0, JOINT_PACKS_NAV_ITEM)
  // Slotted after "RTFT" / before "Equipment Tracker", matching where Attributes used to sit.
  if (assetAttributesEnabled) items.splice(insertionIndex(items, '/equipmenttracker'), 0, ASSET_ATTRIBUTES_NAV_ITEM)
  // Slotted after "Attributes" / before "Equipment Tracker", matching where it used to sit in NAV.
  if (netaTrackerEnabled) items.splice(insertionIndex(items, '/equipmenttracker'), 0, NETA_NAV_ITEM)
  return (
    <nav className="arcapp-sidebar" aria-label="Main">
      <div className="arcapp-sidebar-nav">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
