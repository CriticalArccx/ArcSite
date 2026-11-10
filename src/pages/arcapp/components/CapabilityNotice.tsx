import { AlertTriangle } from 'lucide-react'
import { CURRENT_PROJECT, projectLabel } from '../../../lib/project'

/** Shown in place of a whole page/panel when the current project lacks a capability it needs
 * (see src/lib/project.ts) — e.g. Tamper Seals/RTFT for a project with no <prefix>Assets/
 * <prefix>RTFT table yet, or Checklists/Issues/Asset Attributes for a project whose Apps Script
 * hasn't had the ArcSite actions added. The Sidebar already hides the nav link for these, so this
 * is what a direct URL visit (or an old bookmark) sees instead of a raw fetch error. */
export default function CapabilityNotice({ feature, reason, id }: { feature: string; reason: string; id?: string }) {
  return (
    <section className="panel" id={id}>
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">{feature}</h2>
        </div>
      </div>
      <div className="panel-body">
        <div className="table-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '30px 14px' }}>
          <AlertTriangle style={{ width: 20, height: 20, color: 'var(--amber)' }} />
          <div>
            {feature} isn&apos;t available for {projectLabel(CURRENT_PROJECT)} yet.
          </div>
          <div className="q-hint">{reason}</div>
        </div>
      </div>
    </section>
  )
}
