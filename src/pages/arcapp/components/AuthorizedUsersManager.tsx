import { useEffect, useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { useGetAuthorizedUsers, useSaveAuthorizedUser, useBulkAddAuthorizedUsers, useDeleteAuthorizedUser } from '../../../lib/api'
import type { AuthorizedUser, UserRole } from '../../../lib/api'
import { PROJECTS } from '../../../lib/project'
import type { ProjectKey } from '../../../lib/project'
import FilterButtonGroup, { ALL, toggleFilterValue } from './FilterButtonGroup'

type Props = { canEdit: boolean }

const PROJECT_OPTIONS = [ALL, ...PROJECTS.map((p) => p.key)]

/** `null` (unrestricted) <-> {All}; a specific array <-> that array as a Set — same {All}-sentinel
 * convention FilterButtonGroup/toggleFilterValue already use elsewhere, reused here so "who can
 * sign in" and "which projects can they touch" share one interaction pattern. */
function toProjectSet(allowedProjects: ProjectKey[] | null): Set<string> {
  return allowedProjects === null ? new Set([ALL]) : new Set(allowedProjects)
}
function fromProjectSet(set: Set<string>): ProjectKey[] | null {
  return set.has(ALL) ? null : (Array.from(set) as ProjectKey[])
}

type ParsedLine = { email: string; name: string; role: UserRole }

/** One person per line, flexible separator (comma or tab, so a column pasted straight out of a
 * spreadsheet works unchanged): `email`, `email, name`, or `email, name, role`. A trailing role
 * field only overrides defaultRole if it actually reads as "admin" or "editor" (case-insensitive)
 * — anything else is treated as part of the name instead of silently defaulting. Lines with no
 * '@' are dropped (not silently — the caller reports how many came back that way). */
function parseBulkLines(text: string, defaultRole: UserRole): { parsed: ParsedLine[]; invalidCount: number } {
  const parsed: ParsedLine[] = []
  let invalidCount = 0
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const parts = line.split(/[,\t]/).map((p) => p.trim()).filter((p) => p !== '')
    const email = parts[0] ?? ''
    if (!email.includes('@')) {
      invalidCount++
      continue
    }
    const last = parts[parts.length - 1]?.toLowerCase()
    const hasRoleField = parts.length > 1 && (last === 'admin' || last === 'editor')
    const role: UserRole = hasRoleField ? (last as UserRole) : defaultRole
    const name = parts.slice(1, hasRoleField ? parts.length - 1 : parts.length).join(' ')
    parsed.push({ email, name, role })
  }
  return { parsed, invalidCount }
}

/**
 * Manages arcapp_authorized_users — ArcApp's entire access-control list: who may sign in at all,
 * AND whether they're an admin (can change Settings) or an editor (can't). `canEdit` here is
 * actually `isAdmin` from the caller (SettingsPanel.tsx) — managing this list is itself an
 * admin-only action, same reasoning as why an editor can't grant themselves adminship. Anyone not
 * on this list gets signed back out immediately after Google/magic-link auth succeeds, before ever
 * seeing the app at all — see src/lib/useCurrentUser.ts and AppShell.tsx's `!user` gate.
 */
