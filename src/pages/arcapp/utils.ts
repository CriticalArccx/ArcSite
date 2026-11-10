/* Date + formatting helpers ported from the original ArcSite dashboard. */

import type { Team, Todo } from './types'

// Local calendar date as YYYY-MM-DD — deliberately NOT toISOString(), which
// converts to UTC and can roll to the next day in the evening for US time zones.
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function stripHtml(str: unknown): string {
  return (str || '').toString().replace(/<[^>]+>/g, '').trim()
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return localIsoDate(d)
}

export function fmtDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateLong(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function scheduleStatusClass(text: string): string {
  const t = (text || '').toLowerCase()
  if (!t || t === 'na') return 'muted'
  if (t.includes('complete') || t.includes('pass')) return 'complete'
  if (t.includes('hold') || t.includes('fail') || t.includes('issue')) return 'hold'
  if (t.includes('caution') || t.includes('risk') || t.includes('delay')) return 'caution'
  return 'go'
}

export function statusColor(status: string): string {
  const map: Record<string, string> = { go: '#4ebd4f', caution: '#f2c94c', hold: '#ee8080', complete: '#4ebd4f' }
  return map[status] ?? '#4ebd4f'
}

// Clean 2-decimal-max display without trailing zeros (1.00 -> 1, 1.25 -> 1.25).
export function fmtOffset(v: number): string {
  const n = Math.round(v * 100) / 100
  return n.toString()
}

// Full seal-number strings (not bare numbers) — a seal range can include a letter prefix/suffix
// (see parseSealNumberParts), so an omitted entry only excludes a seal if it matches the whole
// thing. Comparison is case-insensitive at the call site; original casing is kept here so it can
// still be displayed back to the user as typed.
export function parseOmitted(str: string): string[] {
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Splits a seal number into a leading non-digit prefix, a numeric core, and a trailing non-digit
 * suffix — e.g. "A-1001-B" -> prefix "A-", num "1001", suffix "-B". Returns null if there's no
 * numeric core at all (a range needs something to increment). Ported from tamperseal.html so
 * seal ranges behave identically here.
 */
export function parseSealNumberParts(value: string): { prefix: string; num: string; suffix: string } | null {
  const match = String(value).trim().match(/^(\D*)(\d+)(\D*)$/)
  if (!match) return null
  return { prefix: match[1], num: match[2], suffix: match[3] }
}

/**
 * Google Drive "view" URLs — `https://drive.google.com/file/d/<id>/view...`, what
 * `DriveApp.getUrl()` returns in the Joint Pack Photos Apps Script — serve an HTML viewer page,
 * not raw image bytes, so using one directly as an `<img src>` just shows a broken-image icon
 * (it still works fine as a link's `href`, opened in a new tab, which is why that was never
 * noticed before an actual inline thumbnail was added). This pulls the file ID out of whichever
 * Drive URL shape it's given and builds the `thumbnail` endpoint instead, which does serve real
 * image bytes. Falls back to the original URL untouched if no file ID can be found, so a link that
 * isn't a Drive URL at all just renders as before (broken img, working href) instead of breaking
 * further.
 */
export function driveThumbnailUrl(url: string): string {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  const id = match?.[1]
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : url
}

/**
 * Downscales + JPEG-compresses a photo before it's base64'd into a Joint Pack Photo upload —
 * on-site cell signal is often poor and a raw phone/iPad photo can be 5-15MB, most of which is
 * far more resolution than a torque-inspection reference photo needs.
 */
export function compressImageFile(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read the selected image.'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported on this device.'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/* ============ Tasks & Teams ============ */

const TAG_LABELS: Record<Todo['tag'], string> = { crit: 'Critical', high: 'High', norm: 'Normal' }
export function todoTagLabel(tag: Todo['tag']): string {
  return TAG_LABELS[tag] ?? tag
}

/** Display text + "is it due today" for a task's due date — derived, not stored. */
export function todoDueDisplay(todo: Pick<Todo, 'dueDate' | 'done' | 'completedAt'>): { text: string; today: boolean } {
  if (todo.done) {
    return { text: todo.completedAt ? `Completed ${fmtDate(todo.completedAt.slice(0, 10))}` : 'Completed', today: false }
  }
  if (!todo.dueDate) return { text: 'No due date', today: false }
  const today = localIsoDate()
  if (todo.dueDate === today) return { text: 'Due today', today: true }
  if (todo.dueDate === addDaysIso(today, 1)) return { text: 'Due tomorrow', today: false }
  if (todo.dueDate < today) return { text: `Overdue — ${fmtDate(todo.dueDate)}`, today: true }
  return { text: `Due ${fmtDate(todo.dueDate)}`, today: false }
}

/** "Team: Electrical" / "Jane Smith" / "" (unassigned) — resolves the team name by id. */
export function todoAssignmentLabel(todo: Pick<Todo, 'assignedTeamId' | 'assignedEmail' | 'assignedName'>, teams: Team[]): string {
  if (todo.assignedTeamId) {
    const team = teams.find((t) => t.id === todo.assignedTeamId)
    return team ? `Team: ${team.name}` : 'Team (removed)'
  }
  if (todo.assignedName || todo.assignedEmail) return todo.assignedName || todo.assignedEmail || ''
  return ''
}

/** True if `userEmail` is directly assigned, or is a member of the team the task is assigned to.
 * Takes just the assignment fields (not the full Todo shape) so it also works unchanged on
 * ItemAssignment records (Checklist/Issue/NETA To-Do) — same field names, same "at most one of
 * team or person" convention. */
export function isTodoMine(todo: Pick<Todo, 'assignedEmail' | 'assignedTeamId'>, userEmail: string | null, teams: Team[]): boolean {
  if (!userEmail) return false
  const email = userEmail.toLowerCase()
  if (todo.assignedEmail && todo.assignedEmail.toLowerCase() === email) return true
  if (todo.assignedTeamId) {
    const team = teams.find((t) => t.id === todo.assignedTeamId)
    if (team && team.members.some((m) => m.email.toLowerCase() === email)) return true
  }
  return false
}
