import type { ScheduleRow } from './types'

/* =====================================================================
   REFERENCE PANEL — sample "what to look for" content, picked by keyword
   match against the activity/asset/place text. Ported from the original
   ArcSite dashboard's SAMPLE_CHECKLISTS.
   ===================================================================== */

type Checklist = {
  overview: (row: ScheduleRow) => string
  items: string[]
}

export const SAMPLE_CHECKLISTS: Record<string, Checklist> = {
  electrical: {
    overview: (row) =>
      `This activity covers ${row.activity} on ${row.asset} at ${row.place}. Confirm the equipment is de-energized and properly locked out before opening any enclosure, and verify nameplate data matches the one-line diagram.`,
    items: [
      'Verify LOTO is applied and tested (zero-energy check) before opening any panel',
      'Check torque marks / paint pens on lug and breaker connections for signs of movement',
      'Inspect for discoloration, a burning smell, or heat-damaged insulation',
      'Confirm labeling (panel schedule, arc-flash warning, equipment ID) is present and legible',
      'Look for loose, missing, or corroded hardware on covers and grounding connections',
      'Check for tamper seals — note seal numbers and condition before breaking any',
    ],
  },
  mechanical: {
    overview: (row) =>
      `This activity covers ${row.activity} on ${row.asset} at ${row.place}. Confirm isolation valves and breakers are set per the test procedure before starting.`,
    items: [
      'Check for refrigerant, water, or oil leaks at fittings and gasket lines',
      'Verify belts, couplings, and fan blades are free of visible wear or misalignment',
      'Confirm vibration and noise levels are within expected range at startup',
      'Check gauge readings (pressure/temperature) against design setpoints',
      'Inspect insulation and lagging for damage or moisture intrusion',
      'Note any tamper seals on access panels — record seal numbers before breaking',
    ],
  },
  fire: {
    overview: (row) =>
      `This activity covers ${row.activity} on ${row.asset} at ${row.place}. Coordinate with the monitoring company before testing to avoid a false dispatch.`,
    items: [
      'Confirm the monitoring company has been notified before testing',
      'Verify device address/zone matches the fire alarm matrix',
      'Check for physical damage, paint overspray, or obstruction on detectors/sprinkler heads',
      'Confirm audible/visual notification appliances activate as expected',
      'Inspect valve tamper switches and seals — record any broken or missing seals',
      'Restore the system to normal and confirm the monitoring company clears the test',
    ],
  },
  controls: {
    overview: (row) =>
      `This activity covers ${row.activity} on ${row.asset} at ${row.place}. Compare live point values against the sequence of operations before signing off.`,
    items: [
      'Confirm point-to-point checkout matches the controls schedule',
      'Verify setpoints and alarm limits match the sequence of operations',
      'Check that graphics reflect real-time equipment status accurately',
      'Test manual override / hand-off-auto behavior at the panel',
      'Confirm network/communication status shows no dropped points',
    ],
  },
  plumbing: {
    overview: (row) =>
      `This activity covers ${row.activity} on ${row.asset} at ${row.place}. Confirm the system is depressurized/isolated as required before inspection.`,
    items: [
      'Check for leaks at joints, valves, and fittings',
      'Verify pressure gauge readings are within design range',
      'Confirm backflow preventer and isolation valves are tagged correctly',
      'Inspect pipe supports and hangers for proper alignment',
      'Note any tamper seals on valves — record seal numbers before breaking',
    ],
  },
  default: {
    overview: (row) =>
      `This activity covers ${row.activity} on ${row.asset} at ${row.place}. Review the commissioning procedure for this system before beginning.`,
    items: [
      'Confirm the equipment matches the tag/asset ID on the schedule',
      'Check for visible damage, corrosion, or missing hardware',
      'Verify labeling and documentation are present and legible',
      'Note the condition of any tamper seals before breaking them',
      'Take photos of anything unexpected for the record',
    ],
  },
}

export function pickChecklistCategory(row: ScheduleRow): string {
  const text = `${row.activity} ${row.asset} ${row.place}`.toLowerCase()
  if (/switchgear|breaker|panel|generator|electrical|transformer|\bups\b|battery/.test(text)) return 'electrical'
  if (/chiller|\bahu\b|pump|ductwork|mechanical|cooling|boiler/.test(text)) return 'mechanical'
  if (/fire|sprinkler|alarm|smoke|suppression/.test(text)) return 'fire'
  if (/\bbas\b|controls|sequence|graphics|automation/.test(text)) return 'controls'
  if (/water|plumbing|booster|backflow|domestic/.test(text)) return 'plumbing'
  return 'default'
}

export function getChecklist(row: ScheduleRow): Checklist {
  return SAMPLE_CHECKLISTS[pickChecklistCategory(row)] ?? SAMPLE_CHECKLISTS['default']!
}
