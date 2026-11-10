import { useState, type CSSProperties } from 'react'
import { Plus, X } from 'lucide-react'
import { useSaveEquipmentTrackerSettings } from '../../../lib/api'
import type { EqPhaseRule, EqStatusColor, EquipmentTrackerConfig } from '../../../lib/api'
import FullscreenOverlay from './FullscreenOverlay'

type ListKey =
  | 'openStatuses'
  | 'closedStatuses'
  | 'cxCompleteStatuses'
  | 'testOpenStatuses'
  | 'testClosedStatuses'
  | 'issueOpenStatuses'
  | 'issueClosedStatuses'
  | 'gatingIssues'
  | 'nonGatingIssues'

function StatusColorListEditor({
  label,
  items,
  defaultColor,
  onChange,
}: {
  label: string
  items: EqStatusColor[]
  defaultColor: string
  onChange: (next: EqStatusColor[]) => void
}) {
  function updateAt(i: number, patch: Partial<EqStatusColor>) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  function removeAt(i: number) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <p className="wf-subtitle" style={{ fontSize: 12 }}>
        {label}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Status text…"
              value={it.name}
              onChange={(e) => updateAt(i, { name: e.target.value })}
              style={{
                flex: 1,
                background: 'var(--bg-elev-2)',
                border: '1px solid var(--border-strong)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 12.5,
                padding: '6px 8px',
              }}
            />
            <input type="color" value={it.color} onChange={(e) => updateAt(i, { color: e.target.value })} style={{ width: 34, height: 30, padding: 2, cursor: 'pointer' }} />
            <button type="button" className="wf-remove" onClick={() => removeAt(i)} title="Remove">
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="wf-btn"
        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        onClick={() => onChange([...items, { name: '', color: defaultColor }])}
      >
        <Plus style={{ width: 12, height: 12 }} /> Add Status
      </button>
    </div>
  )
}

const RULE_INPUT_STYLE: CSSProperties = { width: '100%', minWidth: 70 }

function PhaseRuleRow({ rule, onChange, onRemove }: { rule: EqPhaseRule; onChange: (next: EqPhaseRule) => void; onRemove: () => void }) {
  const active = rule.active !== false && rule.active !== 'false' && rule.active !== 'FALSE'
  const incChk = rule.includeOpenCHKs === true || String(rule.includeOpenCHKs).toLowerCase() === 'true'
  const incGateIss = rule.includeOpenGatingIssues === true || String(rule.includeOpenGatingIssues).toLowerCase() === 'true'

  return (
    <tr>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={active} onChange={(e) => onChange({ ...rule, active: e.target.checked })} />
      </td>
      <td className="seal-preview-cell">
        <select value={rule.phase || 'L2'} onChange={(e) => onChange({ ...rule, phase: e.target.value })} style={RULE_INPUT_STYLE}>
          <option value="L2">L2</option>
          <option value="L3">L3</option>
          <option value="L4">L4</option>
        </select>
      </td>
      <td className="seal-preview-cell">
        <input type="text" placeholder="e.g. Complete" value={rule.prevStatus || ''} onChange={(e) => onChange({ ...rule, prevStatus: e.target.value })} style={RULE_INPUT_STYLE} />
      </td>
      <td className="seal-preview-cell">
        <input type="text" placeholder="e.g. <=0" value={rule.maxGate || ''} onChange={(e) => onChange({ ...rule, maxGate: e.target.value })} style={RULE_INPUT_STYLE} />
      </td>
      <td className="seal-preview-cell">
        <input type="text" placeholder="e.g. >0" value={rule.maxSupport || ''} onChange={(e) => onChange({ ...rule, maxSupport: e.target.value })} style={RULE_INPUT_STYLE} />
      </td>
      <td className="seal-preview-cell">
        <input
          type="text"
          placeholder="e.g. =0"
          title="Max closed checklists waiting for Cx Approval"
          value={rule.maxSupportPendingCx || ''}
          onChange={(e) => onChange({ ...rule, maxSupportPendingCx: e.target.value })}
          style={RULE_INPUT_STYLE}
        />
      </td>
      <td className="seal-preview-cell">
        <input type="text" placeholder="=0" value={rule.maxGatingIssues || ''} onChange={(e) => onChange({ ...rule, maxGatingIssues: e.target.value })} style={RULE_INPUT_STYLE} />
      </td>
      <td className="seal-preview-cell">
        <input
          type="text"
          placeholder="<=5"
          value={rule.maxNonGatingIssues || ''}
          onChange={(e) => onChange({ ...rule, maxNonGatingIssues: e.target.value })}
          style={RULE_INPUT_STYLE}
        />
      </td>
      <td className="seal-preview-cell">
        <input type="text" placeholder="Result" value={rule.resultingStatus || ''} onChange={(e) => onChange({ ...rule, resultingStatus: e.target.value })} style={RULE_INPUT_STYLE} />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={incChk} onChange={(e) => onChange({ ...rule, includeOpenCHKs: e.target.checked })} />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={incGateIss} onChange={(e) => onChange({ ...rule, includeOpenGatingIssues: e.target.checked })} />
      </td>
      <td>
        <input type="color" value={rule.color || '#e0e0e0'} onChange={(e) => onChange({ ...rule, color: e.target.value })} style={{ width: 34, height: 30, padding: 2, cursor: 'pointer' }} />
      </td>
      <td>
        <button type="button" className="wf-btn danger" style={{ padding: '4px 8px' }} onClick={onRemove}>
          <X style={{ width: 13, height: 13 }} />
        </button>
      </td>
    </tr>
  )
}

