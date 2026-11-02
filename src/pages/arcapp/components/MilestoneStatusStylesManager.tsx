import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { MilestoneStatusStyles } from '../../../lib/api'
import type { Milestone } from '../types'

type Props = {
  value: MilestoneStatusStyles
  canEdit: boolean
  loading: boolean
  onSave: (next: MilestoneStatusStyles) => Promise<void>
}

const ORDER: Milestone['status'][] = ['complete', 'go', 'caution', 'hold']

function stylesEqual(a: MilestoneStatusStyles, b: MilestoneStatusStyles): boolean {
  return ORDER.every((k) => a[k].label === b[k].label && a[k].color === b[k].color)
}

/**
 * What each status bucket is actually called and colored — editable here instead of the fixed
 * GO/CAUTION/HOLD/COMPLETE text and green/amber/red this shipped with (e.g. relabel "Hold" to
 * "Blocked" for this project's own vocabulary). Which bucket a milestone falls into is still
 * decided by MilestoneStatusThresholdsManager above this — this only controls how that bucket is
 * displayed. Same mirror-props-into-local-state / dirty-check / Save pattern as that component.
 */
export default function MilestoneStatusStylesManager({ value, canEdit, loading, onSave }: Props) {
  const [draft, setDraft] = useState<MilestoneStatusStyles>(value)
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const dirty = !stylesEqual(draft, value)
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

  return (
    <div style={{ marginTop: 22, maxWidth: 640 }}>
      <p className="wf-subtitle">Deliverable Status Labels &amp; Colors</p>
      <div className="q-hint" style={{ marginTop: 0, marginBottom: 10 }}>
        What each status bucket is called and what color it shows as — the thresholds above decide
        which bucket a deliverable falls into, this just controls how that bucket looks.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ORDER.map((key) => (
          <div key={key} style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <div className="form-field" style={{ marginBottom: 0, flex: 1 }}>
              <label>{key === 'complete' ? 'Complete' : key === 'go' ? 'Go' : key === 'caution' ? 'Caution' : 'Hold'} label</label>
              <input
                type="text"
                value={draft[key].label}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...d[key], label: e.target.value } }))}
              />
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Color</label>
              <input
                type="color"
                value={draft[key].color}
                disabled={disabled}
                style={{ width: 44, height: 36, padding: 2, cursor: disabled ? 'default' : 'pointer' }}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...d[key], color: e.target.value } }))}
              />
            </div>
            <span
              className="status-chip"
              style={{ color: draft[key].color, background: `${draft[key].color}24`, whiteSpace: 'nowrap' }}
            >
              {draft[key].label || '—'}
            </span>
          </div>
        ))}
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
