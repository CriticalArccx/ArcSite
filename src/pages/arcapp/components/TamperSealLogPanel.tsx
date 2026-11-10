import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Check, Plus, RefreshCw, X } from 'lucide-react'
import { sendBreakDecisionEmail, useGetAssetPlaceOptions, useGetBreakRequests, useGetTamperSeals, useLogTamperSeals, useDecideBreakRequests } from '../../../lib/api'
import type { BreakRequestGroup, SealInput } from '../../../lib/api'
import { fmtDate, localIsoDate } from '../utils'
import { hasCapability } from '../../../lib/project'
import TamperSealSection from './TamperSealSection'
import AssetPicker from './AssetPicker'
import CapabilityNotice from './CapabilityNotice'
import FilterButtonGroup, { ALL, toggleFilterValue } from './FilterButtonGroup'
import type { ShellContext } from '../ShellContext'

type SealRow = {
  id: number
  asset_name: string
  location: string
  sub_area: string
  seal_number: string
  inspection_date: string
  inspection_notes: string
  signoff: string
  status: string
}

function sealStatusClass(status: string): string {
  const t = (status || '').toLowerCase()
  if (t.includes('broke') || t.includes('missing') || t.includes('tamper')) return 'hold'
  if (t.includes('intact')) return 'go'
  return 'muted'
}

/** One batch submission's card: the request-level info once (requestor/reason/date, or "no
 * request details" for the legacy orphan rows that predate the BreakRequests table), then every
 * seal in that submission with its own Approve/Deny toggle.
 *
 * ARC-323: Submit stays disabled until every seal in the batch has a decision, a denied seal gets
 * an optional reason, and there's a general notes box for the whole review. Both kinds of note are
 * saved to the request's decision_notes, and once the decisions are saved the requestor is
 * emailed the outcome (sendBreakDecisionEmail). */
