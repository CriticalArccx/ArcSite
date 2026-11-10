import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { EquipmentTrackerConfig } from '../../../lib/api'
import type { AssetCard, BoardGroup, CardItem, PhaseLevel } from '../lib/equipmentTracker'

/** Cards drawn per column before a "Show more" button. A big site has well over a thousand
 * assets, and most of them pile into one column. */
const PAGE_SIZE = 60

type Props = {
  cards: AssetCard[]
  levels: PhaseLevel[]
  config: EquipmentTrackerConfig
}

/**
 * ARC-324: the Equipment Status Tracker as one card per asset, in columns by the commissioning
 * phase the asset is in now (L2, L3, L4, Complete). Grouping comes from buildAssetCards in
 * lib/equipmentTracker.ts. EquipmentTrackerPanel applies the filters and search before passing
 * cards in, so this component only lays them out.
 */
export default function EquipmentStatusBoard({ cards, levels, config }: Props) {
  const groups: BoardGroup[] = [...levels, 'Complete']
  const byGroup = useMemo(() => {
    const map = new Map<BoardGroup, AssetCard[]>(groups.map((g) => [g, []]))
    for (const c of cards) map.get(c.group)?.push(c)
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, levels.join(',')])

  const titles: Record<BoardGroup, string> = {
    L2: config.customHeaders.l2Phase || 'L2',
    L3: config.customHeaders.l3Phase || 'L3',
    L4: config.customHeaders.l4Phase || 'L4',
    Complete: 'Complete',
  }

  return (
    <div className="eq-board" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(260px, 1fr))` }}>
      {groups.map((g) => (
        <BoardColumn key={g} title={titles[g]} group={g} cards={byGroup.get(g) ?? []} />
      ))}
    </div>
  )
}

function BoardColumn({ title, group, cards }: { title: string; group: BoardGroup; cards: AssetCard[] }) {
  const [shown, setShown] = useState(PAGE_SIZE)
  // A new filter or search starts the column back at its first page.
  useEffect(() => setShown(PAGE_SIZE), [cards])

  return (
    <section className={`eq-board-col eq-board-col-${group.toLowerCase()}`} aria-label={`${title}: ${cards.length} assets`}>
      <header className="eq-board-col-header">
        <span className="eq-board-col-title">{title}</span>
        <span className="eq-board-col-count">{cards.length}</span>
      </header>
      <div className="eq-board-cards">
        {cards.length === 0 && <div className="kanban-empty">No assets.</div>}
        {cards.slice(0, shown).map((c, i) => (
          <AssetCardView key={(c.asset || 'asset') + i} card={c} />
        ))}
        {cards.length > shown && (
          <button type="button" className="eq-board-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, cards.length - shown)} more of {cards.length - shown}
          </button>
        )}
      </div>
    </section>
  )
}

function AssetCardView({ card }: { card: AssetCard }) {
  const [open, setOpen] = useState(false)
  const gating = card.openGatingIssues.length
  const nonGating = card.openNonGatingIssues.length
  const hasDetails = card.phases.some((p) => p.gates.length || p.openSupport.length) || gating > 0 || nonGating > 0

  return (
    <article className="eq-card">
      <header className="eq-card-head">
        <div className="eq-card-asset">
          {card.link ? (
            <a href={card.link} target="_blank" rel="noreferrer">
              {card.asset || '(no tag)'}
            </a>
          ) : (
            card.asset || '(no tag)'
          )}
        </div>
        {card.area && <div className="eq-card-area">{card.area}</div>}
      </header>

      <ul className="eq-card-phases">
        {card.phases.map((p) => (
          <li key={p.level} className={p.level === card.group ? 'eq-card-phase current' : 'eq-card-phase'}>
            <span className="eq-card-phase-level">{p.level}</span>
            {p.applicable ? (
              <span className="eq-card-pill" style={p.style} title={p.status}>
                {p.status}
              </span>
            ) : (
              <span className="eq-card-pill na" title="This phase doesn't apply to this asset">
                {p.status}
              </span>
            )}
            {p.totalSupport > 0 && (
              <span className="eq-card-phase-count" title={`${p.openSupport.length} of ${p.totalSupport} ${p.level === 'L4' ? 'tests' : 'checklists'} still open`}>
                {p.openSupport.length}/{p.totalSupport} open
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="eq-card-foot">
        <span className={gating ? 'eq-card-issues gating' : 'eq-card-issues'}>
          {gating} gating
        </span>
        <span className={nonGating ? 'eq-card-issues nongating' : 'eq-card-issues'}>
          {nonGating} non-gating
        </span>
        <span className="eq-card-issues-label">open issues</span>
        {hasDetails && (
          <button type="button" className="eq-card-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? <ChevronDown /> : <ChevronRight />}
            Details
          </button>
        )}
      </div>

      {open && (
        <div className="eq-card-details">
          {card.phases.map((p) =>
            p.gates.length || p.openSupport.length ? (
              <div key={p.level} className="eq-card-detail-group">
                {p.gates.length > 0 && <ItemList label={`${p.level} gate`} items={p.gates} />}
                {p.openSupport.length > 0 && <ItemList label={`${p.level} open ${p.level === 'L4' ? 'tests' : 'CHKs'}`} items={p.openSupport} />}
              </div>
            ) : null,
          )}
          {gating > 0 && <ItemList label="Open gating issues" items={card.openGatingIssues} />}
          {nonGating > 0 && <ItemList label="Open non-gating issues" items={card.openNonGatingIssues} />}
        </div>
      )}
    </article>
  )
}

function ItemList({ label, items }: { label: string; items: CardItem[] }) {
  return (
    <div className="eq-card-items">
      <div className="eq-card-items-label">{label}</div>
      <div className="eq-card-chips">
        {items.map((it, i) => (
          <span key={it.id + i} className="eq-card-chip" title={it.status ? `${it.id}: ${it.status}` : it.id}>
            {it.link ? (
              <a href={it.link} target="_blank" rel="noreferrer">
                {it.id}
              </a>
            ) : (
              it.id
            )}
            {it.status && (
              <span className="eq-card-chip-status" style={it.style}>
                {it.status}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
