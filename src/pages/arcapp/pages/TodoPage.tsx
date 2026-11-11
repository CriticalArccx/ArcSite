import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { ShellContext } from '../ShellContext'
import type { TaskInput } from '../../../lib/api'
import type { Todo, TaskTag } from '../types'
import { isTodoMine } from '../utils'
import { TodoList } from '../components/TodoPanel'
import TodoBoard from '../components/TodoBoard'
import TeamsManager from '../components/TeamsManager'
import GoogleTasksConnect from '../components/GoogleTasksConnect'
import { MyItemRow, MySummaryCard, todoSummaryRoute } from '../components/OpenItemsTodoPanel'
import PersonSelect, { useAuthorizedUsersOptions } from '../components/PersonSelect'

type AssignMode = 'none' | 'team' | 'person'
type FormState = {
  text: string
  tag: TaskTag
  sys: string
  dueDate: string
  assignMode: AssignMode
  teamId: string
  personName: string
  personEmail: string
}
function emptyForm(): FormState {
  return { text: '', tag: 'norm', sys: '', dueDate: '', assignMode: 'none', teamId: '', personName: '', personEmail: '' }
}
function formFromTodo(t: Todo): FormState {
  return {
    text: t.text,
    tag: t.tag,
    sys: t.sys,
    dueDate: t.dueDate ?? '',
    assignMode: t.assignedTeamId ? 'team' : t.assignedEmail || t.assignedName ? 'person' : 'none',
    teamId: t.assignedTeamId ?? '',
    personName: t.assignedName ?? '',
    personEmail: t.assignedEmail ?? '',
  }
}

type Tab = 'mine' | 'all'
type ViewMode = 'list' | 'board'

