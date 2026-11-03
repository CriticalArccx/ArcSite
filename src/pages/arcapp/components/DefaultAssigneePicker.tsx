import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useGetAuthorizedUsersDirectory } from '../../../lib/api'
import type { PersonOption, DefaultAssignee } from '../../../lib/api'
import type { Team } from '../types'
import PersonSelect from './PersonSelect'

type Mode = 'none' | 'team' | 'person'

function modeOf(value: DefaultAssignee): Mode {
  if (value.teamId) return 'team'
  if (value.email || value.name) return 'person'
  return 'none'
}

type Props = {
  label: string
  hint: string
  value: DefaultAssignee
  teams: Team[]
  canEdit: boolean
  loading: boolean
  onSave: (value: DefaultAssignee) => Promise<void>
}

/**
 * Inline "team or person" picker for a Settings-level default assignee — same at-most-one-of
 * team-or-person shape as AssignPopover (used for individual Checklist/Issue/task assignment),
 * but rendered inline (no popover/portal) since Settings has no anchor row to position against.
 *
 * "A specific person" is a dropdown of arcapp_authorized_users, not a free-text name/email — the
 * whole point of a default assignee is that they can sign in and see the resulting summary card in
 * their own To-Dos, which requires being on that list in the first place, so there's no legitimate
 * case for typing someone who isn't on it.
 */
export default function DefaultAssigneePicker({ label, hint, value, teams, canEdit, loading, onSave }: Props) {
  const usersFn = useGetAuthorizedUsersDirectory()
  const [mode, setMode] = useState<Mode>(() => modeOf(value))
  const [teamId, setTeamId] = useState(value.teamId ?? '')
  const [personEmail, setPersonEmail] = useState(value.email ?? '')
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  // This control is disabled for non-admins anyway (canEdit === isAdmin in SettingsPanel), so
  // don't even fetch until then.
  useEffect(() => {
    if (canEdit) void usersFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

  useEffect(() => {
    setMode(modeOf(value))
    setTeamId(value.teamId ?? '')
    setPersonEmail(value.email ?? '')
  }, [value])

  const users = (usersFn.data as PersonOption[] | undefined) ?? []

  const dirty =
    mode !== modeOf(value) ||
    (mode === 'team' && teamId !== (value.teamId ?? '')) ||
    (mode === 'person' && personEmail !== (value.email ?? ''))
  const disabled = !canEdit || busy || loading

  function pickPerson(email: string) {
    setPersonEmail(email)
  }

  async function save() {
    if (mode === 'team' && !teamId) {
      setMsg({ text: 'Pick a team, or switch to No default.', cls: 'q-hint err' })
      return
    }
    if (mode === 'person' && !personEmail) {
      setMsg({ text: 'Pick a person, or switch to No default.', cls: 'q-hint err' })
      return
    }
    const person = users.find((u) => u.email.toLowerCase() === personEmail.toLowerCase())
    setBusy(true)
    setMsg({ text: 'Saving…', cls: 'q-hint' })
    try {
      await onSave({
        teamId: mode === 'team' ? teamId : null,
        name: mode === 'person' ? person?.name || value.name || '' : null,
        email: mode === 'person' ? personEmail : null,
      })
      setMsg({ text: 'Saved.', cls: 'q-hint ok' })
    } catch (err) {
      setMsg({ text: 'Failed: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 18, maxWidth: 560 }}>
      <label style={{ display: 'block', marginBottom: 8 }}>{label}</label>
      <div className="wf-check-grid" style={{ marginBottom: 8 }}>
        <label className="wf-check-row">
          <input type="radio" name={`${label}-mode`} checked={mode === 'none'} disabled={disabled} onChange={() => setMode('none')} />
          No default
        </label>
        <label className="wf-check-row">
          <input type="radio" name={`${label}-mode`} checked={mode === 'team'} disabled={disabled} onChange={() => setMode('team')} />
          A team
        </label>
        <label className="wf-check-row">
          <input type="radio" name={`${label}-mode`} checked={mode === 'person'} disabled={disabled} onChange={() => setMode('person')} />
          A specific person
        </label>
      </div>
      {mode === 'team' && (
        <select value={teamId} disabled={disabled} onChange={(e) => setTeamId(e.target.value)} style={{ marginBottom: 8 }}>
          <option value="">— Select a team —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {mode === 'person' && (
        <div style={{ marginBottom: 8 }}>
          {usersFn.error && (
            <div className="q-hint err">
              Couldn&apos;t load authorized users ({usersFn.error}).{' '}
              <button className="retry-btn" onClick={() => void usersFn.trigger()}>
                Retry
              </button>
            </div>
          )}
          <PersonSelect users={users} loadingUsers={usersFn.loading || !usersFn.data} value={personEmail} onChange={pickPerson} disabled={disabled} staleName={value.name} />
        </div>
      )}
      <button
        className="seal-submit-btn"
        type="button"
        style={{ maxWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}
        disabled={disabled || !dirty}
        onClick={save}
      >
        <Save style={{ width: 15, height: 15 }} />
        Save
      </button>
      <div className="q-hint">{hint}</div>
      {msg.text && <div className={msg.cls}>{msg.text}</div>}
      {!canEdit && !msg.text && <div className="q-hint">Only admins can change settings.</div>}
    </div>
  )
}