function BreakRequestGroupCard({
  group,
  canDecide,
  onDecided,
}: {
  group: BreakRequestGroup
  canDecide: boolean
  onDecided: (notice: DecisionNotice) => void
}) {
  const decideFn = useDecideBreakRequests()
  const [choices, setChoices] = useState<Record<number, 'approve' | 'deny'>>({})
  const [denyNotes, setDenyNotes] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [emailing, setEmailing] = useState(false)

  const total = group.seals.length
  const chosenCount = group.seals.filter((s) => choices[s.assetId]).length
  const allChosen = total > 0 && chosenCount === total
  const approveCount = group.seals.filter((s) => choices[s.assetId] === 'approve').length
  const denyCount = chosenCount - approveCount
  const busy = decideFn.loading || emailing
  // Orphan batches have no BreakRequests row, so there's no requestor to email.
  const willEmail = group.requestId != null && Boolean(group.requestor_email)
  const notesId = `ts-req-notes-${group.requestId ?? group.asset_name}`

  function setChoice(assetId: number, choice: 'approve' | 'deny') {
    setConfirming(false)
    setChoices((prev) => {
      const next = { ...prev }
      if (next[assetId] === choice) delete next[assetId]
      else next[assetId] = choice
      return next
    })
  }

  async function submitDecisions() {
    if (!allChosen) return
    const decisions = group.seals.map((s) => ({
      assetId: s.assetId,
      approve: choices[s.assetId] === 'approve',
      sealLabel: s.sub_area ? `${s.seal_number} / ${s.sub_area}` : s.seal_number,
      note: choices[s.assetId] === 'deny' ? denyNotes[s.assetId] || '' : '',
    }))
    try {
      await decideFn.trigger({ requestId: group.requestId, decisions, notes }).result
    } catch {
      return // decideFn.error is shown on the card
    }
    const summary = `${group.asset_name}: ${approveCount} approved, ${denyCount} denied.`
    let email: DecisionNotice['email'] = null
    if (willEmail && group.requestId != null) {
      setEmailing(true)
      email = await sendBreakDecisionEmail(group.requestId)
      setEmailing(false)
    }
    onDecided({ summary, email })
  }

  const hasRequestDetails = group.requestor_name || group.requestor_email || group.requestor_company || group.reason || group.requested_at

  return (
    <div style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--bg-elev-2)' }}>
      <div>
        <strong style={{ color: 'var(--text)' }}>{group.asset_name}</strong>
        <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 2 }}>{group.location || '—'}</div>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        {hasRequestDetails ? (
          <>
            {(group.requestor_name || group.requestor_email) && (
              <div>
                Requested by {group.requestor_name || '—'}
                {group.requestor_company ? ` (${group.requestor_company})` : ''}
                {group.requestor_email ? ` — ${group.requestor_email}` : ''}
                {group.requested_at ? ` on ${fmtDate(group.requested_at.slice(0, 10))}` : ''}
              </div>
            )}
            {group.reason && <div style={{ marginTop: 2 }}>Reason: {group.reason}</div>}
          </>
        ) : (
          <div style={{ color: 'var(--text-faint)' }}>No request details on file for this batch.</div>
        )}
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {group.seals.map((s) => {
          const choice = choices[s.assetId]
          return (
            <div key={s.assetId} className="ts-req-seal">
              <div className="ts-req-seal-row">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>
                  Seal #{s.seal_number}
                  {s.sub_area ? <span style={{ color: 'var(--text-muted)' }}> / {s.sub_area}</span> : null}
                </span>
                {canDecide && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={`ts-seal-btn${choice === 'approve' ? ' active-approve' : ''}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      aria-pressed={choice === 'approve'}
                      disabled={busy}
                      onClick={() => setChoice(s.assetId, 'approve')}
                    >
                      <Check style={{ width: 12, height: 12 }} /> Approve
                    </button>
                    <button
                      type="button"
                      className={`ts-seal-btn${choice === 'deny' ? ' active-deny' : ''}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      aria-pressed={choice === 'deny'}
                      disabled={busy}
                      onClick={() => setChoice(s.assetId, 'deny')}
                    >
                      <X style={{ width: 12, height: 12 }} /> Deny
                    </button>
                  </div>
                )}
              </div>
              {canDecide && choice === 'deny' && (
                <input
                  type="text"
                  className="ts-req-note"
                  placeholder="Why is this seal denied? (optional, sent to the requestor)"
                  aria-label={`Denial note for seal ${s.seal_number}`}
                  value={denyNotes[s.assetId] ?? ''}
                  disabled={busy}
                  onChange={(e) => setDenyNotes((prev) => ({ ...prev, [s.assetId]: e.target.value }))}
                />
              )}
            </div>
          )
        })}
      </div>

      {canDecide && (
        <div style={{ marginTop: 12 }}>
          <label className="ts-req-label" htmlFor={notesId}>
            General notes
          </label>
          <textarea
            id={notesId}
            className="ts-req-note ts-req-notes"
            placeholder="Notes for the whole review (optional, sent to the requestor)"
            rows={2}
            value={notes}
            disabled={busy}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div style={{ marginTop: 10 }}>
            {confirming && allChosen ? (
              <div className="wf-confirm">
                Approve {approveCount}, deny {denyCount}
                {willEmail ? ` and email ${group.requestor_email}?` : '?'}
                <button className="wf-btn" disabled={busy} onClick={submitDecisions}>
                  {decideFn.loading ? 'Saving…' : emailing ? 'Emailing…' : 'Confirm'}
                </button>
                <button className="wf-btn" disabled={busy} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="wf-btn" disabled={!allChosen} onClick={() => setConfirming(true)}>
                  Submit decisions
                </button>
                {!allChosen && (
                  <span className="q-hint" style={{ marginTop: 0 }}>
                    Choose Approve or Deny for every seal ({chosenCount} of {total} done).
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {decideFn.error && <div className="q-hint err" style={{ marginTop: 8 }}>{decideFn.error}</div>}
    </div>
  )
}

/** What the last submitted review did, shown above the remaining requests (the decided card
 * itself disappears once its seals are no longer pending). */
type DecisionNotice = { summary: string; email: { sent: boolean; message: string } | null }

/** The CCM approval step LaunchPad's field form starts but never finishes: it flips the selected
 * seals (a worker can request several in one submission) to "Break Requested (Pending Approval)"
 * and logs the request, but there's no approve/deny UI anywhere in LaunchPad itself. This groups
 * those pending seals back into their original batch submissions and lets a CCM decide them. */
function BreakRequestsSection({ canDecide, onDecided }: { canDecide: boolean; onDecided: () => void }) {
  const breakFn = useGetBreakRequests()
  const [notice, setNotice] = useState<DecisionNotice | null>(null)

  useEffect(() => {
    void breakFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = (breakFn.data as BreakRequestGroup[] | undefined) ?? []
  const sealCount = groups.reduce((n, g) => n + g.seals.length, 0)

  if (breakFn.loading && !breakFn.data) return null
  if (groups.length === 0 && !notice) return null

  function refresh(n: DecisionNotice) {
    setNotice(n)
    void breakFn.trigger()
    onDecided()
  }

  return (
    <div className="panel-body" style={{ borderBottom: '1px solid var(--border)' }}>
      {notice && (
        <div className="ts-req-notice" role="status">
          <span className="q-hint ok" style={{ marginTop: 0 }}>Saved. {notice.summary}</span>
          {notice.email && (
            <span className={`q-hint ${notice.email.sent ? 'ok' : 'err'}`} style={{ marginTop: 0 }}>
              {notice.email.sent ? notice.email.message : `Email not sent: ${notice.email.message}`}
            </span>
          )}
          <button type="button" className="wf-btn" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      {groups.length > 0 && (
        <>
          <div className="q-hint" style={{ marginBottom: 10, fontWeight: 600, color: 'var(--text)' }}>
            Pending Break Requests ({groups.length} {groups.length === 1 ? 'batch' : 'batches'}, {sealCount} seal{sealCount === 1 ? '' : 's'})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map((g) => (
              <BreakRequestGroupCard key={g.requestId ?? `orphan:${g.asset_name}`} group={g} canDecide={canDecide} onDecided={refresh} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function TamperSealLogPanel() {
  const { currentUserEmail, canEdit } = useOutletContext<ShellContext>()
  const available = hasCapability('siteLogging')
  const fn = useGetTamperSeals()
  const assetPlaceFn = useGetAssetPlaceOptions()
  const logFn = useLogTamperSeals()

  useEffect(() => {
    if (!available) return
    void fn.trigger()
    void assetPlaceFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!available) {
    return (
      <CapabilityNotice
        feature="Tamper Seals"
        id="tamperseals"
        reason="This project has no <prefix>Assets table yet — that's what Tamper Seal entries write to."
      />
    )
  }

  const rows = (fn.data as SealRow[] | undefined) ?? []
  const assetPlaceOptions = assetPlaceFn.data ?? []
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'

  // Filtering ported from LaunchPad's Tamper Seal log: multi-select Location/Status toggle
  // buttons (both default to "All") plus a free-text search, rather than the single-select
  // dropdowns Checklists/Issues/Submittals use elsewhere in this app — LaunchPad's own UX for
  // this specific page, kept as-is since that's what was asked for.
  const [locationFilter, setLocationFilter] = useState<Set<string>>(new Set([ALL]))
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set([ALL]))
  const [search, setSearch] = useState('')

  const locations = useMemo(() => [ALL, ...Array.from(new Set(rows.map((r) => r.location.trim() || 'Unassigned'))).sort()], [rows])
  const statuses = useMemo(() => [ALL, ...Array.from(new Set(rows.map((r) => r.status).filter(Boolean))).sort()], [rows])

  const q = search.trim().toLowerCase()
  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        const loc = r.location.trim() || 'Unassigned'
        if (!locationFilter.has(ALL) && !locationFilter.has(loc)) return false
        if (!statusFilter.has(ALL)) {
          const s = (r.status || '').toLowerCase()
          if (!Array.from(statusFilter).some((f) => s.includes(f.toLowerCase()))) return false
        }
        if (q) {
          const searchStr = `${r.asset_name} ${r.location} ${r.seal_number} ${r.sub_area} ${r.inspection_notes} ${r.signoff}`.toLowerCase()
          if (!searchStr.includes(q)) return false
        }
        return true
      }),
    [rows, locationFilter, statusFilter, q],
  )

  const [addOpen, setAddOpen] = useState(false)
  const [asset, setAsset] = useState('')
  const [date, setDate] = useState(localIsoDate())

  // The place isn't picked separately — it's whatever this asset is paired with in
  // STY4dropdownoptions, same source the Activities/Results dropdowns already read from.
  const place = useMemo(() => assetPlaceOptions.find((o) => o.asset === asset)?.place ?? '', [assetPlaceOptions, asset])

  async function submitSeals(sealRows: SealInput[]) {
    await logFn.trigger({ rows: sealRows }).result
    void fn.trigger()
  }

  return (
    <section className="panel" id="tamperseals">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Tamper Seal Log</h2>
          <span className="panel-count">
            {state === 'ready' ? (filteredRows.length === rows.length ? `${rows.length} seals` : `${filteredRows.length} of ${rows.length} seals`) : '— seals'}
          </span>
          <span className={state === 'ready' ? 'conn-pill ready' : state === 'error' ? 'conn-pill error' : 'conn-pill loading'}>
            <span className={state === 'error' ? 'led red' : 'led'} /> {state === 'ready' ? 'Live' : state === 'error' ? 'Offline' : 'Syncing'}
          </span>
        </div>
        <div className="panel-header-right" style={{ gap: 10 }}>
          <button type="button" className="panel-action-btn" onClick={() => setAddOpen((v) => !v)}>
            <Plus style={{ width: 15, height: 15 }} />
            {addOpen ? 'Close' : 'Log Seals'}
          </button>
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh tamper seals">
            <RefreshCw />
          </button>
        </div>
      </div>

      {addOpen && (
        <div className="panel-body" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="seal-row3" style={{ gridTemplateColumns: '1.4fr 1.4fr 1fr' }}>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Asset</label>
              <AssetPicker
                options={assetPlaceOptions.map((o) => o.asset)}
                value={asset}
                onChange={setAsset}
                loading={assetPlaceFn.loading && !assetPlaceFn.data}
              />
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Place</label>
              <div
                style={{
                  background: 'var(--bg-elev-2)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  color: place ? 'var(--text)' : 'var(--text-faint)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13.5,
                  padding: '9px 11px',
                }}
              >
                {place || (asset ? 'No place on file for this asset' : 'Auto-filled from the selected asset')}
              </div>
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Inspection date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {asset ? (
            <TamperSealSection
              assetName={asset}
              location={place}
              authUser={currentUserEmail}
              selectedDate={date}
              onSubmit={submitSeals}
            />
          ) : (
            <div className="q-hint">Select an asset above to start a seal range.</div>
          )}
        </div>
      )}

      <BreakRequestsSection canDecide={canEdit} onDecided={() => void fn.trigger()} />

      {state === 'ready' && (
        <div className="ts-filters">
          <FilterButtonGroup label="Locations" options={locations} selected={locationFilter} onToggle={(v) => setLocationFilter((cur) => toggleFilterValue(cur, v))} />
          <FilterButtonGroup label="Statuses" options={statuses} selected={statusFilter} onToggle={(v) => setStatusFilter((cur) => toggleFilterValue(cur, v))} />
          <input
            type="text"
            className="ts-search"
            placeholder="Search seal #, asset, location, notes, signoff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      <div className="panel-body no-pad">
        <div style={{ overflowX: 'auto' }}>
          <table className="sched">
            <thead>
              <tr>
                <th>Seal #</th>
                <th>Asset</th>
                <th>Location</th>
                <th>Sub Area</th>
                <th>Status</th>
                <th>Inspection Date</th>
                <th>Signoff</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {state === 'loading' &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr className="skeleton-row" key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j}>
                        <div className="skeleton-bar" style={{ width: '80%' }} />
                      </td>
                    ))}
                  </tr>
                ))}
              {state === 'error' && (
                <tr>
                  <td colSpan={8} className="table-error">
                    Couldn&apos;t load tamper seals ({fn.error}).
                    <br />
                    <button className="retry-btn" onClick={() => void fn.trigger()}>
                      Retry
                    </button>
                  </td>
                </tr>
              )}
              {state === 'ready' && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-empty">
                    No tamper seals logged yet.
                  </td>
                </tr>
              )}
              {state === 'ready' && rows.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-empty">
                    No seals match the current filters.
                  </td>
                </tr>
              )}
              {state === 'ready' &&
                filteredRows.map((r) => (
                  <tr key={r.id}>
                    <td className="tag-cell">{r.seal_number}</td>
                    <td>{r.asset_name}</td>
                    <td className="discipline-cell">{r.location || '—'}</td>
                    <td className="discipline-cell">{r.sub_area || '—'}</td>
                    <td>
                      <span className={`status-chip ${sealStatusClass(r.status)}`}>{r.status || '—'}</span>
                    </td>
                    <td className="discipline-cell">{fmtDate(r.inspection_date)}</td>
                    <td className="discipline-cell">{r.signoff || '—'}</td>
                    <td className="discipline-cell">{r.inspection_notes || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
