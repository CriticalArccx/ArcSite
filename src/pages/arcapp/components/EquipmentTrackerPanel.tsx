import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { ChevronDown, ChevronUp, Eraser, FileDown, Filter, RefreshCw, Search as SearchIcon, Settings as SettingsIcon } from 'lucide-react'
import { useGetEquipmentTrackerData } from '../../../lib/api'
import type { EqPhaseRule, EquipmentTrackerConfig, EquipmentTrackerRow } from '../../../lib/api'
import { CURRENT_PROJECT } from '../../../lib/project'
import {
  buildAssetCards,
  combineOpenIssues,
  computeMaxCols,
  computeRowFilterValues,
  getDynamicStyle,
  parseStackedCell,
  type CellType,
  type CombinedOpen,
  type MaxCols,
  type PhaseLevel,
} from '../lib/equipmentTracker'
import EquipmentStatusBoard from './EquipmentStatusBoard'
import EquipmentTrackerPdfModal from './EquipmentTrackerPdfModal'
import EquipmentTrackerSettingsModal from './EquipmentTrackerSettingsModal'
import ModuleSettingsSection from './ModuleSettingsSection'
import { Field } from './SettingsControls'
import type { ShellContext } from '../ShellContext'

const GATE_W = 100
const CELL_W = 100
const SUMMARY_W = 190

type PhaseKey = 'l2' | 'l3' | 'l4'
type ExpandState = Record<PhaseKey | 'iss', boolean>

type RowMeta = {
  row: EquipmentTrackerRow
  filterValues: ReturnType<typeof computeRowFilterValues>
  issuesOpen: CombinedOpen
}

type ViewMode = 'cards' | 'grid'
const VIEW_STORAGE_KEY = 'arcsite_eq_tracker_view'

function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'cards'
  } catch {
    return 'cards'
  }
}

const COLUMN_LABELS = ['Asset', 'Area', 'L2 Gate', 'L2 Status', 'L3 Gate', 'L3 Status', 'L4 Gate', 'L4 Status', 'Open Issues']

/**
 * Equipment Status Tracker grid — ported from LaunchPad's equipment-tracker-view.js (see that
 * file's header comment for the full backstory). Reads the same periodically-synced Supabase
 * tables LaunchPad's own tracker reads. System Config + Phase Rules Engine (EquipmentTrackerSettingsModal)
 * mirror LaunchPad's own Settings modal in full as of 2026-10-29 — see the Equipment Status
 * Tracker section in api.ts for why Phase Rules specifically need an Apps Script round trip to
 * actually take effect, not just a Supabase write.
 */
