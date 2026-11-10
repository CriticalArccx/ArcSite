import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useGetNetaTrackerData, useUpdateNetaField } from '../../../lib/api'
import type { NetaReturnedRow, NetaSubmissionRow, NetaTab } from '../../../lib/api'
import { CURRENT_PROJECT, projectLabel } from '../../../lib/project'
import type { ShellContext } from '../ShellContext'
import CapabilityNotice from './CapabilityNotice'
import ModuleSettingsSection from './ModuleSettingsSection'
import DefaultAssigneePicker from './DefaultAssigneePicker'
import { Field, ToggleField } from './SettingsControls'

type TabKey = 'submissions' | 'returned'

// ---------------------------------------------------------------------------
// Zone > Area > Asset Category tree — mirrors the marker rows the live sheet uses in place of
// native row grouping. Built generically off the fields every NETA row shares; only how each
// leaf row itself renders differs between the two tabs.
// ---------------------------------------------------------------------------

type NetaTreeRow = { row: number; zone: string; area: string; category: string; documentName: string }

type CategoryGroup<T> = { key: string; label: string; rows: T[] }
type AreaGroup<T> = { key: string; label: string; categories: Array<CategoryGroup<T>> }
type ZoneGroup<T> = { key: string; label: string; areas: Array<AreaGroup<T>> }

function buildTree<T extends NetaTreeRow>(rows: T[]): Array<ZoneGroup<T>> {
  const zoneMap = new Map<string, Map<string, Map<string, T[]>>>()
  for (const r of rows) {
    const z = r.zone || 'Ungrouped'
    const a = r.area || 'Ungrouped'
    const c = r.category || 'Ungrouped'
    if (!zoneMap.has(z)) zoneMap.set(z, new Map())
    const areaMap = zoneMap.get(z)!
    if (!areaMap.has(a)) areaMap.set(a, new Map())
    const catMap = areaMap.get(a)!
    if (!catMap.has(c)) catMap.set(c, [])
    catMap.get(c)!.push(r)
  }
  const zones: Array<ZoneGroup<T>> = []
  for (const [z, areaMap] of zoneMap) {
    const areas: Array<AreaGroup<T>> = []
    for (const [a, catMap] of areaMap) {
      const categories: Array<CategoryGroup<T>> = []
      for (const [c, catRows] of catMap) categories.push({ key: `${z}::${a}::${c}`, label: c, rows: catRows })
      areas.push({ key: `${z}::${a}`, label: a, categories })
    }
    zones.push({ key: z, label: z, areas })
  }
  return zones
}

