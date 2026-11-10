/**
 * Pure, DOM-free helpers for the Equipment Status Tracker grid — ported from LaunchPad's
 * equipment-tracker-view.js (a shadow-DOM custom element that builds these same values by string-
 * concatenating HTML and querying its own rendered DOM). Since ArcSite renders the grid as React
 * elements instead, every function here just takes/returns plain data so EquipmentTrackerPanel and
 * EquipmentTrackerPdfModal can both consume it without touching the DOM.
 */
import type { EqPhaseRule, EqStatusColor, EquipmentTrackerConfig, EquipmentTrackerRow } from '../../../lib/api'

export type CellType = 'checklist' | 'test' | 'issue'

const BLANK_VALUES = new Set(['', 'N/A', 'Clear', '-'])

function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().trim()
}

function isBlank(val: unknown): boolean {
  return val === undefined || val === null || BLANK_VALUES.has(String(val).trim())
}

export function getContrastYIQ(hex: string | undefined): string {
  if (!hex) return '#000000'
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 128 ? '#000000' : '#ffffff'
}

export function isStatusMatch(status: string | undefined, list: EqStatusColor[] | undefined): boolean {
  if (!status || !list?.length) return false
  const s = norm(status)
  if (list.some((item) => item.name && s === norm(item.name))) return true
  return list.some((item) => item.name && s.includes(norm(item.name)))
}

export function getGateVal(val: string | undefined): string {
  if (val && !isBlank(val)) return String(val).trim()
  return ''
}

export type CellStyle = { background: string; color: string }

const EMPTY_STYLE: CellStyle = { background: '#f5f5f5', color: '#616161' }

/** Resolves a status string to a background/text color — phase rules first, then the configured
 * open/closed/cx-complete (or issue-severity) status lists, then a couple of numeric fallbacks. */
export function getDynamicStyle(
  config: EquipmentTrackerConfig,
  phaseRules: EqPhaseRule[],
  value: string | number | undefined,
  type: CellType = 'checklist',
  isOverallStatus = false,
): CellStyle {
  const fbColor = isOverallStatus ? config.fallbackColor || '#f5f5f5' : '#f5f5f5'
  const fbStyle: CellStyle = { background: fbColor, color: getContrastYIQ(fbColor) }

  if (isBlank(value)) return EMPTY_STYLE
  const lowerVal = norm(value)

  if (phaseRules?.length) {
    let rule = phaseRules.find((r) => r.resultingStatus && lowerVal === norm(r.resultingStatus))
    if (!rule) rule = phaseRules.find((r) => r.resultingStatus && lowerVal.includes(norm(r.resultingStatus)))
    if (rule?.color) return { background: rule.color, color: getContrastYIQ(rule.color) }
  }

  let openArr = config.openStatuses || []
  let closedArr = config.closedStatuses || []
  let cxCompleteArr = config.cxCompleteStatuses || []

  if (type === 'test') {
    openArr = config.testOpenStatuses || []
    closedArr = config.testClosedStatuses || []
    cxCompleteArr = []
  } else if (type === 'issue') {
    openArr = config.issueOpenStatuses || []
    closedArr = config.issueClosedStatuses || []
    if (Number.isNaN(Number(lowerVal))) {
      const priMatch =
        config.gatingIssues.find((s) => s.name && lowerVal.includes(norm(s.name))) ||
        config.nonGatingIssues.find((s) => s.name && lowerVal.includes(norm(s.name)))
      const statMatch =
        openArr.find((s) => s.name && lowerVal.includes(norm(s.name))) || closedArr.find((s) => s.name && lowerVal.includes(norm(s.name)))
      if (priMatch && statMatch) {
        return { background: `linear-gradient(135deg, ${priMatch.color} 50%, ${statMatch.color} 50%)`, color: '#111111' }
      }
      if (priMatch) return { background: priMatch.color, color: getContrastYIQ(priMatch.color) }
      if (statMatch) return { background: statMatch.color, color: getContrastYIQ(statMatch.color) }
    }
  }

  const exactCx = cxCompleteArr.find((s) => s.name && lowerVal === norm(s.name))
  if (exactCx) return { background: exactCx.color, color: getContrastYIQ(exactCx.color) }
  const exactClosed = closedArr.find((s) => s.name && lowerVal === norm(s.name))
  if (exactClosed) return { background: exactClosed.color, color: getContrastYIQ(exactClosed.color) }
  const exactOpen = openArr.find((s) => s.name && lowerVal === norm(s.name))
  if (exactOpen) return { background: exactOpen.color, color: getContrastYIQ(exactOpen.color) }

  if (type === 'issue') {
    const gateMatch = config.gatingIssues.find((s) => s.name && lowerVal.includes(norm(s.name)))
    if (gateMatch) return { background: gateMatch.color, color: getContrastYIQ(gateMatch.color) }
    const nonGateMatch = config.nonGatingIssues.find((s) => s.name && lowerVal.includes(norm(s.name)))
    if (nonGateMatch) return { background: nonGateMatch.color, color: getContrastYIQ(nonGateMatch.color) }
  }

  const matchCx = cxCompleteArr.find((s) => s.name && lowerVal.includes(norm(s.name)))
  if (matchCx) return { background: matchCx.color, color: getContrastYIQ(matchCx.color) }
  const matchClosed = closedArr.find((s) => s.name && lowerVal.includes(norm(s.name)))
  if (matchClosed) return { background: matchClosed.color, color: getContrastYIQ(matchClosed.color) }
  const matchOpen = openArr.find((s) => s.name && lowerVal.includes(norm(s.name)))
  if (matchOpen) return { background: matchOpen.color, color: getContrastYIQ(matchOpen.color) }

  if (lowerVal.includes('no cl') || lowerVal.includes('no l4') || lowerVal.includes('no l3')) return EMPTY_STYLE

  if (!Number.isNaN(Number(lowerVal)) && lowerVal !== '') {
    const num = parseFloat(lowerVal)
    if (num === 0) return { background: '#e1f5fe', color: '#01579b' }
    if (num > 0) {
      if (openArr.length > 0 && openArr[0].color) return { background: openArr[0].color, color: getContrastYIQ(openArr[0].color) }
      return { background: '#ffcdd2', color: '#b71c1c' }
    }
  }
  return isOverallStatus ? fbStyle : EMPTY_STYLE
}

