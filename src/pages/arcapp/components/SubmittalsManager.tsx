import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, Pencil, Trash2, RefreshCw, Paperclip, ExternalLink, Download, AlertTriangle, ChevronDown, ChevronUp, Ban } from 'lucide-react'
import {
  useGetAssetOptions,
  useGetSubmittalsList,
  useSaveSubmittalRecord,
  useDeleteSubmittalRecord,
  useUploadSubmittalFile,
  useAddSubmittalNote,
  SUBMITTAL_STATUSES,
} from '../../../lib/api'
import type { Submittal } from '../../../lib/api'
import { CURRENT_PROJECT } from '../../../lib/project'
import type { ShellContext } from '../ShellContext'
import { localIsoDate } from '../utils'
import MultiSelectPicker from './MultiSelectPicker'
import ModuleSettingsSection from './ModuleSettingsSection'
import SubmittalExemptAssetsManager from './SubmittalExemptAssetsManager'

const ALL_STATUSES = 'All statuses'

function statusClass(s: string): string {
  const t = (s || '').toLowerCase()
  if (t === 'approved') return 'go'
  if (t === 'rejected') return 'hold'
  if (t === 'in review') return 'caution'
  return 'muted'
}

type FormState = { title: string; reviewStatus: string; assets: string[] }
const EMPTY_FORM: FormState = { title: '', reviewStatus: SUBMITTAL_STATUSES[0], assets: [] }

/**
 * "Notes" is an append-only log now, not a single overwritable field — opening this shows every
 * note ever left on the submittal (newest first), with an "Add Note" box for editors at the top.
 */
