import { useEffect, useState } from 'react'
import { useGetCxAlloySettingsSheet } from '../../../lib/api'
import type { CxAlloySettingsData } from '../../../lib/api'
import { hasCapability } from '../../../lib/project'

type Props = {
  label: string
  hint: string
  /** Which CxAlloy Settings column this picker offers — Checklist Status Name or Issue Status Name. */
  column: keyof CxAlloySettingsData
  /** Currently-selected values, parsed from the arcapp_settings CSV. */
  value: string[]
  canEdit: boolean
  loading: boolean
  onSave: (values: string[]) => Promise<void>
}

/**
 * Multi-select sourced live from the "CxAlloy Settings" tab of the STY4A API Database sheet,
 * instead of a free-text comma-separated field. Replaces what used to be a plain <Field> input
 * whose "available options" hint was just hardcoded text.
 *
 * The live CxAlloy Settings list doesn't always match the status names actually used in the
 * Checklists/Issues data today (a real mismatch found while building this — e.g. Issue Priority
 * says "P0 - Critical" etc. there but issues are currently labeled Low/Moderate/High) — so any
 * currently-selected value that ISN'T in the live list is still shown and still selected, just
 * flagged, rather than silently dropped.
 */
export default function CxAlloyStatusPicker({ label, hint, column, value, canEdit, loading, onSave }: Props) {
  const available = hasCapability('cxAlloyActions')
  const fn = useGetCxAlloySettingsSheet()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (available) void fn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!available) {
    return (
      <div style={{ marginBottom: 22, maxWidth: 560 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>{label}</label>
        <div className="q-hint">Not available — this project's Apps Script doesn't have the ArcSite getCxAlloySettings action added yet.</div>
      </div>
    )
  }

  const options = (fn.data as CxAlloySettingsData | undefined)?.[column] ?? []
  const stale = value.filter((v) => !options.includes(v))
  const disabled = !canEdit || loading || saving

  async function toggle(name: string, checked: boolean) {
    const next = checked ? [...value, name] : value.filter((v) => v !== name)
    setSaving(true)
    setError('')
    try {
      await onSave(next)
    } catch (err) {
      setError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginBottom: 22, maxWidth: 560 }}>
      <label style={{ display: 'block', marginBottom: 8 }}>{label}</label>

      {fn.loading && <div className="q-hint">Loading statuses from CxAlloy Settings…</div>}
      {fn.error && (
        <div className="q-hint err">
          Couldn&apos;t load CxAlloy Settings ({fn.error}).{' '}
          <button className="retry-btn" onClick={() => void fn.trigger()}>
            Retry
          </button>
        </div>
      )}

      {fn.data && (
        <div className="wf-check-grid">
          {options.map((name) => (
            <label key={name} className="wf-check-row">
              <input type="checkbox" checked={value.includes(name)} disabled={disabled} onChange={(e) => toggle(name, e.target.checked)} />
              {name}
            </label>
          ))}
          {stale.map((name) => (
            <label key={name} className="wf-check-row" title="Selected, but not currently in the CxAlloy Settings list">
              <input type="checkbox" checked disabled={disabled} onChange={(e) => toggle(name, e.target.checked)} />
              {name} <span className="wf-tag-disabled">not in CxAlloy Settings</span>
            </label>
          ))}
        </div>
      )}

      <div className="q-hint">{hint}</div>
      {error && <div className="q-hint err">{error}</div>}
      {!canEdit && <div className="q-hint">Only admins can change settings.</div>}
    </div>
  )
}