export type StackedCell = { id: string; status: string; link: string; style: CellStyle }

/** Parses the sheet's "id (status)" convention into a display id + colored status pill. Returns
 * null for a blank cell (rendered as a plain "-"). */
export function parseStackedCell(
  val: string | undefined,
  link: string | undefined,
  type: CellType,
  config: EquipmentTrackerConfig,
  phaseRules: EqPhaseRule[],
): StackedCell | null {
  if (isBlank(val)) return null
  const raw = String(val).trim()
  const match = raw.match(/(.+?)\s*\((.+)\)/)
  const id = match ? match[1].trim() : raw
  const status = match ? match[2].trim() : 'Unknown'
  return { id, status, link: String(link || '').trim(), style: getDynamicStyle(config, phaseRules, status, type, false) }
}

export type MaxCols = { l2: number; l3: number; l4: number; iss: number; l2Gate: number; l3Gate: number; l4Gate: number }

/** Scans every row to find the highest-numbered non-blank Gate/Support/Issue column actually in
 * use, so the grid only renders as many sub-columns as the data needs. */
export function computeMaxCols(rows: EquipmentTrackerRow[]): MaxCols {
  const max: MaxCols = { l2: 0, l3: 0, l4: 0, iss: 0, l2Gate: 1, l3Gate: 1, l4Gate: 1 }
  for (const row of rows) {
    for (const level of ['L2', 'L3', 'L4'] as const) {
      const key = level.toLowerCase() as 'l2' | 'l3' | 'l4'
      const gateKey = (key + 'Gate') as 'l2Gate' | 'l3Gate' | 'l4Gate'
      for (let i = 1; i <= 100; i++) {
        const val = row[`${level} Support CL ${i}`]
        if (val !== undefined && val !== null && !isBlank(String(val).replace(/\(Unknown\)/gi, '').trim())) {
          max[key] = Math.max(max[key], i)
        }
      }
      for (let i = 1; i <= 20; i++) {
        const val = row[`${level} Gate CL ${i}`]
        if (val !== undefined && val !== null && !isBlank(String(val).replace(/\(Unknown\)/gi, '').trim())) {
          max[gateKey] = Math.max(max[gateKey], i)
        }
      }
    }
    for (let i = 1; i <= 200; i++) {
      const val = row[`Issue ${i}`]
      if (val !== undefined && val !== null && !isBlank(String(val).replace(/\(Unknown\)/gi, '').trim())) {
        max.iss = Math.max(max.iss, i)
      }
    }
  }
  return max
}

export type OpenItem = { id: string; link: string }
export type CombinedOpen = { items: OpenItem[]; rawText: string }

/** The Support CL ids still open (not Closed/Cx-Complete/"No CL") for one asset/phase — feeds both
 * the always-visible summary cell (when collapsed) and the search/filter index. */