export default function EquipmentTrackerPanel() {
  const ctx = useOutletContext<ShellContext>()
  const fn = useGetEquipmentTrackerData()
  useEffect(() => {
    void fn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = fn.data?.rows ?? []
  const phaseRules = fn.data?.phaseRules ?? []
  const config = fn.data?.config
  const syncedAt = fn.data?.syncedAt ?? null
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'

  const [expanded, setExpanded] = useState<ExpandState>({ l2: false, l3: false, l4: false, iss: false })
  const [activeFilters, setActiveFilters] = useState<Record<number, Set<string>>>({})
  const [filterCol, setFilterCol] = useState<number | null>(null)
  const [filterAnchor, setFilterAnchor] = useState<{ top: number; left: number } | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [view, setView] = useState<ViewMode>(readStoredView)
  const rowRefs = useRef(new Map<RowMeta, HTMLDivElement>())

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 220)
    return () => clearTimeout(t)
  }, [search])

  const maxCols: MaxCols = useMemo(() => computeMaxCols(rows), [rows])

  const rowsWithMeta: RowMeta[] = useMemo(() => {
    if (!config) return []
    return rows.map((row) => ({
      row,
      filterValues: computeRowFilterValues(row, maxCols, config),
      issuesOpen: combineOpenIssues(row, maxCols.iss, config),
    }))
  }, [rows, maxCols, config])

  const activeFilterCols = Object.keys(activeFilters)

  const visibleRows: RowMeta[] = useMemo(() => {
    if (!activeFilterCols.length) return rowsWithMeta
    return rowsWithMeta.filter((m) => activeFilterCols.every((c) => activeFilters[Number(c)].has(m.filterValues[Number(c)])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsWithMeta, activeFilters])

  const searchMatches: RowMeta[] = useMemo(() => {
    if (!debouncedSearch) return []
    return visibleRows.filter((m) => {
      for (const v of m.filterValues) if (v && v.toLowerCase().includes(debouncedSearch)) return true
      for (const v of Object.values(m.row)) if (v && String(v).toLowerCase().includes(debouncedSearch)) return true
      return false
    })
  }, [visibleRows, debouncedSearch])

  useEffect(() => {
    setSearchIndex(0)
  }, [debouncedSearch, activeFilters])

  useEffect(() => {
    if (view !== 'grid' || !searchMatches.length) return
    const match = searchMatches[Math.min(searchIndex, searchMatches.length - 1)]
    if (!match) return
    const el = rowRefs.current.get(match)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })

    const needsExpand: Partial<ExpandState> = {}
    for (const [key, val] of Object.entries(match.row)) {
      if (!val || !String(val).toLowerCase().includes(debouncedSearch)) continue
      if (key.startsWith('L2 Support')) needsExpand.l2 = true
      if (key.startsWith('L3 Support')) needsExpand.l3 = true
      if (key.startsWith('L4 Support')) needsExpand.l4 = true
      if (key.startsWith('Issue')) needsExpand.iss = true
    }
    if (Object.keys(needsExpand).length) setExpanded((e) => ({ ...e, ...needsExpand }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchIndex, searchMatches, view])

  function changeView(next: ViewMode) {
    setView(next)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // Storage blocked (private window etc.): the choice just isn't remembered.
    }
  }

  // Card view: search narrows the cards instead of stepping through matches the way the grid does.
  const cardLevels: PhaseLevel[] = useMemo(() => {
    if (!config) return []
    const out: PhaseLevel[] = []
    if (!(config.showL2Gate === false && config.showL2Supp === false)) out.push('L2')
    if (!(config.showL3Gate === false && config.showL3Supp === false)) out.push('L3')
    if (!(config.showL4Gate === false && config.showL4Supp === false)) out.push('L4')
    return out
  }, [config])

  const cards = useMemo(() => {
    if (!config || view !== 'cards') return []
    return buildAssetCards(
      (debouncedSearch ? searchMatches : visibleRows).map((m) => m.row),
      maxCols,
      cardLevels,
      config,
      phaseRules,
    )
  }, [config, view, debouncedSearch, searchMatches, visibleRows, maxCols, cardLevels, phaseRules])

  function navigateSearch(dir: number) {
    if (!searchMatches.length) return
    setSearchIndex((i) => {
      let next = i + dir
      if (next < 0) next = searchMatches.length - 1
      if (next >= searchMatches.length) next = 0
      return next
    })
  }

  function toggleExpand(key: PhaseKey | 'iss') {
    setExpanded((e) => ({ ...e, [key]: !e[key] }))
  }

  function availableValuesForColumn(colIndex: number): string[] {
    const values = new Set<string>()
    for (const m of rowsWithMeta) {
      let passes = true
      for (const c of activeFilterCols) {
        if (Number(c) === colIndex) continue
        if (!activeFilters[Number(c)].has(m.filterValues[Number(c)])) {
          passes = false
          break
        }
      }
      if (passes) values.add(m.filterValues[colIndex])
    }
    return Array.from(values).sort()
  }

  function openFilter(e: React.MouseEvent, colIndex: number) {
    e.stopPropagation()
    if (filterCol === colIndex) {
      setFilterCol(null)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    let left = rect.left - 120
    if (left < 10) left = 10
    if (left + 220 > window.innerWidth) left = window.innerWidth - 220
    setFilterAnchor({ top: rect.bottom + 5, left })
    setFilterCol(colIndex)
  }

  function applyFilter(colIndex: number, selected: Set<string>, available: string[]) {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (selected.size === available.length) delete next[colIndex]
      else next[colIndex] = selected
      return next
    })
    setFilterCol(null)
  }

  function clearFilter(colIndex: number) {
    setActiveFilters((prev) => {
      const next = { ...prev }
      delete next[colIndex]
      return next
    })
    setFilterCol(null)
  }

  function clearAllFilters() {
    setActiveFilters({})
  }

  if (state !== 'ready' || !config) {
    return (
      <section className="panel" id="equipment-tracker">
        <div className="panel-header">
          <div className="panel-header-left">
            <h2 className="panel-title">Equipment Status Tracker</h2>
            <span className="panel-count">—</span>
          </div>
          <div className="panel-header-right">
            <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh">
              <RefreshCw />
            </button>
          </div>
        </div>
        <div className="panel-body">
          {state === 'loading' && <div className="q-hint">Loading…</div>}
          {state === 'error' && (
            <div className="table-error" style={{ padding: '16px 0' }}>
              Couldn&apos;t load the Equipment Status Tracker ({fn.error}).
              <br />
              <button className="retry-btn" onClick={() => void fn.trigger()}>
                Retry
              </button>
            </div>
          )}
        </div>
      </section>
    )
  }

  const l2Visible = !(config.showL2Gate === false && config.showL2Supp === false)
  const l3Visible = !(config.showL3Gate === false && config.showL3Supp === false)
  const l4Visible = !(config.showL4Gate === false && config.showL4Supp === false)

  function groupWidth(gateShown: boolean, gateCount: number, suppShown: boolean, suppCount: number, isExpanded: boolean): number {
    const gateW = gateShown ? gateCount * GATE_W : 0
    const suppW = isExpanded && suppShown ? suppCount * CELL_W : 0
    return gateW + SUMMARY_W + suppW
  }

  const l2Width = groupWidth(config.showL2Gate !== false, maxCols.l2Gate, config.showL2Supp !== false, maxCols.l2, expanded.l2)
  const l3Width = groupWidth(config.showL3Gate !== false, maxCols.l3Gate, config.showL3Supp !== false, maxCols.l3, expanded.l3)
  const l4Width = groupWidth(config.showL4Gate !== false, maxCols.l4Gate, config.showL4Supp !== false, maxCols.l4, expanded.l4)
  const issWidth = SUMMARY_W + (expanded.iss ? maxCols.iss * CELL_W : 0)

  const hasFilters = activeFilterCols.length > 0
  const activeAvailable = filterCol !== null ? availableValuesForColumn(filterCol) : []

  // Reassigned so TS keeps the non-undefined narrowing from the early-return guard above inside
  // these nested function declarations — it doesn't carry `config` itself into their closures.
  const cfg = config

  function renderGateCells(row: EquipmentTrackerRow, level: 'L2' | 'L3' | 'L4', count: number, type: CellType) {
    const out = []
    for (let i = 1; i <= count; i++) {
      const val = row[`${level} Gate CL ${i}`]
      const link = row[`${level} Gate CL ${i}_Link`]
      out.push(<StackedCell key={i} val={val} link={link} type={type} config={cfg} phaseRules={phaseRules} className="eq-gate-cell" />)
    }
    return out
  }

  function renderSupportCells(row: EquipmentTrackerRow, level: 'L2' | 'L3' | 'L4', count: number, type: CellType) {
    const out = []
    for (let i = 1; i <= count; i++) {
      const val = row[`${level} Support CL ${i}`]
      const link = row[`${level} Support CL ${i}_Link`]
      out.push(<StackedCell key={i} val={val} link={link} type={type} config={cfg} phaseRules={phaseRules} className="eq-supp-cell" />)
    }
    return out
  }

  function renderIssueCells(row: EquipmentTrackerRow, count: number) {
    const out = []
    for (let i = 1; i <= count; i++) {
      const val = row[`Issue ${i}`]
      const link = row[`Issue ${i}_Link`]
      out.push(<StackedCell key={i} val={val} link={link} type="issue" config={cfg} phaseRules={phaseRules} className="eq-iss-cell" />)
    }
    return out
  }

  return (
    <section className="panel eq-panel" id="equipment-tracker">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Equipment Status Tracker</h2>
          <span className="panel-count">
            {visibleRows.length === rows.length ? `${rows.length} assets` : `${visibleRows.length} of ${rows.length} assets`}
          </span>
          {syncedAt && (
            <span className="eq-synced" title={new Date(syncedAt).toLocaleString()}>
              Synced {timeAgo(syncedAt)}
            </span>
          )}
        </div>
        <div className="panel-header-right" style={{ gap: 10 }}>
          <div className="eq-search">
            <SearchIcon />
            <input
              type="text"
              placeholder={view === 'cards' ? 'Filter assets…' : 'Find instance…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={view === 'cards' ? 'Filter assets' : 'Find instance'}
            />
            {view === 'grid' ? (
              <>
                <span className="eq-search-count">{searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : '0/0'}</span>
                <button type="button" onClick={() => navigateSearch(-1)} aria-label="Previous match">
                  <ChevronUp />
                </button>
                <button type="button" onClick={() => navigateSearch(1)} aria-label="Next match">
                  <ChevronDown />
                </button>
              </>
            ) : (
              debouncedSearch && <span className="eq-search-count">{searchMatches.length}</span>
            )}
          </div>
          {view === 'cards' && (
            <button type="button" className={activeFilters[1] ? 'panel-action-btn active' : 'panel-action-btn'} onClick={(e) => openFilter(e, 1)}>
              <Filter style={{ width: 14, height: 14 }} />
              {config.customHeaders.areaPrefix || 'Area'}
            </button>
          )}
          {hasFilters && (
            <button type="button" className="panel-action-btn" onClick={clearAllFilters}>
              <Eraser style={{ width: 14, height: 14 }} />
              Clear Filters
            </button>
          )}
          <button type="button" className="panel-action-btn" onClick={() => setPdfOpen(true)}>
            <FileDown style={{ width: 14, height: 14 }} />
            Export PDF
          </button>
          {ctx.isAdmin && config && (
            <button type="button" className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setConfigModalOpen(true)}>
              <SettingsIcon style={{ width: 13, height: 13 }} />
              System Config
            </button>
          )}
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="eq-subbar">
        <div className="sync-note">
          {view === 'cards'
            ? 'One card per asset, in the phase it’s in now. A phase counts as finished when its status matches a Cx Complete or Closed status in System Config.'
            : 'Mirrors LaunchPad’s own Equipment Status Tracker (L2/L3/L4 phase tracking, synced from the project sheet).'}
        </div>
        <div className="ts-filter-group">
          <span className="ts-filter-label">View:</span>
          <button type="button" className={`ts-filter-btn${view === 'cards' ? ' active' : ''}`} onClick={() => changeView('cards')} aria-pressed={view === 'cards'}>
            Cards
          </button>
          <button type="button" className={`ts-filter-btn${view === 'grid' ? ' active' : ''}`} onClick={() => changeView('grid')} aria-pressed={view === 'grid'}>
            Grid
          </button>
        </div>
      </div>
      <div style={{ padding: '0 20px 12px' }}>
        <ModuleSettingsSection open={settingsOpen} onOpenChange={setSettingsOpen}>
          <Field
            label="Equipment Tracker — Apps Script Web App URL"
            hint="This project's own dedicated Equipment Tracker deployment's /exec URL (separate from the shared CxAlloy script) — needed so Phase Rules saved from System Config actually sync to the Sheet instead of just sitting in Supabase."
            initial={ctx.equipmentTrackerScriptUrl}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(v) => ctx.onSaveSetting('equipment_tracker_script_url', v)}
          />
        </ModuleSettingsSection>
      </div>

      {view === 'cards' && (
        <div className="panel-body eq-board-body">
          <EquipmentStatusBoard cards={cards} levels={cardLevels} config={config} />
        </div>
      )}

      {view === 'grid' && (
      <div className="panel-body no-pad">
        <div className="eq-scroll">
          <div className="eq-header-sticky">
            <div className="eq-group-bar">
              <div className="eq-group-cell eq-frozen-group">Asset Details</div>
              <div className="eq-phase-gap" />
              {l2Visible && (
                <div className="eq-group-cell" style={{ width: l2Width, minWidth: l2Width }}>
                  {config.customHeaders.l2Phase}
                </div>
              )}
              {l2Visible && <div className="eq-phase-gap" />}
              {l3Visible && (
                <div className="eq-group-cell" style={{ width: l3Width, minWidth: l3Width }}>
                  {config.customHeaders.l3Phase}
                </div>
              )}
              {l3Visible && <div className="eq-phase-gap" />}
              {l4Visible && (
                <div className="eq-group-cell" style={{ width: l4Width, minWidth: l4Width }}>
                  {config.customHeaders.l4Phase}
                </div>
              )}
              {l4Visible && <div className="eq-phase-gap" />}
              <div className="eq-group-cell eq-group-issues" style={{ width: issWidth, minWidth: issWidth }}>
                {config.customHeaders.issPhase}
              </div>
            </div>

            <div className="eq-col-header-row">
              <div className="eq-frozen-combined eq-header-cell">
                <div className="eq-asset-part-header">
                  <span>Asset</span>
                  <FilterIcon col={0} active={!!activeFilters[0]} onClick={openFilter} />
                </div>
                <div className="eq-area-part-header">
                  <span>{config.customHeaders.areaPrefix}</span>
                  <FilterIcon col={1} active={!!activeFilters[1]} onClick={openFilter} />
                </div>
              </div>
              <div className="eq-phase-gap" />

              {l2Visible && (
                <>
                  {config.showL2Gate !== false &&
                    Array.from({ length: maxCols.l2Gate }).map((_, i) => (
                      <div key={i} className="eq-gate-cell eq-header-cell">
                        <span>{maxCols.l2Gate > 1 ? `${config.customHeaders.l2Gate} ${i + 1}` : config.customHeaders.l2Gate}</span>
                        {i === 0 && <FilterIcon col={2} active={!!activeFilters[2]} onClick={openFilter} />}
                      </div>
                    ))}
                  <div className="eq-summary-cell eq-header-cell">
                    <span>{config.customHeaders.l2Status}</span>
                    <FilterIcon col={3} active={!!activeFilters[3]} onClick={openFilter} />
                    {maxCols.l2 > 0 && config.showL2Supp !== false && <ExpandBtn active={expanded.l2} onClick={() => toggleExpand('l2')} />}
                  </div>
                  {expanded.l2 &&
                    config.showL2Supp !== false &&
                    Array.from({ length: maxCols.l2 }).map((_, i) => (
                      <div key={i} className="eq-supp-cell eq-header-cell">
                        Supp {i + 1}
                      </div>
                    ))}
                  <div className="eq-phase-gap" />
                </>
              )}

              {l3Visible && (
                <>
                  {config.showL3Gate !== false &&
                    Array.from({ length: maxCols.l3Gate }).map((_, i) => (
                      <div key={i} className="eq-gate-cell eq-header-cell">
                        <span>{maxCols.l3Gate > 1 ? `${config.customHeaders.l3Gate} ${i + 1}` : config.customHeaders.l3Gate}</span>
                        {i === 0 && <FilterIcon col={4} active={!!activeFilters[4]} onClick={openFilter} />}
                      </div>
                    ))}
                  <div className="eq-summary-cell eq-header-cell">
                    <span>{config.customHeaders.l3Status}</span>
                    <FilterIcon col={5} active={!!activeFilters[5]} onClick={openFilter} />
                    {maxCols.l3 > 0 && config.showL3Supp !== false && <ExpandBtn active={expanded.l3} onClick={() => toggleExpand('l3')} />}
                  </div>
                  {expanded.l3 &&
                    config.showL3Supp !== false &&
                    Array.from({ length: maxCols.l3 }).map((_, i) => (
                      <div key={i} className="eq-supp-cell eq-header-cell">
                        Supp {i + 1}
                      </div>
                    ))}
                  <div className="eq-phase-gap" />
                </>
              )}

              {l4Visible && (
                <>
                  {config.showL4Gate !== false &&
                    Array.from({ length: maxCols.l4Gate }).map((_, i) => (
                      <div key={i} className="eq-gate-cell eq-header-cell">
                        <span>{maxCols.l4Gate > 1 ? `${config.customHeaders.l4Gate} ${i + 1}` : config.customHeaders.l4Gate}</span>
                        {i === 0 && <FilterIcon col={6} active={!!activeFilters[6]} onClick={openFilter} />}
                      </div>
                    ))}
                  <div className="eq-summary-cell eq-header-cell">
                    <span>{config.customHeaders.l4Status}</span>
                    <FilterIcon col={7} active={!!activeFilters[7]} onClick={openFilter} />
                    {maxCols.l4 > 0 && config.showL4Supp !== false && <ExpandBtn active={expanded.l4} onClick={() => toggleExpand('l4')} />}
                  </div>
                  {expanded.l4 &&
                    config.showL4Supp !== false &&
                    Array.from({ length: maxCols.l4 }).map((_, i) => (
                      <div key={i} className="eq-supp-cell eq-header-cell">
                        Supp {i + 1}
                      </div>
                    ))}
                  <div className="eq-phase-gap" />
                </>
              )}

              <div className="eq-summary-cell eq-header-cell">
                <span>{config.customHeaders.issStatus}</span>
                <FilterIcon col={8} active={!!activeFilters[8]} onClick={openFilter} />
                {maxCols.iss > 0 && <ExpandBtn active={expanded.iss} onClick={() => toggleExpand('iss')} />}
              </div>
              {expanded.iss &&
                Array.from({ length: maxCols.iss }).map((_, i) => (
                  <div key={i} className="eq-iss-cell eq-header-cell">
                    Iss {i + 1}
                  </div>
                ))}
            </div>
          </div>

          <div className="eq-rows">
            {visibleRows.length === 0 && <div className="table-empty">No assets match the current filters.</div>}
            {visibleRows.map((m) => {
              const isCurrentMatch = searchMatches.length > 0 && searchMatches[Math.min(searchIndex, searchMatches.length - 1)] === m
              const { row, issuesOpen } = m
              return (
                <div
                  key={row['Asset'] || Math.random()}
                  className={`eq-row${isCurrentMatch ? ' eq-row-highlight' : ''}`}
                  ref={(el) => {
                    if (el) rowRefs.current.set(m, el)
                    else rowRefs.current.delete(m)
                  }}
                >
                  <div className="eq-frozen-combined">
                    <div className="eq-asset-part">
                      {row['Asset_Link'] ? (
                        <a href={row['Asset_Link']} target="_blank" rel="noreferrer" className="eq-asset-link">
                          {row['Asset']}
                        </a>
                      ) : (
                        row['Asset']
                      )}
                    </div>
                    <div className="eq-area-part">{row['Area'] || 'N/A'}</div>
                  </div>
                  <div className="eq-phase-gap" />

                  {l2Visible && (
                    <>
                      {config.showL2Gate !== false && renderGateCells(row, 'L2', maxCols.l2Gate, 'checklist')}
                      <div className="eq-summary-cell" style={getDynamicStyle(config, phaseRules, row['L2 Overall Status'], 'checklist', true)}>
                        {row['L2 Overall Status'] || 'N/A'}
                      </div>
                      {expanded.l2 && config.showL2Supp !== false && renderSupportCells(row, 'L2', maxCols.l2, 'checklist')}
                      <div className="eq-phase-gap" />
                    </>
                  )}

                  {l3Visible && (
                    <>
                      {config.showL3Gate !== false && renderGateCells(row, 'L3', maxCols.l3Gate, 'checklist')}
                      <div className="eq-summary-cell" style={getDynamicStyle(config, phaseRules, row['L3 Overall Status'], 'checklist', true)}>
                        {row['L3 Overall Status'] || 'N/A'}
                      </div>
                      {expanded.l3 && config.showL3Supp !== false && renderSupportCells(row, 'L3', maxCols.l3, 'checklist')}
                      <div className="eq-phase-gap" />
                    </>
                  )}

                  {l4Visible && (
                    <>
                      {config.showL4Gate !== false && renderGateCells(row, 'L4', maxCols.l4Gate, 'test')}
                      <div className="eq-summary-cell" style={getDynamicStyle(config, phaseRules, row['L4 Overall Status'], 'test', true)}>
                        {row['L4 Overall Status'] || 'N/A'}
                      </div>
                      {expanded.l4 && config.showL4Supp !== false && renderSupportCells(row, 'L4', maxCols.l4, 'test')}
                      <div className="eq-phase-gap" />
                    </>
                  )}

                  <div className="eq-summary-cell" style={getDynamicStyle(config, phaseRules, issuesOpen.items.length, 'issue', false)}>
                    <OpenChips items={issuesOpen.items} />
                  </div>
                  {expanded.iss && renderIssueCells(row, maxCols.iss)}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      )}

      {filterCol !== null && filterAnchor && (
        <FilterDropdown
          colIndex={filterCol}
          top={filterAnchor.top}
          left={filterAnchor.left}
          values={activeAvailable}
          selected={activeFilters[filterCol]}
          onApply={(selected) => applyFilter(filterCol, selected, activeAvailable)}
          onClear={() => clearFilter(filterCol)}
          onClose={() => setFilterCol(null)}
        />
      )}

      {pdfOpen && (
        <EquipmentTrackerPdfModal
          rows={visibleRows.map((m) => m.row)}
          maxCols={maxCols}
          config={config}
          siteLabel={CURRENT_PROJECT}
          onClose={() => setPdfOpen(false)}
        />
      )}

      {configModalOpen && config && (
        <EquipmentTrackerSettingsModal
          config={config}
          phaseRules={phaseRules}
          scriptUrlSet={!!ctx.equipmentTrackerScriptUrl}
          onClose={() => setConfigModalOpen(false)}
          onSaved={() => void fn.trigger()}
        />
      )}
    </section>
  )
}

function StackedCell({
  val,
  link,
  type,
  config,
  phaseRules,
  className,
}: {
  val: string | undefined
  link: string | undefined
  type: CellType
  config: EquipmentTrackerConfig
  phaseRules: EqPhaseRule[]
  className: string
}) {
  const cell = parseStackedCell(val, link, type, config, phaseRules)
  if (!cell) {
    return (
      <div className={`eq-stacked ${className}`}>
        <div className="eq-stacked-id">-</div>
        <div className="eq-stacked-status" style={{ background: '#f5f5f5', color: '#616161' }}>
          -
        </div>
      </div>
    )
  }
  return (
    <div className={`eq-stacked ${className}`}>
      <div className="eq-stacked-id">
        {cell.link ? (
          <a href={cell.link} target="_blank" rel="noreferrer">
            {cell.id}
          </a>
        ) : (
          cell.id
        )}
      </div>
      <div className="eq-stacked-status eq-dyn-color" style={cell.style}>
        {cell.status}
      </div>
    </div>
  )
}

function OpenChips({ items }: { items: Array<{ id: string; link: string }> }) {
  if (!items.length) return <>-</>
  return (
    <>
      {items.map((it, i) => (
        <span key={it.id + i}>
          {i > 0 && ', '}
          {it.link ? (
            <a href={it.link} target="_blank" rel="noreferrer">
              {it.id}
            </a>
          ) : (
            it.id
          )}
        </span>
      ))}
    </>
  )
}

function FilterIcon({ col, active, onClick }: { col: number; active: boolean; onClick: (e: React.MouseEvent, col: number) => void }) {
  return (
    <button
      type="button"
      className={active ? 'eq-filter-icon active' : 'eq-filter-icon'}
      onClick={(e) => onClick(e, col)}
      aria-label={`Filter ${COLUMN_LABELS[col]}`}
      title={`Filter ${COLUMN_LABELS[col]}`}
    >
      ▼
    </button>
  )
}

function ExpandBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={active ? 'eq-expand-btn active' : 'eq-expand-btn'} onClick={onClick} aria-label="Toggle detail columns">
      {active ? '-' : '+'}
    </button>
  )
}