export default function TodoPage() {
  const ctx = useOutletContext<ShellContext>()
  const { todos, teams, currentUserEmail, openItems } = ctx
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>(currentUserEmail ? 'mine' : 'all')
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const { users, loading: loadingUsers } = useAuthorizedUsersOptions()

  const mineTodos = todos.filter((t) => isTodoMine(t, currentUserEmail, teams))
  const mineCount = mineTodos.length + openItems.myItems.length + openItems.mySummaries.length
  const visible = tab === 'mine' ? mineTodos : todos
  const shownMyItems = tab === 'mine' ? openItems.myItems : []
  const shownMySummaries = tab === 'mine' ? openItems.mySummaries : []
  const open = (tab === 'mine' ? openItems.myItems.length + openItems.mySummaries.length : 0) + visible.filter((t) => !t.done).length

  function openNew() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError('')
    setFormOpen(true)
  }
  function openEdit(t: Todo) {
    setEditingId(t.id)
    setForm(formFromTodo(t))
    setFormError('')
    setFormOpen(true)
  }
  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setFormError('')
  }

  async function save() {
    const text = form.text.trim()
    if (!text) {
      setFormError('Task text is required.')
      return
    }
    if (form.assignMode === 'team' && !form.teamId) {
      setFormError('Pick a team, or switch assignment to Unassigned/Person.')
      return
    }
    if (form.assignMode === 'person' && !form.personEmail) {
      setFormError('Pick a person, or switch assignment to Unassigned/Team.')
      return
    }
    const person = users.find((u) => u.email.toLowerCase() === form.personEmail.toLowerCase())

    const input: TaskInput = {
      id: editingId ?? undefined,
      text,
      tag: form.tag,
      sys: form.sys,
      dueDate: form.dueDate || null,
      assignedTeamId: form.assignMode === 'team' ? form.teamId : null,
      assignedName: form.assignMode === 'person' ? person?.name || form.personName.trim() || null : null,
      assignedEmail: form.assignMode === 'person' ? form.personEmail : null,
    }

    setSaving(true)
    setFormError('')
    try {
      await ctx.onSaveTask(input)
      closeForm()
    } catch (err) {
      setFormError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this task?')) return
    try {
      await ctx.onDeleteTask(id)
    } catch (err) {
      window.alert('Failed to delete: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <>
      <TeamsManager teams={teams} tasks={todos} onSave={ctx.onSaveTeam} onDelete={ctx.onDeleteTeam} />

      <section className="panel" id="todo">
        <div className="panel-header">
          <div className="panel-header-left">
            <h2 className="panel-title">Your To-Dos</h2>
            <span className="panel-count">{open} open</span>
          </div>
          <div className="panel-header-right" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <GoogleTasksConnect signedIn={Boolean(currentUserEmail)} onPulled={ctx.onReloadTasks} />
            {!formOpen && (
              <button className="seal-add-btn" style={{ width: 'auto', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }} onClick={openNew}>
                <Plus style={{ width: 14, height: 14 }} /> New Task
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 20px 12px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={tab === 'mine' ? 'wf-btn' : 'wf-btn'} style={tab === 'mine' ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined} onClick={() => setTab('mine')}>
              My Tasks {currentUserEmail ? `(${mineCount})` : ''}
            </button>
            <button className="wf-btn" style={tab === 'all' ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined} onClick={() => setTab('all')}>
              All Tasks ({todos.length})
            </button>
          </div>
          <div className="ts-filter-group">
            <span className="ts-filter-label">View:</span>
            <button type="button" className={`ts-filter-btn${viewMode === 'board' ? ' active' : ''}`} onClick={() => setViewMode('board')}>
              Board
            </button>
            <button type="button" className={`ts-filter-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}>
              List
            </button>
          </div>
        </div>
        {tab === 'mine' && !currentUserEmail && (
          <div className="q-hint" style={{ padding: '0 20px 12px' }}>
            Sign in to see tasks assigned to you or a team you&apos;re on — showing nothing until then.
          </div>
        )}

        {formOpen && (
          <div className="wf-form" style={{ margin: '0 20px 16px' }}>
            <div className="form-field">
              <label>Task</label>
              <textarea
                value={form.text}
                placeholder="e.g. Approve turnover package — Chiller Plant Room 1"
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
              />
            </div>
            <div className="seal-row3">
              <div className="form-field">
                <label>Priority</label>
                <select value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value as TaskTag }))}>
                  <option value="crit">Critical</option>
                  <option value="high">High</option>
                  <option value="norm">Normal</option>
                </select>
              </div>
              <div className="form-field">
                <label>System / asset (optional)</label>
                <input type="text" value={form.sys} placeholder="e.g. CHW-01" onChange={(e) => setForm((f) => ({ ...f, sys: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Due date (optional)</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>

            <div className="form-field">
              <label>Assign to</label>
              <div className="wf-check-grid" style={{ marginBottom: 8 }}>
                <label className="wf-check-row">
                  <input type="radio" name="assignMode" checked={form.assignMode === 'none'} onChange={() => setForm((f) => ({ ...f, assignMode: 'none' }))} />
                  Unassigned
                </label>
                <label className="wf-check-row">
                  <input type="radio" name="assignMode" checked={form.assignMode === 'team'} onChange={() => setForm((f) => ({ ...f, assignMode: 'team' }))} />
                  A team
                </label>
                <label className="wf-check-row">
                  <input type="radio" name="assignMode" checked={form.assignMode === 'person'} onChange={() => setForm((f) => ({ ...f, assignMode: 'person' }))} />
                  A specific person
                </label>
              </div>

              {form.assignMode === 'team' && (
                <select value={form.teamId} onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))}>
                  <option value="">— Select a team —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {form.assignMode === 'person' && (
                <PersonSelect
                  users={users}
                  loadingUsers={loadingUsers}
                  value={form.personEmail}
                  onChange={(email) => setForm((f) => ({ ...f, personEmail: email }))}
                  staleName={form.personName}
                />
              )}
            </div>

            {formError && <div className="q-hint err">{formError}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="seal-submit-btn" style={{ maxWidth: 160 }} disabled={saving} onClick={save}>
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Task'}
              </button>
              <button className="wf-btn" style={{ padding: '0 16px' }} disabled={saving} onClick={closeForm}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="panel-body">
          {ctx.tasksLoading && <div className="q-hint">Loading tasks…</div>}
          {ctx.tasksError && (
            <div className="table-error">
              Couldn&apos;t load tasks ({ctx.tasksError}).
            </div>
          )}
          {/* Category-level roll-up cards from Settings' per-category default assignee (e.g.
              "Issues need to be reviewed · 12") — counts ready-for-review Checklists/Issues and
              still-open NETA docs; clicking one navigates to that category's own page (Checklists/
              Issues/NETA Tracker), which already lists the real items. Only ever shown on the "My
              Tasks" tab, same as the individual rows below. */}
          {!ctx.tasksLoading && !ctx.tasksError && shownMySummaries.length > 0 && (
            <div className="oi-rows" style={{ marginBottom: 14 }}>
              {shownMySummaries.map((entry) => (
                <MySummaryCard key={entry.itemType} entry={entry} onView={(itemType) => navigate(todoSummaryRoute(itemType))} />
              ))}
            </div>
          )}
          {/* Checklist/Issue/NETA items individually assigned to you or a team you're on, from
              before the browsable "Open ..." list sections were removed — folded directly into
              "My Tasks" rather than a separate section. Reassigning here doesn't touch this list's
              manual tasks below. */}
          {!ctx.tasksLoading && !ctx.tasksError && shownMyItems.length > 0 && (
            <div className="oi-rows" style={{ marginBottom: visible.length > 0 ? 14 : 0 }}>
              {shownMyItems.map((entry) => (
                <MyItemRow key={`${entry.itemType}:${entry.item.id}`} entry={entry} teams={teams} onAssign={openItems.onAssign} />
              ))}
            </div>
          )}
          {!ctx.tasksLoading && !ctx.tasksError && visible.length === 0 && shownMyItems.length === 0 && shownMySummaries.length === 0 && (
            <div className="q-hint">{tab === 'mine' ? 'Nothing assigned to you right now.' : 'No tasks yet.'}</div>
          )}
          {!ctx.tasksLoading &&
            !ctx.tasksError &&
            visible.length > 0 &&
            (viewMode === 'board' ? (
              <TodoBoard todos={visible} teams={teams} onMoveStatus={(id, status) => void ctx.onMoveTaskStatus(id, status)} onEdit={openEdit} onDelete={handleDelete} />
            ) : (
              <TodoList todos={visible} teams={teams} onToggle={ctx.onToggleTodo} onEdit={openEdit} onDelete={handleDelete} />
            ))}
        </div>
      </section>
    </>
  )
}