export function combineOpenSupportCLs(row: EquipmentTrackerRow, level: 'L2' | 'L3' | 'L4', maxCount: number, config: EquipmentTrackerConfig): CombinedOpen {
  const closedArr = level === 'L4' ? config.testClosedStatuses || [] : config.closedStatuses || []
  const cxCompleteArr = level === 'L4' ? [] : config.cxCompleteStatuses || []
  const items: OpenItem[] = []
  const rawIds: string[] = []
  for (let i = 1; i <= maxCount; i++) {
    const val = row[`${level} Support CL ${i}`]
    const link = row[`${level} Support CL ${i}_Link`]
    if (!val || isBlank(val)) continue
    const raw = String(val).trim()
    const match = raw.match(/(.+?)\s*\((.+)\)/)
    let id = ''
    let include = false
    if (match) {
      if (!isStatusMatch(match[2], closedArr) && !isStatusMatch(match[2], cxCompleteArr) && !norm(match[2]).includes('no cl')) {
        id = match[1].trim()
        include = true
      }
    } else if (norm(raw) !== 'no cl' && norm(raw) !== 'unknown') {
      id = raw
      include = true
    }
    if (include) {
      items.push({ id, link: String(link || '').trim() })
      rawIds.push(id)
    }
  }
  return { items, rawText: rawIds.length ? rawIds.join(', ') : '-' }
}

/** The gating Issue ids still open for one asset — this is what shows (and gets colored) in the
 * always-visible "Open Issues" summary cell. */
export function combineOpenIssues(row: EquipmentTrackerRow, maxCount: number, config: EquipmentTrackerConfig): CombinedOpen {
  const issueClosedArr = config.issueClosedStatuses || []
  const gatingArr = config.gatingIssues || []
  const items: OpenItem[] = []
  const rawIds: string[] = []
  for (let i = 1; i <= maxCount; i++) {
    const val = row[`Issue ${i}`]
    const link = row[`Issue ${i}_Link`]
    if (!val || isBlank(val)) continue
    const match = String(val).trim().match(/(.+?)\s*\((.+)\)/)
    if (!match) continue
    const status = match[2]
    if (!isStatusMatch(status, issueClosedArr) && isStatusMatch(status, gatingArr)) {
      const id = match[1].trim()
      items.push({ id, link: String(link || '').trim() })
      rawIds.push(id)
    }
  }
  return { items, rawText: rawIds.length ? rawIds.join(', ') : '-' }
}

/** The 9 column-filter values for one row — index matches the filter icon's data-col in the
 * reference (0 Asset, 1 Area, 2/4/6 Gate CL 1, 3/5/7 Overall Status, 8 open issue ids). */
export type RowFilterValues = [string, string, string, string, string, string, string, string, string]

export function computeRowFilterValues(row: EquipmentTrackerRow, maxCols: MaxCols, config: EquipmentTrackerConfig): RowFilterValues {
  const issuesOpen = combineOpenIssues(row, maxCols.iss, config)
  return [
    String(row['Asset'] ?? '').trim(),
    String(row['Area'] ?? '').trim(),
    getGateVal(row['L2 Gate CL 1']),
    String(row['L2 Overall Status'] || 'N/A').trim(),
    getGateVal(row['L3 Gate CL 1']),
    String(row['L3 Overall Status'] || 'N/A').trim(),
    getGateVal(row['L4 Gate CL 1']),
    String(row['L4 Overall Status'] || 'N/A').trim(),
    issuesOpen.rawText.trim(),
  ]
}

// ---------------------------------------------------------------------------
// PDF export — column picker options + per-row value extraction (driven straight from row data,
// not by querying rendered DOM cells the way the reference does).
// ---------------------------------------------------------------------------

export type PdfLevel = 'l2' | 'l3' | 'l4'
export type PdfIssueGroup = 'open-gate' | 'open-non' | 'closed-gate' | 'closed-non'
export type PdfOption = {
  id: string
  label: string
  type: 'asset' | 'area' | 'gate' | 'status' | 'supp-open' | 'supp-closed' | 'iss-group'
  level?: PdfLevel
  group?: PdfIssueGroup
}

