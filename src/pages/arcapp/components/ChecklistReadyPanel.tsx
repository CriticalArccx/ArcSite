import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useGetChecklists, cxAlloyChecklistUrl } from '../../../lib/api'
import { hasCapability, CURRENT_PROJECT, projectLabel } from '../../../lib/project'
import type { ShellContext } from '../ShellContext'
import CapabilityNotice from './CapabilityNotice'
import ModuleSettingsSection from './ModuleSettingsSection'
import CxAlloyStatusPicker from './CxAlloyStatusPicker'
import DefaultAssigneePicker from './DefaultAssigneePicker'
import { ToggleField } from './SettingsControls'

type Row = {
  checklist_id: string
  number: string
  name: string
  asset_name: string
  type_name: string
  status: string
  discipline: string
  assigned_name: string
  date_created: string
}

const ALL_TYPES = 'All types'

export default function ChecklistReadyPanel() {
  const ctx = useOutletContext<ShellContext>()
  const { cxAlloyLinkBase } = ctx
  const available = hasCapability('cxAlloyActions')
  const fn = useGetChecklists()
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES)

  useEffect(() => {
    if (available) void fn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!available) {
    return (
      <CapabilityNotice
        feature="Checklists"
        id="checklists"
        reason="This project's Apps Script doesn't have the ArcSite getChecklists action added yet."
      />
    )
  }

  const data = fn.data as { rows: Row[]; readyStatuses: string[] } | undefined
  const rows = data?.rows ?? []
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'

  // Derived from whatever's actually loaded (the statuses selected in Settings), not from the
  // CxAlloy Settings tab's Checklist Type list — that list doesn't currently match the type
  // names real checklists use, so a type-filter option pulled from there could filter to zero.
  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.type_name).filter(Boolean))).sort(), [rows])

  const f = filter.trim().toLowerCase()
  const filtered = rows.filter(
    (r) =>
      (typeFilter === ALL_TYPES || r.type_name === typeFilter) &&
      (!f || (r.number + r.name + r.asset_name + r.type_name + r.discipline + r.assigned_name).toLowerCase().includes(f)),
  )

  return (
    <section className="panel" id="checklists">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Checklist Ready</h2>
          <span className="panel-count">{state === 'ready' ? `${rows.length} ready` : '— ready'}</span>
          {data?.readyStatuses?.length ? (
            <span className="conn-pill ready">
              <span className="led" /> {data.readyStatuses.join(', ')}
            </span>
          ) : null}
        </div>
        <div className="panel-header-right">
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh checklists">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        Ready for CxA review · source: <b style={{ color: 'var(--text-muted)' }}>{projectLabel(CURRENT_PROJECT)} API Database · Checklists</b>
      </div>
      <div style={{ padding: '0 20px 12px' }}>
        <ModuleSettingsSection>
          <CxAlloyStatusPicker
            label="Checklist Ready — status(es) that count as ready for CxA review"
            hint={`Pulled live from the CxAlloy Settings tab (${projectLabel(CURRENT_PROJECT)} API Database). Checked statuses show up in the list below. Also defines Checklist To-Do below: any status NOT checked here counts as still open.`}
            column="checklistStatuses"
            value={ctx.checklistReadyStatuses}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(values) => ctx.onSaveSetting('checklist_ready_statuses', values.join(', '))}
          />
          <div className="q-hint" style={{ marginBottom: 12 }}>
            Powers the "Your To-Dos" widget's Checklist markers — a default-assignee summary card,
            plus any individually-assigned item still shows in "My Tasks".
          </div>
          <ToggleField
            label="Checklist To-Do"
            hint="Turns on the Checklists default-assignee summary card and My Tasks entries."
            initial={ctx.checklistTodoEnabled}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(v) => ctx.onSaveSetting('checklist_todo_enabled', v ? 'true' : '')}
          />
          <DefaultAssigneePicker
            label="Checklists — default assignee"
            hint="When set and at least one checklist is ready for review (per above), this team/person gets a single 'Checklists need to be reviewed' card in Your To-Dos."
            value={ctx.checklistDefaultAssignee}
            teams={ctx.teams}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(v) => ctx.onSaveDefaultAssignee('checklist_default_assignee', v)}
          />
        </ModuleSettingsSection>
      </div>
      {state === 'ready' && (
        <div style={{ padding: '0 20px 12px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Filter by number, name, asset, discipline, company..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              flex: '1 1 320px', maxWidth: 380, background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: '9px 13px',
            }}
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: '9px 13px',
            }}
          >
            <option value={ALL_TYPES}>{ALL_TYPES}</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="panel-body no-pad">
        <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table className="sched">
            <thead>
              <tr>
                <th>#</th>
                <th>Checklist</th>
                <th>Asset</th>
                <th>Type</th>
                <th>Discipline</th>
                <th>Assigned</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {state === 'loading' &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr className="skeleton-row" key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j}><div className="skeleton-bar" style={{ width: '80%' }} /></td>
                    ))}
                  </tr>
                ))}
              {state === 'error' && (
                <tr><td colSpan={8} className="table-error">Couldn&apos;t load checklists ({fn.error}).<br /><button className="retry-btn" onClick={() => void fn.trigger()}>Retry</button></td></tr>
              )}
              {state === 'ready' && filtered.length === 0 && (
                <tr><td colSpan={8} className="table-empty">No checklists match.</td></tr>
              )}
              {state === 'ready' && filtered.map((r, i) => (
                <tr key={`${r.checklist_id || r.number}-${i}`}>
                  <td className="tag-cell">
                    {r.checklist_id && cxAlloyLinkBase ? (
                      <a href={cxAlloyChecklistUrl(r.checklist_id, cxAlloyLinkBase)} target="_blank" rel="noopener noreferrer">
                        {r.number}
                      </a>
                    ) : (
                      r.number
                    )}
                  </td>
                  <td>{r.name}</td>
                  <td className="discipline-cell">{r.asset_name}</td>
                  <td className="discipline-cell">{r.type_name}</td>
                  <td className="discipline-cell">{r.discipline || '—'}</td>
                  <td className="discipline-cell">{r.assigned_name || '—'}</td>
                  <td><span className="status-chip go">{r.status}</span></td>
                  <td className="discipline-cell">{r.date_created || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
