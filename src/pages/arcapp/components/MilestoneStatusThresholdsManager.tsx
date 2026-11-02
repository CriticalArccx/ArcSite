import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { StatusThresholds } from '../milestones'

type Props = {
  value: StatusThresholds
  canEdit: boolean
  loading: boolean
  onSave: (next: StatusThresholds) => Promise<void>
}

/**
 * The three pct breakpoints computeMilestoneProgress checks in order (Complete, then Go, then
 * Caution, else Hold) — editable here instead of being fixed at 100/70/40. Same
 * mirror-props-into-local-state / dirty-check / Save pattern as SubmittalExemptAssetsManager.
 */
export default function MilestoneStatusThresholdsManager({ value, canEdit, loading, onSave }: Props) {
  const [draft, setDraft] = useState<StatusThresholds>(value)
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const dirty = draft.complete !== value.complete || draft.go !== value.go || draft.caution !== value.caution
  const disabled = !canEdit || busy || loading

  async function save() {
    if (disabled) return
    setBusy(true)
    setMsg({ text: 'Saving…', cls: 'q-hint' })
    try {
      await onSave(draft)
      setMsg({ text: 'Saved app-wide.', cls: 'q-hint ok' })
    } catch (err) {
      setMsg({ text: 'Failed: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBusy(false)
    }
  }

  function field(key: keyof StatusThresholds, label: string) {
    return (
      <div className="form-field" style={{ marginBottom: 0 }}>
        <label>{label}</label>
        <input
          type="number"
          min={0}
          max={100}
          value={draft[key]}
          disabled={disabled}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
        />
      </div>
    )
  }

  return (
    <div style={{ marginTop: 26, maxWidth: 640 }}>
      <p className="wf-subtitle">Deliverable Status Thresholds</p>
      <div className="q-hint" style={{ marginTop: 0, marginBottom: 10 }}>
        A deliverable's computed % maps to a status: Complete at or above the first value, else Go at
        or above the second, else Caution at or above the third, else Hold. Keep them in descending
        order (Complete ≥ Go ≥ Caution) or the result gets hard to predict.
      </div>
      <div className="seal-row3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {field('complete', 'Complete ≥ %')}
        {field('go', 'Go ≥ %')}
        {field('caution', 'Caution ≥ %')}
      </div>
      <button
        className="seal-submit-btn"
        type="button"
        style={{ maxWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}
        disabled={disabled || !dirty}
        onClick={save}
      >
        <Save style={{ width: 15, height: 15 }} />
        Save
      </button>
      <div className={msg.cls}>{msg.text || (!canEdit ? 'Only admins can change settings.' : '')}</div>
    </div>
  )
}
