import { Plus, X } from 'lucide-react'
import type { MilestoneCriterion, NetaFlag, NetaTab } from '../../../lib/api'
import { NETA_FLAGS_BY_TAB, NETA_FLAG_LABELS } from '../milestones'
import MultiSelectPicker from './MultiSelectPicker'

const MODULE_LABEL: Record<MilestoneCriterion['module'], string> = {
  checklists: 'Checklists',
  issues: 'Issues',
  submittals: 'Submittals',
  neta: 'NETA Tracker',
  jointpack: 'Joint Pack Photos',
}

function defaultCriterion(module: MilestoneCriterion['module']): MilestoneCriterion {
  if (module === 'neta') return { module: 'neta', tab: 'Submissions', zones: [], flag: 'submittedToGoogle' }
  if (module === 'jointpack') return { module, scope: { by: 'assets', assets: [] } }
  if (module === 'issues') return { module, scope: { by: 'assets', assets: [] }, targetStatuses: [], priorities: [] }
  return { module, scope: { by: 'assets', assets: [] }, targetStatuses: [] }
}

type Options = {
  assets: string[]
  areas: string[]
  checklistStatuses: string[]
  issueStatuses: string[]
  issuePriorities: string[]
  submittalStatuses: readonly string[]
  netaZones: string[]
  netaEnabled: boolean
  jointPackEnabled: boolean
}

/**
 * The editable list of a milestone's completion criteria — each row picks a module (Checklists/
 * Issues/Submittals/NETA Tracker/Joint Pack Photos), then the fields that module needs to decide
 * which of its rows count. Shared between the add and edit forms in MilestonesPage.tsx.
 */
export default function MilestoneCriteriaBuilder({
  criteria,
  onChange,
  disabled,
  options,
}: {
  criteria: MilestoneCriterion[]
  onChange: (next: MilestoneCriterion[]) => void
  disabled?: boolean
  options: Options
}) {
  const moduleOptions = (Object.keys(MODULE_LABEL) as MilestoneCriterion['module'][]).filter(
    (m) => (m !== 'neta' || options.netaEnabled) && (m !== 'jointpack' || options.jointPackEnabled),
  )

  function updateAt(i: number, next: MilestoneCriterion) {
    onChange(criteria.map((c, idx) => (idx === i ? next : c)))
  }
  function removeAt(i: number) {
    onChange(criteria.filter((_, idx) => idx !== i))
  }
  function addRow() {
    onChange([...criteria, defaultCriterion(moduleOptions[0])])
  }

  const statusOptionsFor = (module: 'checklists' | 'issues' | 'submittals'): string[] =>
    module === 'checklists' ? options.checklistStatuses : module === 'issues' ? options.issueStatuses : [...options.submittalStatuses]

  return (
    <div className="form-field">
      <label>Completion criteria</label>
      <div className="q-hint" style={{ marginTop: 0, marginBottom: 10 }}>
        This deliverable's % is the average of every criterion below — each one checks how many of
        the scoped items already sit in one of the target statuses. No criteria means no automatic
        progress yet.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {criteria.map((c, i) => (
          <div
            key={i}
            style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elev-2)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <select
                value={c.module}
                disabled={disabled}
                onChange={(e) => updateAt(i, defaultCriterion(e.target.value as MilestoneCriterion['module']))}
                style={{ maxWidth: 220 }}
              >
                {moduleOptions.map((m) => (
                  <option key={m} value={m}>
                    {MODULE_LABEL[m]}
                  </option>
                ))}
              </select>
              <button type="button" className="wf-remove" disabled={disabled} onClick={() => removeAt(i)} title="Remove criterion">
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {c.module === 'neta' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="seal-row3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label>Tab</label>
                    <select
                      value={c.tab}
                      disabled={disabled}
                      onChange={(e) => {
                        const tab = e.target.value as NetaTab
                        updateAt(i, { ...c, tab, flag: NETA_FLAGS_BY_TAB[tab as 'Submissions' | 'Returned Files'][0] })
                      }}
                    >
                      <option value="Submissions">Submissions</option>
                      <option value="Returned Files">Returned Files</option>
                    </select>
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label>Target</label>
                    <select value={c.flag} disabled={disabled} onChange={(e) => updateAt(i, { ...c, flag: e.target.value as NetaFlag })}>
                      {NETA_FLAGS_BY_TAB[c.tab as 'Submissions' | 'Returned Files'].map((f) => (
                        <option key={f} value={f}>
                          {NETA_FLAG_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <MultiSelectPicker
                  label={`Zones (${c.zones.length === 0 ? 'all zones' : `${c.zones.length} selected`})`}
                  options={options.netaZones}
                  selected={c.zones}
                  onChange={(zones) => updateAt(i, { ...c, zones })}
                  placeholder="Search zones… (none selected = all zones)"
                  disabled={disabled}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="ts-filter-group">
                  <span className="ts-filter-label">Scope by:</span>
                  <button
                    type="button"
                    className={`ts-filter-btn${c.scope.by === 'assets' ? ' active' : ''}`}
                    disabled={disabled}
                    onClick={() => updateAt(i, { ...c, scope: { by: 'assets', assets: [] } })}
                  >
                    Asset
                  </button>
                  <button
                    type="button"
                    className={`ts-filter-btn${c.scope.by === 'areas' ? ' active' : ''}`}
                    disabled={disabled}
                    onClick={() => updateAt(i, { ...c, scope: { by: 'areas', areas: [] } })}
                  >
                    Area
                  </button>
                </div>
                {c.scope.by === 'assets' ? (
                  <MultiSelectPicker
                    label={`Assets (${c.scope.assets.length} selected)`}
                    options={options.assets}
                    selected={c.scope.assets}
                    onChange={(assets) => updateAt(i, { ...c, scope: { by: 'assets', assets } })}
                    placeholder="Search assets…"
                    disabled={disabled}
                  />
                ) : (
                  <MultiSelectPicker
                    label={`Areas (${c.scope.areas.length} selected)`}
                    options={options.areas}
                    selected={c.scope.areas}
                    onChange={(areas) => updateAt(i, { ...c, scope: { by: 'areas', areas } })}
                    placeholder="Search areas… (every asset placed there counts)"
                    disabled={disabled}
                  />
                )}
                {c.module === 'issues' && (
                  <MultiSelectPicker
                    label={`Priority (${c.priorities.length === 0 ? 'all priorities' : `${c.priorities.length} selected`})`}
                    options={options.issuePriorities}
                    selected={c.priorities}
                    onChange={(priorities) => updateAt(i, { ...c, priorities })}
                    placeholder="Search priorities… (none selected = all priorities)"
                    disabled={disabled}
                  />
                )}
                {c.module === 'jointpack' ? (
                  <div className="q-hint" style={{ margin: 0 }}>
                    Counts as done when a Joint Pack # has all three sides (Top/Side/Bottom)
                    photographed — Joint Pack Photos has no status list to pick a target from.
                  </div>
                ) : (
                  <MultiSelectPicker
                    label={`Target status (${c.targetStatuses.length} selected)`}
                    options={statusOptionsFor(c.module)}
                    selected={c.targetStatuses}
                    onChange={(targetStatuses) => updateAt(i, { ...c, targetStatuses })}
                    placeholder="Search statuses…"
                    disabled={disabled}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="wf-btn"
        style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}
        disabled={disabled}
        onClick={addRow}
      >
        <Plus style={{ width: 13, height: 13 }} />
        Add Criterion
      </button>
    </div>
  )
}