function FilterDropdown({
  colIndex,
  top,
  left,
  values,
  selected,
  onApply,
  onClear,
  onClose,
}: {
  colIndex: number
  top: number
  left: number
  values: string[]
  selected: Set<string> | undefined
  onApply: (vals: Set<string>) => void
  onClear: () => void
  onClose: () => void
}) {
  const [term, setTerm] = useState('')
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected ?? values))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onClose])

  const filtered = values.filter((v) => v.toLowerCase().includes(term.toLowerCase()))
  const allChecked = filtered.length > 0 && filtered.every((v) => draft.has(v))

  const dropdown = (
    <div className="eq-filter-dropdown" style={{ top, left }} ref={ref}>
      <input autoFocus type="text" placeholder="Search values…" value={term} onChange={(e) => setTerm(e.target.value)} />
      <label className="eq-filter-selectall">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={(e) => {
            const next = new Set(draft)
            filtered.forEach((v) => (e.target.checked ? next.add(v) : next.delete(v)))
            setDraft(next)
          }}
        />
        (Select All)
      </label>
      <div className="eq-filter-values">
        {filtered.map((v) => (
          <label key={v} className="eq-filter-val">
            <input
              type="checkbox"
              checked={draft.has(v)}
              onChange={(e) => {
                const next = new Set(draft)
                if (e.target.checked) next.add(v)
                else next.delete(v)
                setDraft(next)
              }}
            />
            <span>{v || '(Blank)'}</span>
          </label>
        ))}
        {filtered.length === 0 && <div className="wf-order-empty">No values.</div>}
      </div>
      <div className="eq-filter-actions">
        <button type="button" className="eq-filter-btn clear" onClick={onClear}>
          Clear
        </button>
        <button type="button" className="eq-filter-btn" onClick={() => onApply(draft)}>
          OK
        </button>
      </div>
    </div>
  )
  // Portaled to the .arcapp root for the same reason as FullscreenOverlay — this dropdown is
  // triggered from deep inside <main>'s own stacking context and needs to escape the grid's
  // overflow:auto clipping, not just the sidebar's z-index.
  return createPortal(dropdown, document.querySelector('.arcapp') ?? document.body)
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