function SubmittalNotesLog({ submittal, canEdit, onChanged }: { submittal: Submittal; canEdit: boolean; onChanged: () => void }) {
  const addFn = useAddSubmittalNote()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  async function addNote() {
    const text = draft.trim()
    if (!text) return
    setError('')
    try {
      await addFn.trigger({ id: submittal.id, text }).result
      setDraft('')
      onChanged()
    } catch (err) {
      setError('Failed to add note: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const count = submittal.notesLog.length

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        className="wf-link-btn"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onClick={() => setOpen((v) => !v)}
      >
        Notes ({count})
        {open ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
      </button>

      {open && (
        <div className="wf-form" style={{ marginTop: 8 }}>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
              <textarea
                placeholder="Add a note…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{ flex: 1, minHeight: 40 }}
              />
              <button
                type="button"
                className="seal-add-btn"
                style={{ width: 'auto', margin: 0 }}
                disabled={addFn.loading || !draft.trim()}
                onClick={addNote}
              >
                {addFn.loading ? 'Adding…' : 'Add Note'}
              </button>
            </div>
          )}
          {error && <div className="q-hint err">{error}</div>}

          {count === 0 ? (
            <div className="wf-order-empty">No notes yet.</div>
          ) : (
            <div className="wf-order-list">
              {[...submittal.notesLog].reverse().map((n, i) => (
                <div className="wf-order-item" key={i} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div style={{ fontSize: 13 }}>{n.text}</div>
                  <div className="q-hint" style={{ margin: 0 }}>
                    {n.author || 'Unknown'} · {n.at ? new Date(n.at).toLocaleString() : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SubmittalsManager({ canEdit }: { canEdit: boolean }) {
  const ctx = useOutletContext<ShellContext>()
  const assetsFn = useGetAssetOptions()
  const listFn = useGetSubmittalsList()
  const saveFn = useSaveSubmittalRecord()
  const deleteFn = useDeleteSubmittalRecord()
  const uploadFn = useUploadSubmittalFile()

  function load() {
    void assetsFn.trigger()
    void listFn.trigger()
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const assets = (assetsFn.data as string[] | undefined) ?? []
  const submittals = listFn.data ?? []
  const exemptAssets = ctx.submittalExemptAssets
  const state = assetsFn.error || listFn.error ? 'error' : !assetsFn.data || !listFn.data ? 'loading' : 'ready'
  const loading = assetsFn.loading || listFn.loading

  // Assets that don't need a submittal at all (marked exempt in Settings) never count against
  // the total, so "missing" only ever flags assets that genuinely still need one.
  const missingAssets = useMemo(() => {
    const exemptSet = new Set(exemptAssets)
    const covered = new Set(submittals.flatMap((s) => s.assets))
    return assets.filter((a) => !exemptSet.has(a) && !covered.has(a))
  }, [assets, exemptAssets, submittals])

  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES)
  const filteredSubmittals = useMemo(
    () => (statusFilter === ALL_STATUSES ? submittals : submittals.filter((s) => s.reviewStatus === statusFilter)),
    [submittals, statusFilter],
  )

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [existingFile, setExistingFile] = useState<{ url: string; name: string } | null>(null)
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setExistingFile(null)
    setPickedFile(null)
    setFormError('')
    setFormOpen(true)
  }
  function openEdit(s: Submittal) {
    setEditingId(s.id)
    setForm({ title: s.title, reviewStatus: s.reviewStatus || SUBMITTAL_STATUSES[0], assets: [...s.assets] })
    setExistingFile(s.fileUrl ? { url: s.fileUrl, name: s.fileName || s.fileUrl } : null)
    setPickedFile(null)
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
    if (form.assets.length === 0) {
      setFormError('Select at least one asset this submittal applies to.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      let fileUrl = existingFile?.url ?? ''
      let fileName = existingFile?.name ?? ''
      if (pickedFile) {
        const uploaded = await uploadFn.trigger({ file: pickedFile }).result
        fileUrl = uploaded.url
        fileName = uploaded.name
      }
      await saveFn.trigger({
        id: editingId ?? undefined,
        title: form.title.trim(),
        fileUrl,
        fileName,
        assets: form.assets,
        reviewStatus: form.reviewStatus,
      }).result
      load()
      closeForm()
    } catch (err) {
      setFormError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(s: Submittal, reviewStatus: string) {
    setStatusBusyId(s.id)
    try {
      await saveFn.trigger({
        id: s.id,
        title: s.title,
        fileUrl: s.fileUrl,
        fileName: s.fileName,
        assets: s.assets,
        reviewStatus,
      }).result
      load()
    } finally {
      setStatusBusyId(null)
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

  async function exportFiltered() {
    const withFiles = filteredSubmittals.filter((s) => s.fileUrl)
    if (!withFiles.length) {
      setExportError('None of the currently filtered submittals have a file attached.')
      return
    }
    setExporting(true)
    setExportError('')
    try {
      // Loaded on first use so the zip library isn't in every page load's bundle (ARC-321).
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const usedNames = new Set<string>()
      for (const s of withFiles) {
        const res = await fetch(s.fileUrl)
        if (!res.ok) throw new Error(`Couldn't download "${s.title}" (HTTP ${res.status})`)
        const blob = await res.blob()
        const base = s.fileName || `${s.title}.bin`
        let name = base
        let n = 1
        while (usedNames.has(name)) {
          const dot = base.lastIndexOf('.')
          name = dot > 0 ? `${base.slice(0, dot)} (${n})${base.slice(dot)}` : `${base} (${n})`
          n += 1
        }
        usedNames.add(name)
        zip.file(name, blob)
      }
      const archive = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(archive)
      const suffix = statusFilter === ALL_STATUSES ? 'all' : statusFilter.toLowerCase().replace(/\s+/g, '-')
      const a = document.createElement('a')
      a.href = url
      a.download = `submittals-${suffix}-${localIsoDate()}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError('Export failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="panel" id="submittals">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Submittals</h2>
          <span className="panel-count">{state === 'ready' ? `${submittals.length} submittals` : '—'}</span>
          {state === 'ready' && (
            <span
              className={missingAssets.length > 0 ? 'status-chip caution' : 'status-chip go'}
              title={
                missingAssets.length > 0
                  ? `Assets with no submittal yet: ${missingAssets.join(', ')}`
                  : 'Every reviewable asset has at least one submittal.'
              }
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <AlertTriangle style={{ width: 12, height: 12 }} />
              {missingAssets.length} asset{missingAssets.length === 1 ? '' : 's'} missing a submittal
            </span>
          )}
        </div>
        <div className="panel-header-right" style={{ gap: 10 }}>
          {canEdit && !formOpen && (
            <button type="button" className="panel-action-btn" onClick={openNew}>
              <Plus style={{ width: 15, height: 15 }} />
              New Submittal
            </button>
          )}
          <button type="button" className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setSettingsOpen((v) => !v)}>
            <Ban style={{ width: 13, height: 13 }} />
            Exempt Assets
          </button>
          <button className={loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={load} aria-label="Refresh submittals">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        Upload a submittal, pick every asset it applies to, then set one review status/notes for
        all of them at once — assets from <b style={{ color: 'var(--text-muted)' }}>{CURRENT_PROJECT}dropdownoptions.Assets</b>
        {!canEdit ? ' · sign in as an authorized editor to add or edit' : ''}
      </div>
      <div style={{ padding: '0 20px 12px' }}>
        <ModuleSettingsSection open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SubmittalExemptAssetsManager
            value={exemptAssets}
            canEdit={ctx.isAdmin}
            loading={ctx.settingsLoading}
            onSave={(values) => ctx.onSaveSetting('submittal_exempt_assets', values.join(', '))}
          />
        </ModuleSettingsSection>
      </div>

      <div className="panel-body">
        {state === 'loading' && <div className="q-hint">Loading…</div>}
        {state === 'error' && (
          <div className="table-error" style={{ padding: '16px 0' }}>
            Couldn&apos;t load submittals, assets, or settings.
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
                <div className="seal-row3" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
                  <div className="form-field">
                    <label>Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Submittal #042 - Chiller Cut Sheets"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label>Review status</label>
                    <select value={form.reviewStatus} onChange={(e) => setForm((f) => ({ ...f, reviewStatus: e.target.value }))}>
                      {SUBMITTAL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label>File</label>
                  <input type="file" onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)} />
                  <div className="q-hint" style={{ marginTop: 4 }}>
                    {pickedFile
                      ? `Will upload: ${pickedFile.name}`
                      : existingFile
                        ? `Current file: ${existingFile.name} — choose a new one to replace it.`
                        : 'No file attached yet.'}
                  </div>
                </div>

                <MultiSelectPicker
                  label="Assets this submittal applies to (select one or more)"
                  options={assets}
                  selected={form.assets}
                  onChange={(next) => setForm((f) => ({ ...f, assets: next }))}
                  placeholder="Search assets…"
                />

                {formError && <div className="q-hint err">{formError}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="seal-submit-btn" style={{ maxWidth: 200 }} disabled={saving} onClick={save}>
                    {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Submittal'}
                  </button>
                  <button className="wf-btn" style={{ padding: '0 16px' }} disabled={saving} onClick={closeForm}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              <div className="form-field" style={{ marginBottom: 0, minWidth: 200 }}>
                <label>Filter by status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value={ALL_STATUSES}>{ALL_STATUSES}</option>
                  {SUBMITTAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="wf-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 1 }}
                disabled={exporting || filteredSubmittals.length === 0}
                onClick={exportFiltered}
              >
                <Download style={{ width: 13, height: 13 }} />
                {exporting ? 'Exporting…' : `Export ${filteredSubmittals.length} as .zip`}
              </button>
            </div>
            {exportError && (
              <div className="q-hint err" style={{ marginTop: -8, marginBottom: 12 }}>
                {exportError}
              </div>
            )}

            {filteredSubmittals.length === 0 && !formOpen ? (
              <div className="q-hint" style={{ padding: '8px 0' }}>
                {submittals.length === 0
                  ? `No submittals yet.${canEdit ? ' Upload one to get started.' : ''}`
                  : 'No submittals match this status filter.'}
              </div>
            ) : (
              <div className="wf-list">
                {filteredSubmittals.map((s) => (
                  <div className="wf-card" key={s.id}>
                    <div className="wf-card-head" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="wf-order-label" style={{ fontSize: 14 }}>
                            {s.title}
                          </span>
                          {canEdit ? (
                            <select
                              className="result-input"
                              style={{ padding: '4px 8px', fontSize: 12 }}
                              value={s.reviewStatus || SUBMITTAL_STATUSES[0]}
                              disabled={statusBusyId === s.id}
                              onChange={(e) => void changeStatus(s, e.target.value)}
                            >
                              {SUBMITTAL_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`status-chip ${statusClass(s.reviewStatus)}`}>{s.reviewStatus || 'Not Started'}</span>
                          )}
                        </div>
                        {s.fileUrl && (
                          <a
                            href={s.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cx-link"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, color: 'var(--green-soft)' }}
                          >
                            <Paperclip style={{ width: 12, height: 12 }} />
                            {s.fileName || 'View file'}
                            <ExternalLink style={{ width: 11, height: 11 }} />
                          </a>
                        )}
                        <SubmittalNotesLog submittal={s} canEdit={canEdit} onChanged={load} />
                      </div>
                      {canEdit && (
                        <div className="wf-actions">
                          {deleteId === s.id ? (
                            <div className="wf-confirm">
                              Delete?
                              <button className="wf-btn danger" disabled={saving} onClick={() => confirmDelete(s.id)}>
                                {saving ? '…' : 'Yes, delete'}
                              </button>
                              <button className="wf-btn" disabled={saving} onClick={() => setDeleteId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button className="wf-btn" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => openEdit(s)}>
                                <Pencil style={{ width: 12, height: 12 }} /> Edit
                              </button>
                              <button
                                className="wf-btn danger"
                                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                                onClick={() => setDeleteId(s.id)}
                              >
                                <Trash2 style={{ width: 12, height: 12 }} /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="wf-chips">
                      {s.assets.map((a) => (
                        <span
                          className="wf-chip"
                          key={a}
                          style={{ color: 'var(--text)', background: 'var(--bg-elev)', borderColor: 'var(--border-strong)' }}
                        >
                          {a}
                        </span>
                      ))}
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