export const PDF_OPTIONS: PdfOption[] = [
  { id: 'asset', label: 'Asset', type: 'asset' },
  { id: 'area', label: 'Area', type: 'area' },
  { id: 'l2-gate', label: 'L2 Gate CL', type: 'gate', level: 'l2' },
  { id: 'l2-status', label: 'L2 Overall Status', type: 'status', level: 'l2' },
  { id: 'l2-open', label: 'Open L2 CHK', type: 'supp-open', level: 'l2' },
  { id: 'l2-closed', label: 'Completed L2 CHK', type: 'supp-closed', level: 'l2' },
  { id: 'l3-gate', label: 'L3 Gate CL', type: 'gate', level: 'l3' },
  { id: 'l3-status', label: 'L3 Overall Status', type: 'status', level: 'l3' },
  { id: 'l3-open', label: 'Open L3 CHK', type: 'supp-open', level: 'l3' },
  { id: 'l3-closed', label: 'Completed L3 CHK', type: 'supp-closed', level: 'l3' },
  { id: 'l4-gate', label: 'L4 Gate CL', type: 'gate', level: 'l4' },
  { id: 'l4-status', label: 'L4 Overall Status', type: 'status', level: 'l4' },
  { id: 'l4-open', label: 'Open L4 Tests', type: 'supp-open', level: 'l4' },
  { id: 'l4-closed', label: 'Completed L4 Tests', type: 'supp-closed', level: 'l4' },
  { id: 'iss-open-gate', label: 'Open Gating Issues', type: 'iss-group', group: 'open-gate' },
  { id: 'iss-open-non', label: 'Open Non-Gating Issues', type: 'iss-group', group: 'open-non' },
  { id: 'iss-closed-gate', label: 'Closed Gating Issues', type: 'iss-group', group: 'closed-gate' },
  { id: 'iss-closed-non', label: 'Closed Non-Gating Issues', type: 'iss-group', group: 'closed-non' },
]

export function gateCellsForPdf(row: EquipmentTrackerRow, level: PdfLevel, maxGateCount: number): string {
  const LEVEL = level.toUpperCase() as 'L2' | 'L3' | 'L4'
  const items: string[] = []
  for (let i = 1; i <= maxGateCount; i++) {
    const val = row[`${LEVEL} Gate CL ${i}`]
    if (!val || isBlank(val)) continue
    const match = String(val).trim().match(/(.+?)\s*\((.+)\)/)
    items.push(match ? match[1].trim() : String(val).trim())
  }
  return items.length ? items.join(', ') : '-'
}

export function groupedSupportForPdf(row: EquipmentTrackerRow, level: PdfLevel, maxCount: number, state: 'open' | 'closed', config: EquipmentTrackerConfig): string {
  const openArr = level === 'l4' ? config.testOpenStatuses || [] : config.openStatuses || []
  const closedArr = level === 'l4' ? config.testClosedStatuses || [] : config.closedStatuses || []
  const LEVEL = level.toUpperCase() as 'L2' | 'L3' | 'L4'
  const items: string[] = []
  for (let i = 1; i <= maxCount; i++) {
    const val = row[`${LEVEL} Support CL ${i}`]
    if (!val || isBlank(val)) continue
    const match = String(val).trim().match(/(.+?)\s*\((.+)\)/)
    if (!match) continue
    const id = match[1].trim()
    const status = match[2].trim()
    const isOpen = isStatusMatch(status, openArr) || (!isStatusMatch(status, closedArr) && !norm(status).includes('no cl'))
    const isClosed = isStatusMatch(status, closedArr)
    if (state === 'open' && isOpen) items.push(id)
    if (state === 'closed' && isClosed) items.push(id)
  }
  return items.length ? items.join(', ') : '-'
}

export function groupedIssuesForPdf(row: EquipmentTrackerRow, maxCount: number, group: PdfIssueGroup, config: EquipmentTrackerConfig): string {
  const issueOpenArr = config.issueOpenStatuses || []
  const issueClosedArr = config.issueClosedStatuses || []
  const gatingArr = config.gatingIssues || []
  const items: string[] = []
  for (let i = 1; i <= maxCount; i++) {
    const val = row[`Issue ${i}`]
    if (!val || isBlank(val)) continue
    const match = String(val).trim().match(/(.+?)\s*\((.+)\)/)
    if (!match) continue
    const id = match[1].trim()
    const status = match[2].trim()
    const isOpen = isStatusMatch(status, issueOpenArr) || !isStatusMatch(status, issueClosedArr)
    const isClosed = isStatusMatch(status, issueClosedArr)
    const isGating = isStatusMatch(status, gatingArr)
    if (group === 'open-gate' && isOpen && isGating) items.push(id)
    if (group === 'open-non' && isOpen && !isGating) items.push(id)
    if (group === 'closed-gate' && isClosed && isGating) items.push(id)
    if (group === 'closed-non' && isClosed && !isGating) items.push(id)
  }
  return items.length ? items.join(', ') : '-'
}