const DEFAULT_PHASE_RULE: EqPhaseRule = {
  active: true,
  phase: 'L2',
  prevStatus: '',
  maxGate: '',
  maxSupport: '',
  maxSupportPendingCx: '',
  maxGatingIssues: '',
  maxNonGatingIssues: '',
  resultingStatus: '',
  includeOpenCHKs: false,
  includeOpenGatingIssues: false,
  color: '#e0e0e0',
}

function headerField(label: string, value: string, onChange: (v: string) => void, placeholder?: string) {
  return (
    <div className="form-field" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

/**
 * System Config + Phase Rules Engine — LaunchPad's "Settings" modal, ported in full (added
 * 2026-10-29; see the Equipment Status Tracker section in api.ts for why Phase Rules specifically
 * need the Apps Script round trip this makes on save, not just a Supabase write). Field-for-field
 * match of LaunchPad's modal content; restyled to ArcSite's dark theme like the rest of this page.
 */
export default function EquipmentTrackerSettingsModal({
  config,
  phaseRules,
  scriptUrlSet,
  onClose,
  onSaved,
}: {
  config: EquipmentTrackerConfig
  phaseRules: EqPhaseRule[]
  scriptUrlSet: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const saveFn = useSaveEquipmentTrackerSettings()
  const [draft, setDraft] = useState<EquipmentTrackerConfig>(config)
  const [rules, setRules] = useState<EqPhaseRule[]>(phaseRules)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function patch(p: Partial<EquipmentTrackerConfig>) {
    setDraft((d) => ({ ...d, ...p }))
  }
  function patchHeaders(p: Partial<EquipmentTrackerConfig['customHeaders']>) {
    setDraft((d) => ({ ...d, customHeaders: { ...d.customHeaders, ...p } }))
  }
  function setList(key: ListKey, next: EqStatusColor[]) {
    setDraft((d) => ({ ...d, [key]: next }))
  }

  function updateRuleAt(i: number, next: EqPhaseRule) {
    setRules((r) => r.map((rule, idx) => (idx === i ? next : rule)))
  }
  function removeRuleAt(i: number) {
    setRules((r) => r.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await saveFn.trigger({ config: draft, phaseRules: rules }).result
      if (!result.syncedToSheet && rules.length > 0) {
        setNotice(
          'Config saved. Phase Rules were NOT synced to the Sheet — set the Equipment Tracker Apps Script URL in Settings first, or rule edits here won\'t actually take effect and may be overwritten by the next sync.',
        )
      } else {
        onSaved()
        onClose()
      }
    } catch (err) {
      setError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FullscreenOverlay title="Equipment Tracker — System Config" onClose={onClose}>
      {!scriptUrlSet && (
        <div className="q-hint" style={{ marginBottom: 16 }}>
          No Equipment Tracker Apps Script URL is set yet — Phase Rules below will save to Supabase
          display config but won&apos;t sync to the Sheet (where rule evaluation actually happens)
          until one is set in this page&apos;s own Settings drawer. Everything else on this page
          (phase names/toggles, status colors) works fine regardless.
        </div>
      )}

      <p className="wf-subtitle" style={{ marginTop: 0 }}>
        Global
      </p>
      <div className="seal-row3" style={{ gridTemplateColumns: '1fr 2fr', marginBottom: 18 }}>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label>Fallback Color</label>
          <input type="color" value={draft.fallbackColor} onChange={(e) => patch({ fallbackColor: e.target.value })} style={{ width: 44, height: 36, padding: 2, cursor: 'pointer' }} />
        </div>
        {headerField('Area Header Prefix', draft.customHeaders.areaPrefix, (v) => patchHeaders({ areaPrefix: v }), 'e.g. Area')}
      </div>

      <p className="wf-subtitle">Phase Setup &amp; Toggles</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 18 }}>
        <div>
          <p className="q-hint" style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Phase 1 (L2)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {headerField('Phase Name', draft.customHeaders.l2Phase, (v) => patchHeaders({ l2Phase: v }))}
            {headerField('Gate Header', draft.customHeaders.l2Gate, (v) => patchHeaders({ l2Gate: v }))}
            {headerField('Status Header', draft.customHeaders.l2Status, (v) => patchHeaders({ l2Status: v }))}
            <label className="wf-check-row">
              <input type="checkbox" checked={draft.showL2Gate} onChange={(e) => patch({ showL2Gate: e.target.checked })} /> Show Gate Column
            </label>
            <label className="wf-check-row">
              <input type="checkbox" checked={draft.showL2Supp} onChange={(e) => patch({ showL2Supp: e.target.checked })} /> Enable Support CLs
            </label>
          </div>
        </div>
        <div>
          <p className="q-hint" style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Phase 2 (L3)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {headerField('Phase Name', draft.customHeaders.l3Phase, (v) => patchHeaders({ l3Phase: v }))}
            {headerField('Gate Header', draft.customHeaders.l3Gate, (v) => patchHeaders({ l3Gate: v }))}
            {headerField('Status Header', draft.customHeaders.l3Status, (v) => patchHeaders({ l3Status: v }))}
            <label className="wf-check-row">
              <input type="checkbox" checked={draft.showL3Gate} onChange={(e) => patch({ showL3Gate: e.target.checked })} /> Show Gate Column
            </label>
            <label className="wf-check-row">
              <input type="checkbox" checked={draft.showL3Supp} onChange={(e) => patch({ showL3Supp: e.target.checked })} /> Enable Support CLs
            </label>
          </div>
        </div>
        <div>
          <p className="q-hint" style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Phase 3 (L4)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {headerField('Phase Name', draft.customHeaders.l4Phase, (v) => patchHeaders({ l4Phase: v }))}
            {headerField('Gate Header', draft.customHeaders.l4Gate, (v) => patchHeaders({ l4Gate: v }))}
            {headerField('Status Header', draft.customHeaders.l4Status, (v) => patchHeaders({ l4Status: v }))}
            <label className="wf-check-row">
              <input type="checkbox" checked={draft.showL4Gate} onChange={(e) => patch({ showL4Gate: e.target.checked })} /> Show Gate Column
            </label>
            <label className="wf-check-row">
              <input type="checkbox" checked={draft.showL4Supp} onChange={(e) => patch({ showL4Supp: e.target.checked })} /> Enable Support CLs
            </label>
          </div>
        </div>
        <div>
          <p className="q-hint" style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Global Issues
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {headerField('Phase Name', draft.customHeaders.issPhase, (v) => patchHeaders({ issPhase: v }))}
            {headerField('Status Header', draft.customHeaders.issStatus, (v) => patchHeaders({ issStatus: v }))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 18 }}>
        <div>
          <p className="wf-subtitle">Checklists (L2 &amp; L3)</p>
          <StatusColorListEditor label="Active / Open" items={draft.openStatuses} defaultColor="#fff9c4" onChange={(v) => setList('openStatuses', v)} />
          <StatusColorListEditor label="Completed / Closed" items={draft.closedStatuses} defaultColor="#c8e6c9" onChange={(v) => setList('closedStatuses', v)} />
          <StatusColorListEditor label="Cx Complete" items={draft.cxCompleteStatuses} defaultColor="#81c784" onChange={(v) => setList('cxCompleteStatuses', v)} />
        </div>
        <div>
          <p className="wf-subtitle">Tests (L4)</p>
          <StatusColorListEditor label="Active / Open" items={draft.testOpenStatuses} defaultColor="#fff9c4" onChange={(v) => setList('testOpenStatuses', v)} />
          <StatusColorListEditor label="Completed / Closed" items={draft.testClosedStatuses} defaultColor="#c8e6c9" onChange={(v) => setList('testClosedStatuses', v)} />
        </div>
        <div>
          <p className="wf-subtitle">Global Issues</p>
          <StatusColorListEditor label="Active / Open" items={draft.issueOpenStatuses} defaultColor="#ffcdd2" onChange={(v) => setList('issueOpenStatuses', v)} />
          <StatusColorListEditor label="Completed / Closed" items={draft.issueClosedStatuses} defaultColor="#c8e6c9" onChange={(v) => setList('issueClosedStatuses', v)} />
        </div>
        <div>
          <p className="wf-subtitle">Issue Severities</p>
          <StatusColorListEditor label="Gating Issues" items={draft.gatingIssues} defaultColor="#ffcdd2" onChange={(v) => setList('gatingIssues', v)} />
          <StatusColorListEditor label="Non-Gating Issues" items={draft.nonGatingIssues} defaultColor="#fff9c4" onChange={(v) => setList('nonGatingIssues', v)} />
        </div>
      </div>

      <p className="wf-subtitle">Phase Rules Engine</p>
      <div style={{ overflowX: 'auto', marginBottom: 10 }}>
        <table className="sched">
          <thead>
            <tr>
              <th>Active?</th>
              <th>Phase</th>
              <th>Req. Prev Status</th>
              <th title="Max Gate CL Open">Max Gate</th>
              <th title="Max Support CL Open">Max Supp</th>
              <th title="Max Support CL Closed but NOT Cx Complete">Max Supp Pend. Cx</th>
              <th title="Max Gating Issues Open">Max Gate Iss.</th>
              <th title="Max Non-Gating Issues Open">Max Non-Gate Iss.</th>
              <th>Result Status</th>
              <th title="Include Open CHKs Per Phase">Inc. Open CHKs</th>
              <th title="Include Open Gating Issues">Inc. Gate Iss.</th>
              <th>Color</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, i) => (
              <PhaseRuleRow key={i} rule={rule} onChange={(next) => updateRuleAt(i, next)} onRemove={() => removeRuleAt(i)} />
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setRules((r) => [...r, { ...DEFAULT_PHASE_RULE }])}>
        <Plus style={{ width: 13, height: 13 }} /> Add Rule
      </button>

      {notice && (
        <div className="q-hint" style={{ marginTop: 14 }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="q-hint err" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="seal-submit-btn" style={{ maxWidth: 220 }} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save & Sync to Sheet'}
        </button>
        <button className="wf-btn" style={{ padding: '0 16px' }} disabled={saving} onClick={onClose}>
          Cancel
        </button>
      </div>
    </FullscreenOverlay>
  )
}
