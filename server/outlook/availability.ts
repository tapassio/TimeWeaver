/**
 * 9.2/9.3 — Übersetzung Graph-Verfügbarkeitsdaten (15-Min-Raster) in
 * On-Campus-Slot-Status und daraus direkt in Restriction-Objekte aus 3.2.
 *
 * Reine Funktionen, kein Graph-Zugriff — voll testbar.
 * Der CP-SAT Model Builder sieht NIE ein rohes availabilityView, nur
 * fertige Restriction-Objekte mit IDs aus dem Constraint-Katalog.
 */

import type { OnCampusDay, SlotType } from '../solver/domain.js'
import type { Restriction } from '../solver/domain.js'

/** Grenzen der drei On-Campus-Slots in lokaler Zeit (Time_Slots, Abschnitt 3.2) */
export const SLOT_BOUNDARIES: Record<SlotType, { start: string; end: string }> = {
  vormittag: { start: '08:00', end: '12:00' },
  nachmittag: { start: '13:00', end: '17:00' },
  abend: { start: '17:30', end: '20:00' },
}

/** Statuswerte laut Graph-Doku: scheduleItems.status / availabilityView-Ziffern */
export type GraphAvailabilityCode =
  | '0' // free
  | '1' // tentative
  | '2' // busy
  | '3' // oof
  | '4' // workingElsewhere

export type SlotStatus = 'free' | 'tentative' | 'blocked' | 'unknown'

export interface GraphTimespan {
  dateTime: string // ISO 'YYYY-MM-DDTHH:mm:ss' (ohne Zeitzonen-Suffix)
  timeZone: string // z.B. 'Europe/Zurich'
}

export interface GraphScheduleResponse {
  value: Array<{
    scheduleId: string
    availabilityView: string
    scheduleItems: Array<{
      status: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown'
      start?: GraphTimespan
      end?: GraphTimespan
    }>
  }>
}

function timeToMinutes(t: string): number {
  const [hh, mm] = t.split(':').map(Number)
  return (hh ?? 0) * 60 + (mm ?? 0)
}

/** Indizes in den availabilityView-String für einen Slot-Zeitbereich (lokale gew. Zeit). */
export function indicesForRange(
  dayStart: Date,
  start: string,
  end: string,
  intervalMinutes: number,
): number[] {
  if (intervalMinutes <= 0) throw new Error('intervalMinutes > 0 erforderlich')
  const from = timeToMinutes(start)
  const to = timeToMinutes(end)
  const indices: number[] = []
  for (let m = from; m < to; m += intervalMinutes) {
    indices.push(Math.floor(m / intervalMinutes))
  }
  return indices
}

/**
 * Übersetzt einen availabilityView-String (15-Min-Raster, startet am
 * dayStart = Mitternacht lokale Zeit) in einen Status pro On-Campus-Slot:
 *   0 free, 1 tentative, 2 busy, 3 oof, 4 workingElsewhere
 * Mapping (Abschnitt 9.2):
 *   busy/oof    -> blocked (hart)
 *   tentative   -> tentative (soft)
 *   nur 0 / 4   -> free (workingElsewhere blockiert nicht)
 *   sonst       -> unknown (manuell, kein automatischer Entscheid)
 */
export function slotStatusFromAvailabilityView(
  availabilityView: string,
  dayStart: Date,
  intervalMinutes: number,
  slot: SlotType,
): SlotStatus {
  const { start, end } = SLOT_BOUNDARIES[slot]
  const indices = indicesForRange(dayStart, start, end, intervalMinutes)
  const codes = indices.map((i) => availabilityView[i]).filter((c) => c !== undefined)

  if (codes.length === 0) return 'unknown'
  if (codes.some((c) => c === '2' || c === '3')) return 'blocked'
  if (codes.some((c) => c === '1')) return 'tentative'
  if (codes.every((c) => c === '0' || c === '4')) return 'free'
  return 'unknown'
}

/** Erzeugt die Restriction-Objekte mit stabiler Katalog-ID für den Model Builder. */
export function toRestrictions(
  instructorId: string,
  day: OnCampusDay,
  slot: SlotType,
  status: SlotStatus,
): Restriction[] {
  if (status === 'blocked') {
    return [
      {
        id: 'INSTRUCTOR_OUTLOOK_BUSY',
        category: 'hard',
        params: { instructorId, date: day.date, dayId: day.id, slot },
      },
    ]
  }
  if (status === 'tentative') {
    return [
      {
        id: 'INSTRUCTOR_OUTLOOK_TENTATIVE',
        category: 'soft',
        weight: 15,
        params: { instructorId, date: day.date, dayId: day.id, slot },
      },
    ]
  }
  if (status === 'unknown') {
    return [
      {
        // manuelle Prüfung anstossen, nicht automatisch sperren
        id: 'INSTRUCTOR_OUTLOOK_UNKNOWN',
        category: 'soft',
        weight: 5,
        params: { instructorId, date: day.date, dayId: day.id, slot },
      },
    ]
  }
  return []
}

/**
 * getSchedule pro Instructor und On-Campus-Tag auswerten:
 * availabilityView -> Slot-Status -> Restrictions (9.4).
 */
export function mapScheduleToRestrictions(ops: {
  instructorId: string
  availabilityView: string
  dayStart: Date
  intervalMinutes: number
  days: OnCampusDay[]
  slots: SlotType[]
}): Restriction[] {
  const out: Restriction[] = []
  for (const day of ops.days) {
    for (const slot of ops.slots) {
      const status = slotStatusFromAvailabilityView(ops.availabilityView, ops.dayStart, ops.intervalMinutes, slot)
      out.push(...toRestrictions(ops.instructorId, day, slot, status))
    }
  }
  return out
}

/** getSchedule-Request-Body bauen (9.2) */
export function buildGetScheduleBody(opts: {
  instructorMails: string[]
  startTime: GraphTimespan
  endTime: GraphTimespan
  availabilityViewInterval?: number
}): Record<string, unknown> {
  return {
    schedules: opts.instructorMails,
    startTime: opts.startTime,
    endTime: opts.endTime,
    availabilityViewInterval: opts.availabilityViewInterval ?? 15,
  }
}
