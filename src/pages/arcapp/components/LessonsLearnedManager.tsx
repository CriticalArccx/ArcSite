import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { useGetLessonsLearned, useSaveLessonLearned, useDeleteLessonLearned, LESSON_CATEGORIES } from '../../../lib/api'
import type { LessonLearned } from '../../../lib/api'
import { localIsoDate } from '../utils'

const ALL_CATEGORIES = 'All categories'

type FormState = { title: string; description: string; category: string; loggedAt: string }
function emptyForm(): FormState {
  return { title: '', description: '', category: LESSON_CATEGORIES[0], loggedAt: localIsoDate() }
}

/**
 * A quick, project-scoped log of things learned during commissioning — not asset/system-linked and
 * not an attachment-bearing record like Submittals/Joint Pack Photos, deliberately: this is meant
 * for "write it down before it's forgotten," not a formal root-cause record. Same
 * fetch/form/list/edit/delete shape as SubmittalsManager, trimmed down (no file, no asset picker,
 * no notes log).
 */
export default function LessonsLearnedManager({ canEdit }: { canEdit: boolean }) {
  const listFn = useGetLessonsLearned()
  const saveFn = useSaveLessonLearned()
  const deleteFn = useDeleteLessonLearned()

  function load() {
    void listFn.trigger()
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lessons = listFn.data ?? []
  const state = listFn.error ? 'error' : !listFn.data ? 'loading' : 'ready'
  const loading = listFn.loading

  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)
  const filteredLessons = useMemo(
    () => (categoryFilter === ALL_CATEGORIES ? lessons : lessons.filter((l) => l.category === categoryFilter)),
    [lessons, categoryFilter],
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function openNew() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError('')
    setFormOpen(true)
  }
  function openEdit(l: LessonLearned) {
    setEditingId(l.id)
    setForm({ title: l.title, description: l.description, category: l.category, loggedAt: l.loggedAt || localIsoDate() })
    setFormError('')
    setFormOpen(true)
  }
  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setFormError('')
  }

  async function save() {
    if (!form.title.trim()) {
      setFormError('A title is required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await saveFn.trigger({
        id: editingId ?? undefined,
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        loggedAt: form.loggedAt || localIsoDate(),
      }).result
      load()
      closeForm()
    } catch (err) {
      setFormError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete(id: string) {
    setSaving(true)
    try {
      await deleteFn.trigger({ id }).result
      setDeleteId(null)
      load()
    } catch {
      /* keep confirm open */
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel" id="lessonslearned">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Lessons Learned</h2>
          <span className="panel-count">{state === 'ready' ? `${lessons.length} entries` : '—'}</span>
        </div>
        <div className="panel-header-right" style={{ gap: 10 }}>
          {canEdit && !formOpen && (
            <button type="button" className="panel-action-btn" onClick={openNew}>
              <Plus style={{ width: 15, height: 15 }} />
              New Entry
            </button>
          )}
          <button className={loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={load} aria-label="Refresh lessons learned">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        A running log of things worth remembering for next time — not tied to a specific asset or
        system.{!canEdit ? ' Sign in as an authorized editor to add or edit.' : ''}
      </div>

      <div className="panel-body">
        {state === 'loading' && <div className="q-hint">Loading…</div>}
        {state === 'error' && (
          <div className="table-error" style={{ padding: '16px 0' }}>
            Couldn&apos;t load lessons learned.
            <br />
            <button className="retry-btn" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {state === 'ready' && (
          <>
            {formOpen && canEdit && (
              <div className="wf-form">
                <div className="form-field">
                  <label>Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Chiller startup delayed by missing vendor rep"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="seal-row3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-field">
                    <label>Category</label>
                    <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                      {LESSON_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Date</label>
                    <input type="date" value={form.loggedAt} onChange={(e) => setForm((f) => ({ ...f, loggedAt: e.target.value }))} />
                  </div>
                </div>
                <div className="form-field">
                  <label>Description</label>
                  <textarea
                    placeholder="What happened, and what should be done differently next time?"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    style={{ minHeight: 80 }}
                  />
                </div>

                {formError && <div className="q-hint err">{formError}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="seal-submit-btn" style={{ maxWidth: 200 }} disabled={saving} onClick={save}>
                    {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Entry'}
                  </button>
                  <button className="wf-btn" style={{ padding: '0 16px' }} disabled={saving} onClick={closeForm}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <div className="form-field" style={{ marginBottom: 0, minWidth: 200 }}>
                <label>Filter by category</label>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value={ALL_CATEGORIES}>{ALL_CATEGORIES}</option>
                  {LESSON_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredLessons.length === 0 && !formOpen ? (
              <div className="q-hint" style={{ padding: '8px 0' }}>
                {lessons.length === 0
                  ? `No lessons logged yet.${canEdit ? ' Add one to get started.' : ''}`
                  : 'No entries match this category filter.'}
              </div>
            ) : (
              <div className="wf-list">
                {filteredLessons.map((l) => (
                  <div className="wf-card" key={l.id}>
                    <div className="wf-card-head" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="wf-order-label" style={{ fontSize: 14 }}>
                            {l.title}
                          </span>
                          <span className="status-chip muted">{l.category}</span>
                        </div>
                        {l.description && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>{l.description}</div>}
                        <div className="q-hint" style={{ marginTop: 6 }}>
                          {l.loggedAt ? new Date(l.loggedAt + 'T00:00:00').toLocaleDateString() : '—'}
                          {l.loggedBy ? ` · logged by ${l.loggedBy}` : ''}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="wf-actions">
                          {deleteId === l.id ? (
                            <div className="wf-confirm">
                              Delete?
                              <button className="wf-btn danger" disabled={saving} onClick={() => confirmDelete(l.id)}>
                                {saving ? '…' : 'Yes, delete'}
                              </button>
                              <button className="wf-btn" disabled={saving} onClick={() => setDeleteId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => openEdit(l)}>
                                <Pencil style={{ width: 12, height: 12 }} /> Edit
                              </button>
                              <button
                                className="wf-btn danger"
                                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                                onClick={() => setDeleteId(l.id)}
                              >
                                <Trash2 style={{ width: 12, height: 12 }} /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
