/**
 * Which LaunchPad project (site) ArcSite is currently scoped to — STY4 (Phoenix DC3) or SANNT1B
 * (SAN-NT1B), both already-existing `launchpad_projects` rows with their own Sheet-backed tables
 * and Apps Script deployment. Read once at module load and treated as immutable for the page's
 * lifetime — switching projects (setCurrentProject) writes the choice to localStorage and reloads
 * the page, rather than trying to make every fetch/hook in the app reactive to a live project
 * change. That keeps this a plain constant every plain function in api.ts can read synchronously
 * (no React context, no stale-closure risk), at the cost of a page reload on switch — an
 * acceptable trade for an action taken rarely (picking which site you're working on), not per
 * click.
 */

export type ProjectKey = 'STY4' | 'SANNT1B' | 'RSE1A'

export const PROJECTS: Array<{ key: ProjectKey; label: string }> = [
  { key: 'STY4', label: 'STY4' },
  { key: 'SANNT1B', label: 'SAN-NT1B' },
  { key: 'RSE1A', label: 'RSE1A' },
]

const STORAGE_KEY = 'arcapp_project'
const DEFAULT_PROJECT: ProjectKey = 'STY4'

export function isProjectKey(v: unknown): v is ProjectKey {
  return v === 'STY4' || v === 'SANNT1B' || v === 'RSE1A'
}

function readInitial(): ProjectKey {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (isProjectKey(v)) return v
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall back to the default below.
  }
  return DEFAULT_PROJECT
}

export const CURRENT_PROJECT: ProjectKey = readInitial()

export function projectLabel(key: ProjectKey): string {
  return PROJECTS.find((p) => p.key === key)?.label ?? key
}

/**
 * Capability gaps found while wiring up SAN-NT1B, requiring manual setup on the LaunchPad/Sheet
 * side that this app can't do for you — pages depending on either show an "unavailable for this
 * project" notice instead of silently erroring or (worse) rendering broken data:
 *
 *  - `siteLogging`: Tamper Seals and RTFT write to <prefix>Assets/<prefix>RTFT — those tables
 *    only exist for STY4 today.
 *  - `cxAlloyActions`: Checklists, Issues, Asset Attributes (+ its photo-crop OCR), and the
 *    Checklist/Issue To-Do sections all call custom actions (getChecklists/getIssues/
 *    getCxAlloySettings/getEquipmentAttributes/saveAttributes/saveImageOnly/ocrImage) that were
 *    added specifically to STY4's Apps Script deployment (see the "ADDED FOR ArcApp" block
 *    mentioned in api.ts) — SAN-NT1B's separately-deployed script doesn't have them yet, so an
 *    unrecognized `action` param there currently falls through to a different, equipment-tracker-
 *    shaped default response instead of an error, which would otherwise render as a page full of
 *    blank/malformed rows rather than fail cleanly.
 *
 * NETA Tracker used to be a third capability here (`netaTracker`) but moved to a per-project
 * Settings toggle instead (`netaTrackerEnabled` in AppSettings, `neta_tracker_enabled` in
 * arcapp_settings — see api.ts/SettingsPanel.tsx) as of 2026-09-25, by request: unlike the two
 * gaps above, NETA Tracker's Sheet/script is a brand-new per-site build every time (not just "add
 * an action to an existing script"), so an admin turning it on for a newly-onboarded site
 * shouldn't need a code change and redeploy of ArcSite itself.
 */
export type Capability = 'siteLogging' | 'cxAlloyActions'

const CAPABILITIES: Record<ProjectKey, Record<Capability, boolean>> = {
  STY4: { siteLogging: true, cxAlloyActions: true },
  // cxAlloyActions flipped on 2026-09-25 — SAN-NT1B's Apps Script now has getChecklists/
  // getIssues/getCxAlloySettings added (see AppendToCxAlloyScript.gs), confirmed deployed.
  SANNT1B: { siteLogging: false, cxAlloyActions: true },
  // Added 2026-11-02 — RSE1A's base LaunchPad project (its own launchpad_projects row, Apps
  // Script deployment, dropdownoptions/BackEndData sheet) exists, but neither ArcSite-specific
  // capability has been confirmed yet: siteLogging needs RSE1AAssets/RSE1ARTFT tables that don't
  // exist for a new project until built, and cxAlloyActions needs the same custom actions added
  // to SAN-NT1B's script (AppendToCxAlloyScript.gs) also added to RSE1A's own deployment. Starts
  // both off, same safe starting point SAN-NT1B had before each was individually confirmed and
  // flipped on — flip to true here once verified, not before (see this file's capability-gap
  // comment above for what breaks if a page assumes an action is deployed when it isn't).
  RSE1A: { siteLogging: false, cxAlloyActions: false },
}

export function hasCapability(cap: Capability, project: ProjectKey = CURRENT_PROJECT): boolean {
  return CAPABILITIES[project][cap]
}

export function setCurrentProject(key: ProjectKey) {
  if (key === CURRENT_PROJECT) return
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    // If this fails, the reload below still picks up the old project — better than a silent
    // no-op that leaves the picker showing a project that didn't actually switch anything.
  }
  window.location.href = '/'
}