function NetaTree<T extends NetaTreeRow>({
  rows,
  expanded,
  onToggle,
  forceOpen,
  renderRow,
}: {
  rows: T[]
  expanded: Set<string>
  onToggle: (key: string) => void
  forceOpen: boolean
  renderRow: (row: T) => React.ReactNode
}) {
  const zones = useMemo(() => buildTree(rows), [rows])
  const isOpen = (key: string) => forceOpen || expanded.has(key)

  if (rows.length === 0) return <div className="q-hint">No items match.</div>

  // Only one "ZONE HEADER" exists in the sheet today — skip that wrapper level entirely rather
  // than force an extra, permanently-open click for a grouping that isn't doing anything yet.
  const showZones = zones.length > 1

  const renderAreas = (areas: Array<AreaGroup<T>>) =>
    areas.map((area) => {
      const areaOpen = isOpen(area.key)
      const areaCount = area.categories.reduce((s, c) => s + c.rows.length, 0)
      return (
        <div className="neta-group" key={area.key}>
          <button type="button" className="neta-group-head" onClick={() => onToggle(area.key)}>
            {areaOpen ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
            <span className="neta-group-label">{area.label}</span>
            <span className="panel-count">{areaCount}</span>
          </button>
          {areaOpen && (
            <div className="neta-subgroups">
              {area.categories.map((cat) => {
                const catOpen = isOpen(cat.key)
                return (
                  <div className="neta-group neta-subgroup" key={cat.key}>
                    <button type="button" className="neta-group-head neta-subgroup-head" onClick={() => onToggle(cat.key)}>
                      {catOpen ? <ChevronDown style={{ width: 13, height: 13 }} /> : <ChevronRight style={{ width: 13, height: 13 }} />}
                      <span className="neta-group-label">{cat.label}</span>
                      <span className="panel-count">{cat.rows.length}</span>
                    </button>
                    {catOpen && <div className="neta-rows">{cat.rows.map(renderRow)}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    })

  if (!showZones) return <div className="neta-tree">{zones[0] ? renderAreas(zones[0].areas) : null}</div>

  return (
    <div className="neta-tree">
      {zones.map((zone) => {
        const zoneOpen = isOpen(zone.key)
        return (
          <div className="neta-group" key={zone.key}>
            <button type="button" className="neta-group-head" onClick={() => onToggle(zone.key)}>
              {zoneOpen ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
              <span className="neta-group-label">{zone.label}</span>
            </button>
            {zoneOpen && <div className="neta-subgroups">{renderAreas(zone.areas)}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field editors — each writes straight back to the live sheet cell it mirrors (see
// updateNetaField in api.ts). Optimistic with rollback, same shape as SettingsPanel's
// ToggleField/Field.
// ---------------------------------------------------------------------------

function NetaCheckbox({
  tab,
  netaRow,
  field,
  label,
  value,
}: {
  tab: NetaTab
  netaRow: NetaTreeRow
  field: string
  label: string
  value: boolean
}) {
  const fn = useUpdateNetaField()
  const [local, setLocal] = useState(value)
  const [err, setErr] = useState('')
  useEffect(() => setLocal(value), [value])

  async function toggle() {
    const next = !local
    setLocal(next)
    setErr('')
    try {
      await fn.trigger({ tab, row: netaRow.row, field, value: next, expectedDocumentName: netaRow.documentName }).result
    } catch (e) {
      setLocal(!next)
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <label className="neta-check" title={err || undefined}>
      <input type="checkbox" checked={local} disabled={fn.loading} onChange={() => void toggle()} />
      {label}
      {err && <span className="q-hint err" style={{ marginLeft: 4 }}>failed</span>}
    </label>
  )
}

/** Stamp Present / Uploaded to ACC on Returned Files: the sheet has no checkbox at all here while
 * the row's Issues column isn't "None" (the cell literally holds the text "N/A") — the script
 * refuses to write either field in that state too. Render the same fixed tag the sheet shows
 * instead of a checkbox that would be misleading either way (checked implies resolved, unchecked
 * implies "not yet" — neither is true here). */
function NetaCheckboxOrNA(props: { tab: NetaTab; netaRow: NetaTreeRow; field: string; label: string; value: boolean | 'N/A' }) {
  if (props.value === 'N/A') {
    return (
      <span className="neta-check neta-na" title="Not applicable while this row has an open issue">
        <span className="tag norm">N/A</span> {props.label}
      </span>
    )
  }
  return <NetaCheckbox tab={props.tab} netaRow={props.netaRow} field={props.field} label={props.label} value={props.value} />
}

function NetaCommentField({ tab, netaRow, value }: { tab: NetaTab; netaRow: NetaTreeRow; value: string }) {
  const fn = useUpdateNetaField()
  const [local, setLocal] = useState(value)
  const [err, setErr] = useState('')
  useEffect(() => setLocal(value), [value])
  const dirty = local !== value

  async function save() {
    if (!dirty) return
    setErr('')
    try {
      await fn.trigger({ tab, row: netaRow.row, field: 'comments', value: local, expectedDocumentName: netaRow.documentName }).result
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="neta-comments">
      <input type="text" placeholder="Comments…" value={local} onChange={(e) => setLocal(e.target.value)} onBlur={() => void save()} />
      {fn.loading && <span className="q-hint">Saving…</span>}
      {err && <span className="q-hint err">{err}</span>}
    </div>
  )
}

type NetaLinkedRow = NetaTreeRow & { submittedDate: string; folderLocation: string; folderLocationUrl: string; documentLinkUrl: string }

/** The sheet's Document Name cell is itself the `=HYPERLINK(...)` — opening the file straight
 * from the sheet click and opening it here both land on the same Drive "view" URL. Falls back to
 * plain text if a row's Document Link cell somehow isn't a HYPERLINK formula. */
function NetaDocTitle({ row }: { row: NetaLinkedRow & { documentName: string } }) {
  if (!row.documentLinkUrl) return <span className="neta-row-title">{row.documentName}</span>
  return (
    <a className="neta-row-title oi-title" href={row.documentLinkUrl} target="_blank" rel="noreferrer">
      {row.documentName}
    </a>
  )
}

function NetaRowMeta({ row }: { row: NetaLinkedRow }) {
  return (
    <div className="neta-row-meta">
      {row.submittedDate && <span>{row.submittedDate}</span>}
      {row.folderLocation &&
        (row.folderLocationUrl ? (
          <a className="tag norm neta-folder-link" href={row.folderLocationUrl} target="_blank" rel="noreferrer">
            {row.folderLocation}
          </a>
        ) : (
          <span className="tag norm">{row.folderLocation}</span>
        ))}
    </div>
  )
}

function SubmissionRow({ row }: { row: NetaSubmissionRow }) {
  return (
    <div className="neta-row">
      <div className="neta-row-main">
        <NetaDocTitle row={row} />
        <NetaRowMeta row={row} />
      </div>
      <div className="neta-row-fields">
        <NetaCheckbox tab="Submissions" netaRow={row} field="clericalReview" label="Clerical Review" value={row.clericalReview} />
        <NetaCheckbox tab="Submissions" netaRow={row} field="submittedToGoogle" label="Submitted to Google" value={row.submittedToGoogle} />
        <NetaCheckbox tab="Submissions" netaRow={row} field="issuesFound" label="Issues Found" value={row.issuesFound} />
      </div>
      <NetaCommentField tab="Submissions" netaRow={row} value={row.comments} />
    </div>
  )
}

function ReturnedRow({ row }: { row: NetaReturnedRow }) {
  return (
    <div className="neta-row">
      <div className="neta-row-main">
        <NetaDocTitle row={row} />
        <NetaRowMeta row={row} />
        {row.issues && row.issues.toLowerCase() !== 'none' && <span className="status-chip caution">{row.issues}</span>}
      </div>
      <div className="neta-row-fields">
        <NetaCheckbox tab="Returned Files" netaRow={row} field="technicalReview" label="Technical Review" value={row.technicalReview} />
        <NetaCheckboxOrNA tab="Returned Files" netaRow={row} field="stampPresent" label="Stamp Present" value={row.stampPresent} />
        <NetaCheckbox tab="Returned Files" netaRow={row} field="netaCompleted" label="Neta Completed" value={row.netaCompleted} />
        <NetaCheckboxOrNA tab="Returned Files" netaRow={row} field="uploadedToAcc" label="Uploaded to ACC" value={row.uploadedToAcc} />
      </div>
      <NetaCommentField tab="Returned Files" netaRow={row} value={row.comments} />
    </div>
  )
}

/**
 * Mimics the "STY4 NETA Tracker" Google Sheet's Submissions/Returned Files tabs — same Zone >
 * Area > Asset Category grouping, same checkboxes, same Comments field — with every edit here
 * writing straight back to that live sheet (see updateNetaField in api.ts) instead of ArcSite
 * keeping a separate copy. Gated by the per-project `netaTrackerEnabled` Settings toggle (see
 * ShellContext) rather than a project.ts capability, so an admin can turn it on for a new site.
 */
export default function NetaTrackerPanel() {
  const ctx = useOutletContext<ShellContext>()
  const available = ctx.netaTrackerEnabled
  const fn = useGetNetaTrackerData()

  useEffect(() => {
    if (available) void fn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!available) {
    return (
      <CapabilityNotice
        feature="NETA Tracker"
        id="netatracker"
        reason="This project doesn't have a NETA Tracker sheet/script set up yet."
      />
    )
  }

  const data = fn.data
  const state = fn.error ? 'error' : fn.loading || !data ? 'loading' : 'ready'

  const [tab, setTab] = useState<TabKey>('submissions')
  const [search, setSearch] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const submissions = useMemo(() => data?.submissions ?? [], [data])
  const returnedFiles = useMemo(() => data?.returnedFiles ?? [], [data])

  const q = search.trim().toLowerCase()
  const filteredSubmissions = useMemo(
    () =>
      submissions.filter((r) => {
        if (!showCompleted && r.submittedToGoogle) return false
        if (!q) return true
        return r.documentName.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.area.toLowerCase().includes(q)
      }),
    [submissions, showCompleted, q],
  )
  const filteredReturned = useMemo(
    () =>
      returnedFiles.filter((r) => {
        if (!showCompleted && r.uploadedToAcc === true) return false
        if (!q) return true
        return r.documentName.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.area.toLowerCase().includes(q)
      }),
    [returnedFiles, showCompleted, q],
  )

  const activeTotal = tab === 'submissions' ? submissions.length : returnedFiles.length
  const activeFiltered = tab === 'submissions' ? filteredSubmissions.length : filteredReturned.length

  return (
    <section className="panel" id="netatracker">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">NETA Tracker</h2>
          <span className="panel-count">{state === 'ready' ? `${activeFiltered.toLocaleString()} of ${activeTotal.toLocaleString()}` : '—'}</span>
        </div>
        <div className="panel-header-right">
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh NETA Tracker">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        Synced live from <b style={{ color: 'var(--text-muted)' }}>{projectLabel(CURRENT_PROJECT)} NETA Tracker · {tab === 'submissions' ? 'Submissions' : 'Returned Files'}</b>
        {data?.syncedAt ? ` — as of ${new Date(data.syncedAt).toLocaleString()}.` : '.'} Edits here are written straight back to that sheet.
      </div>
      <div style={{ padding: '0 20px 12px' }}>
        <ModuleSettingsSection>
          <Field
            label="NETA Tracker — Apps Script Web App URL"
            hint="The /exec URL from that project's NETA Tracker Apps Script deployment (Deploy > Manage deployments)."
            initial={ctx.netaTrackerScriptUrl}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(v) => ctx.onSaveSetting('neta_tracker_script_url', v)}
          />
          <div className="q-hint" style={{ marginBottom: 12 }}>
            Powers the "Your To-Dos" widget's NETA markers. "Still open" isn't configurable here —
            it's the same not-yet-completed definition this page itself uses (Submissions: not yet
            Submitted to Google; Returned Files: not yet Uploaded to ACC).
          </div>
          <ToggleField
            label="NETA Submissions To-Do"
            hint="Turns on the NETA Submissions default-assignee summary card and My Tasks entries."
            initial={ctx.netaSubmissionsTodoEnabled}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(v) => ctx.onSaveSetting('neta_submissions_todo_enabled', v ? 'true' : '')}
          />
          <DefaultAssigneePicker
            label="NETA Submissions — default assignee"
            hint="When set and at least one submission is still open, this team/person gets a single 'NETA Submissions need to be reviewed' card in Your To-Dos."
            value={ctx.netaSubmissionsDefaultAssignee}
            teams={ctx.teams}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(v) => ctx.onSaveDefaultAssignee('neta_submissions_default_assignee', v)}
          />
          <ToggleField
            label="NETA Returned Files To-Do"
            hint="Turns on the NETA Returned Files default-assignee summary card and My Tasks entries."
            initial={ctx.netaReturnedTodoEnabled}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(v) => ctx.onSaveSetting('neta_returned_todo_enabled', v ? 'true' : '')}
          />
          <DefaultAssigneePicker
            label="NETA Returned Files — default assignee"
            hint="When set and at least one returned file is still open, this team/person gets a single 'NETA Returned Files need to be reviewed' card in Your To-Dos."
            value={ctx.netaReturnedDefaultAssignee}
            teams={ctx.teams}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(v) => ctx.onSaveDefaultAssignee('neta_returned_default_assignee', v)}
          />
        </ModuleSettingsSection>
      </div>

      <div className="panel-body">
        <div className="neta-tabs">
          <button type="button" className={tab === 'submissions' ? 'neta-tab active' : 'neta-tab'} onClick={() => setTab('submissions')}>
            Submissions
          </button>
          <button type="button" className={tab === 'returned' ? 'neta-tab active' : 'neta-tab'} onClick={() => setTab('returned')}>
            Returned Files
          </button>
        </div>

        {state === 'loading' && <div className="q-hint" style={{ marginTop: 14 }}>Loading…</div>}
        {state === 'error' && (
          <div className="table-error" style={{ marginTop: 14, padding: '12px 0' }}>
            Couldn&apos;t load NETA Tracker data ({fn.error}).
            <br />
            <button className="retry-btn" onClick={() => void fn.trigger()}>
              Retry
            </button>
          </div>
        )}

        {state === 'ready' && (
          <>
            <div className="oi-filters" style={{ marginTop: 14 }}>
              <input
                type="text"
                className="oi-search"
                placeholder={`Search ${activeTotal.toLocaleString()} document${activeTotal === 1 ? '' : 's'}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="wf-check-row" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
                Show completed
              </label>
            </div>

            {tab === 'submissions' ? (
              <NetaTree rows={filteredSubmissions} expanded={expanded} onToggle={toggleExpand} forceOpen={!!q} renderRow={(r) => <SubmissionRow key={r.row} row={r} />} />
            ) : (
              <NetaTree rows={filteredReturned} expanded={expanded} onToggle={toggleExpand} forceOpen={!!q} renderRow={(r) => <ReturnedRow key={r.row} row={r} />} />
            )}
          </>
        )}
      </div>
    </section>
  )
}