export default function AuthorizedUsersManager({ canEdit }: Props) {
  const listFn = useGetAuthorizedUsers()
  const saveFn = useSaveAuthorizedUser()
  const bulkFn = useBulkAddAuthorizedUsers()
  const deleteFn = useDeleteAuthorizedUser()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('editor')
  const [projectsDraft, setProjectsDraft] = useState<Set<string>>(new Set([ALL]))
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null)
  const [projectsSavingId, setProjectsSavingId] = useState<string | null>(null)

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkDefaultRole, setBulkDefaultRole] = useState<UserRole>('editor')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })

  // RLS only lets a non-editor read their OWN row (see policies.sql) — fetching this as a
  // non-editor would just come back empty, which reads as "the list is empty" rather than "you
  // can't see it," so don't even ask until canEdit is true.
  useEffect(() => {
    if (canEdit) void listFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

  const users = (listFn.data as AuthorizedUser[] | undefined) ?? []
  const state = !canEdit ? 'hidden' : listFn.error ? 'error' : listFn.loading || !listFn.data ? 'loading' : 'ready'

  async function addUser() {
    const trimmed = email.trim()
    if (!trimmed) {
      setFormError('An email is required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await saveFn.trigger({ email: trimmed, name: name.trim(), role, allowedProjects: fromProjectSet(projectsDraft) }).result
      setEmail('')
      setName('')
      setRole('editor')
      setProjectsDraft(new Set([ALL]))
      void listFn.trigger()
    } catch (err) {
      setFormError('Failed to add: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  const { parsed: bulkParsed, invalidCount: bulkInvalidCount } = parseBulkLines(bulkText, bulkDefaultRole)

  async function addBulk() {
    if (bulkParsed.length === 0) {
      setBulkMsg({ text: 'Paste at least one line with a valid email.', cls: 'q-hint err' })
      return
    }
    setBulkBusy(true)
    setBulkMsg({ text: 'Adding…', cls: 'q-hint' })
    try {
      const { added, skipped } = await bulkFn.trigger({ entries: bulkParsed }).result
      const parts = [`Added ${added.length}.`]
      if (skipped.length) parts.push(`Skipped ${skipped.length} already on the list (${skipped.join(', ')}) — unchanged, not overwritten.`)
      if (bulkInvalidCount) parts.push(`Ignored ${bulkInvalidCount} line(s) with no valid email.`)
      setBulkMsg({ text: parts.join(' '), cls: added.length ? 'q-hint ok' : 'q-hint' })
      if (added.length) setBulkText('')
      void listFn.trigger()
    } catch (err) {
      setBulkMsg({ text: 'Failed: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBulkBusy(false)
    }
  }

  async function changeRole(u: AuthorizedUser, nextRole: UserRole) {
    if (nextRole === u.role) return
    setRoleSavingId(u.id)
    try {
      await saveFn.trigger({ id: u.id, email: u.email, name: u.name, role: nextRole, allowedProjects: u.allowedProjects }).result
      void listFn.trigger()
    } catch (err) {
      window.alert('Failed to change role: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setRoleSavingId(null)
    }
  }

  async function changeProjects(u: AuthorizedUser, nextProjects: ProjectKey[] | null) {
    setProjectsSavingId(u.id)
    try {
      await saveFn.trigger({ id: u.id, email: u.email, name: u.name, role: u.role, allowedProjects: nextProjects }).result
      void listFn.trigger()
    } catch (err) {
      window.alert('Failed to change project access: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setProjectsSavingId(null)
    }
  }

  async function confirmDelete(id: string) {
    setSaving(true)
    try {
      await deleteFn.trigger({ id }).result
      setDeleteId(null)
      void listFn.trigger()
    } catch {
      /* keep confirm open */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 26 }}>
      <p className="wf-subtitle">Authorized Users</p>
      <div className="q-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Only these emails can sign in to ArcApp at all (Google or magic link) — this list, each
        person's role, and which projects they can reach is the entire access-control model for the
        site now. <b style={{ color: 'var(--text)' }}>Admin</b> can change Settings (including this list); <b style={{ color: 'var(--text)' }}>Editor</b> can
        do everything else but not that. <b style={{ color: 'var(--text)' }}>Projects</b> defaults to All — narrow it to
        keep someone out of a project's data and off its switcher entirely.
      </div>

      {!canEdit && (
        <div className="q-hint">
          Sign in as an admin to view or manage this list — it&apos;s not readable otherwise, by
          design.
        </div>
      )}

      {canEdit && (
        <>
          <div className="seal-row3" style={{ gridTemplateColumns: '1.1fr 1fr auto auto', marginBottom: 8 }}>
            <input type="email" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="text" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <button
              className="seal-add-btn"
              style={{ width: 'auto', margin: 0, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6 }}
              disabled={saving}
              onClick={addUser}
            >
              <Plus style={{ width: 14, height: 14 }} /> Add
            </button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <FilterButtonGroup
              label="Projects"
              options={PROJECT_OPTIONS}
              selected={projectsDraft}
              onToggle={(v) => setProjectsDraft((s) => toggleFilterValue(s, v))}
            />
          </div>
          {formError && <div className="q-hint err">{formError}</div>}

          <button
            type="button"
            className="wf-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: bulkOpen ? 10 : 16 }}
            onClick={() => setBulkOpen((v) => !v)}
          >
            <Users style={{ width: 13, height: 13 }} />
            {bulkOpen ? 'Hide bulk add' : 'Bulk add'}
          </button>

          {bulkOpen && (
            <div className="wf-form" style={{ marginBottom: 16 }}>
              <div className="q-hint" style={{ marginTop: 0 }}>
                One person per line: <code>email</code>, <code>email, name</code>, or{' '}
                <code>email, name, role</code> (role must read &quot;admin&quot; or &quot;editor&quot;, else the
                default below applies) — paste straight from a spreadsheet column, comma or tab
                separated both work. An email already on the list is left untouched, not
                overwritten. Bulk-added people start with access to all projects — narrow that
                per-person below afterward if needed.
              </div>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'jane@company.com, Jane Smith, editor\njohn@company.com'}
                rows={6}
                style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, marginBottom: 8 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="q-hint" style={{ margin: 0 }}>
                    Default role (when a line doesn&apos;t specify one):
                  </span>
                  <select value={bulkDefaultRole} onChange={(e) => setBulkDefaultRole(e.target.value as UserRole)}>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <span className="q-hint" style={{ margin: 0 }}>
                  {bulkParsed.length} valid line{bulkParsed.length === 1 ? '' : 's'}
                  {bulkInvalidCount ? `, ${bulkInvalidCount} without a valid email` : ''}
                </span>
              </div>
              <button
                type="button"
                className="seal-submit-btn"
                style={{ maxWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                disabled={bulkBusy || bulkParsed.length === 0}
                onClick={addBulk}
              >
                <Plus style={{ width: 15, height: 15 }} />
                {bulkBusy ? 'Adding…' : `Add ${bulkParsed.length || ''} ${bulkParsed.length === 1 ? 'person' : 'people'}`}
              </button>
              {bulkMsg.text && <div className={bulkMsg.cls}>{bulkMsg.text}</div>}
            </div>
          )}
        </>
      )}

      {state === 'loading' && <div className="q-hint">Loading…</div>}
      {state === 'error' && (
        <div className="table-error" style={{ padding: '12px 0' }}>
          Couldn&apos;t load authorized users ({listFn.error}).
          <br />
          <button className="retry-btn" onClick={() => void listFn.trigger()}>
            Retry
          </button>
        </div>
      )}
      {state === 'ready' && (
        <div className="wf-order-list">
          {users.length === 0 ? (
            <div className="wf-order-empty">No authorized users yet — nobody can sign in until at least one is added.</div>
          ) : (
            users.map((u) => (
              <div className="wf-order-item" key={u.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <span className="wf-order-label">
                    {u.email}
                    {u.name ? <span className="q-hint" style={{ margin: '0 0 0 8px' }}>{u.name}</span> : null}
                  </span>
                  {canEdit ? (
                    <select
                      value={u.role}
                      disabled={roleSavingId === u.id}
                      onChange={(e) => void changeRole(u, e.target.value as UserRole)}
                      style={{ marginRight: 8 }}
                    >
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className="tag norm" style={{ marginRight: 8 }}>
                      {u.role === 'admin' ? 'Admin' : 'Editor'}
                    </span>
                  )}
                  {canEdit &&
                    (deleteId === u.id ? (
                      <div className="wf-confirm">
                        Remove?
                        <button className="wf-btn danger" disabled={saving} onClick={() => confirmDelete(u.id)}>
                          {saving ? '…' : 'Yes'}
                        </button>
                        <button className="wf-btn" disabled={saving} onClick={() => setDeleteId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className="wf-remove" title="Remove" onClick={() => setDeleteId(u.id)}>
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </button>
                    ))}
                </div>
                {canEdit ? (
                  <FilterButtonGroup
                    label="Projects"
                    options={PROJECT_OPTIONS}
                    selected={toProjectSet(u.allowedProjects)}
                    onToggle={(v) => void changeProjects(u, fromProjectSet(toggleFilterValue(toProjectSet(u.allowedProjects), v)))}
                  />
                ) : (
                  <div className="q-hint" style={{ margin: 0 }}>
                    Projects: {u.allowedProjects === null ? 'All' : u.allowedProjects.join(', ')}
                  </div>
                )}
                {projectsSavingId === u.id && <span className="q-hint">Saving…</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
