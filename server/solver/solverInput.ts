/**
 * Stufe 2 — validierter SolverInput
 * Fachlich neutral, nur noch das was der Solver braucht.
 * Hier liegt die Filter-Logik (isDayAllowed / isRoomAllowed), die bisher
 * in schedule-model.js direkt im Modell verstreut war.
 */

import type { Module, OnCampusDay, Room, SlotType } from './domain.js'
import { CONSTRAINT_CATALOG, resolveWeight } from './constraintCatalog.js'

export interface SolverSession {
  id: string
  moduleId: string
  /** Kap. 11.1 — Kohorte (Programm+Semester) für die generische Kohorten-Prüfung */
  program: string
  semester?: number
  slotTypes: SlotType[] // ['vormittag'] oder ['vormittag','nachmittag'] = ganzer Tag, ['abend'] separat
  expectedStudents: number
  instructorIds: string[]
  allowedDayIds: string[] // bereits gegen harte Restriktionen gefiltert
  allowedRoomIds: string[] // bereits gegen Kapazität gefiltert
  softPenalties: Array<{ dayId: string; constraintId: string; weight: number }>
}

export interface SolverInput {
  sessions: SolverSession[]
  days: OnCampusDay[]
  rooms: Room[]
  /** Kap. 10.1/11.3 — Prerequisite-Ordnung: On-Campus-Days von prerequisite VOR dependent */
  prerequisites: Array<{ prerequisiteModuleId: string; dependentModuleId: string }>
  weeklyBalance: { weeks: number[]; lowerPerWeek: number; upperPerWeek: number }
}

export interface BuildSolverInputOptions {
  /** Wochenbalance explizit setzen – sonst auto aus days */
  weeklyBalance?: SolverInput['weeklyBalance']
  /**
   * Tag-Plan pro ECTS-Stufe: Liste von SlotTypes je Teil-Session.
   * Default: 6 ECTS → 3 ganze Tage; 3 ECTS → 1 ganzer Tag + 1 Nachmittag (1.5 Tage).
   */
  defaultDayPlan?: (ects: 3 | 6) => SlotType[][]
}


// ---------------------------------------------------------------------------
// Kap. 11.2 — Generic Tag System (Conference-Scheduling-Muster)
////---------------------------------------------------------------------------

/** Generische Tages-Tags: weekday:*, week:*, phase:* */
export function dayTagsOf(day: OnCampusDay): string[] {
  return [
    `weekday:${day.weekday.toLowerCase()}`,
    `week:${day.week % 2 === 0 ? 'even' : 'odd'}`,
    `phase:${day.phase}`,
  ]
}


function anyTagMatches(day: OnCampusDay, tags: string[] | undefined): boolean {
  if (!tags?.length) return false
  const dtags = dayTagsOf(day).map(d => d.toLowerCase())
  return tags.some(t => dtags.includes(t.toLowerCase().trim()))
}

function allTagsPresent(day: OnCampusDay, tags: string[] | undefined): boolean {
  if (!tags?.length) return true
  const dtags = dayTagsOf(day).map(d => d.toLowerCase())
  return tags.every(t => dtags.includes(t.toLowerCase().trim()))
}

function noneTagPresent(day: OnCampusDay, tags: string[] | undefined): boolean {
  return !anyTagMatches(day, tags)
}

// ---------------------------------------------------------------------------
// Helpers: Restriction-Auswertung – rein funktional, testbar
// ---------------------------------------------------------------------------

function getDatesParam(r: { params?: Record<string, unknown> }): string[] {
  const v = r.params?.['dates']
  return Array.isArray(v) ? (v as string[]) : []
}

function getWeekdaysParam(r: { params?: Record<string, unknown> }): string[] {
  const v = r.params?.['weekdays']
  return Array.isArray(v) ? (v as string[]) : []
}

function getPhasesParam(r: { params?: Record<string, unknown> }): string[] {
  const v = r.params?.['phases']
  return Array.isArray(v) ? (v as string[]) : []
}

/**
 * Default Tag-Plan pro Modul (fachliche Konvention):
 *   6 ECTS  -> 3 volle On-Campus-Tage
 *   3 ECTS  -> 1.5 Tage (1 ganzer Tag + 1 Nachmittag)
 * Der Halbtag ist bewusst NACHMITTAG (nicht vormittag): Ganze Tage belegen
 * den Vormittag bereits — waere der Halbtag auch vormittags, kaeme pro
 * Kohorte eine Vormittags-Sitzung mehr heraus als Tage zur Verfuegung
 * stehen (z. B. 3 x 3 ECTS auf 3 Tagen) -> unnoetige INFEASIBLE.
 * (`onCampusDays`-Override im Modul überschreibt die Tage-Anzahl,
 *  kombinierbar mit FIXED_SLOT).
 */
function defaultDayPlanForEcts(ects: 3 | 6): SlotType[][] {
  if (ects === 6) return [['vormittag', 'nachmittag'], ['vormittag', 'nachmittag'], ['vormittag', 'nachmittag']]
  return [['vormittag', 'nachmittag'], ['nachmittag']]
}

function getOutlookParams(r: { params?: Record<string, unknown> }): {
  instructorId: string
  date: string
  slot: SlotType
} | null {
  const instructorId = r.params?.['instructorId']
  const date = r.params?.['date']
  const slot = r.params?.['slot']
  if (typeof instructorId !== 'string' || typeof date !== 'string' || typeof slot !== 'string') return null
  return { instructorId, date, slot: slot as SlotType }
}

function affectsSession(
  p: { instructorId: string; date: string; slot: SlotType },
  mod: Module,
  slotTypes: SlotType[],
): boolean {
  if (!mod.instructors.includes(p.instructorId)) return false
  return slotTypes.includes(p.slot)
}

function isDayAllowedForModule(day: OnCampusDay, mod: Module, slotTypes: SlotType[]): boolean {
  // Kap. 11.2 — generische Tag-Beziehungen (ein einziger Codepfad statt bespoke Regeln):
  // required (alle Tags vorhanden) und prohibited (kein Tag vorhanden) = harte Filter.
  if (!allTagsPresent(day, mod.requiredDayTags) || !noneTagPresent(day, mod.prohibitedDayTags)) {
    return false
  }
  for (const r of mod.restrictions) {
    if (r.category !== 'hard') continue
    switch (r.id) {
      case 'UNAVAILABLE_DATES': {
        const blocked = new Set(getDatesParam(r))
        if (blocked.has(day.date)) return false
        break
      }
      case 'INSTRUCTOR_OUTLOOK_BUSY': {
        // Outlook: Instructor busy/oof -> Slot an diesem Tag hart gesperrt (9.2/9.3)
        const p = getOutlookParams(r)
        if (p && p.date === day.date && affectsSession(p, mod, slotTypes)) return false
        break
      }
      case 'FIXED_DAY': {
        const fixed = new Set(getDatesParam(r))
        // Wenn FIXED_DAY gesetzt, nur diese Daten erlaubt (OR über mehrere Einträge)
        if (fixed.size > 0 && !fixed.has(day.date)) return false
        break
      }
      case 'ALLOWED_WEEKDAYS': {
        const allowed = getWeekdaysParam(r)
        if (allowed.length > 0 && !allowed.includes(day.weekday)) return false
        break
      }
      case 'ALLOWED_PHASE': {
        const allowed = getPhasesParam(r)
        if (allowed.length > 0 && !allowed.includes(day.phase)) return false
        break
      }
      default:
        // unbekannte harte Restriktion hier ignorieren – wird im Solver später als Raum-/Lehrer-Constraint behandelt
        break
    }
  }
  return true
}

function buildSoftPenalties(
  day: OnCampusDay,
  slotTypes: SlotType[],
  mod: Module,
): Array<{ dayId: string; constraintId: string; weight: number }> {
  const penalties: Array<{ dayId: string; constraintId: string; weight: number }> = []
  // Kap. 11.2 — Soft-Tags: preferred (Penalty wenn keins passt) / undesired (Penalty wenn passend)
  const prefWeight = resolveWeight('PREFERRED_DAY_TAGS')
  if (mod.preferredDayTags?.length && !anyTagMatches(day, mod.preferredDayTags)) {
    penalties.push({ dayId: day.id, constraintId: 'PREFERRED_DAY_TAGS', weight: prefWeight })
  }
  const undesiredWeight = resolveWeight('UNDESIRED_DAY_TAGS')
  if (mod.undesiredDayTags?.length && anyTagMatches(day, mod.undesiredDayTags)) {
    penalties.push({ dayId: day.id, constraintId: 'UNDESIRED_DAY_TAGS', weight: undesiredWeight })
  }
  for (const r of mod.restrictions) {
    if (r.category !== 'soft') continue
    const weight = resolveWeight(r.id, r.weight)
    switch (r.id) {
      case 'INSTRUCTOR_OUTLOOK_TENTATIVE':
      case 'INSTRUCTOR_OUTLOOK_UNKNOWN': {
        // Outlook-Feinsteuerung: tentative (soft 15 bzw. 5) nur bei Slot-Überlappung
        const p = getOutlookParams(r)
        if (p && p.date === day.date && affectsSession(p, mod, slotTypes)) {
          penalties.push({ dayId: day.id, constraintId: r.id, weight })
        }
        break
      }
      case 'AVOID_FRIDAY_AFTERNOON':
        if (day.weekday === 'Freitag' && slotTypes.includes('nachmittag')) {
          penalties.push({ dayId: day.id, constraintId: r.id, weight })
        }
        break
      case 'AVOID_SATURDAY':
        if (day.weekday === 'Samstag') penalties.push({ dayId: day.id, constraintId: r.id, weight })
        break
      case 'AVOID_EVENING':
        if (slotTypes.includes('abend')) penalties.push({ dayId: day.id, constraintId: r.id, weight })
        break
      case 'PREFER_MORNING':
        // Penalty wenn NICHT vormittag – invertierte Präferenz
        if (!slotTypes.includes('vormittag')) penalties.push({ dayId: day.id, constraintId: r.id, weight })
        break
      default: {
        // Generisch: falls params.dates enthält und day darauf fällt → Penalty
        const dates = getDatesParam(r)
        if (dates.includes(day.date)) penalties.push({ dayId: day.id, constraintId: r.id, weight })
        break
      }
    }
  }
  // Immer kleiner Tie-Breaker für frühe Daten (falls im Katalog enabled)
  if (CONSTRAINT_CATALOG.PREFER_EARLY_DATES.enabled) {
    // wird nicht pro-Modul, sondern global im Solver als Objective gewichtet – hier leer lassen
  }
  return penalties
}

// ---------------------------------------------------------------------------
// Public: buildSolverInput
// Diese Funktion trägt die ganze fachliche Interpretation der Restriktionen.
// Der CP-SAT Model Builder (Stufe 3) kennt danach keine Restriction-Objekte mehr,
// nur noch Listen erlaubter IDs und vorgerechnete Strafkosten.
// ---------------------------------------------------------------------------

export function buildSolverInput(
  modules: Module[],
  days: OnCampusDay[],
  rooms: Room[],
  options: BuildSolverInputOptions = {},
): SolverInput {
  if (modules.length === 0) throw new Error('buildSolverInput: modules leer')
  if (days.length === 0) throw new Error('buildSolverInput: days leer')
  if (rooms.length === 0) throw new Error('buildSolverInput: rooms leer')

  // Validierung: ECTS, Students
  for (const m of modules) {
    if (m.ects !== 3 && m.ects !== 6) throw new Error(`Modul ${m.id}: ects muss 3 oder 6 sein`)
    if (m.expectedStudents < 0) throw new Error(`Modul ${m.id}: expectedStudents negativ`)
    if (m.instructors.length === 0) throw new Error(`Modul ${m.id}: mindestens ein Instructor erforderlich`)
  }

  // Konvention: Ein Modul belegt mehrere On-Campus-Tage (Kernproblem!).
  // buildSolverInput zerlegt jedes Modul in mehrere Teil-Sessions
  // (`session-${mod.id}-p0`, `-p1`, ...), je nach ECTS-Stufe bzw.
  // `onCampusDays`-Override alle mit denselben Restriktionen.
  const dayPlanForEcts = options.defaultDayPlan ?? defaultDayPlanForEcts

  // Validierung: ECTS, Students
  for (const m of modules) {
    if (m.ects !== 3 && m.ects !== 6) throw new Error(`Modul ${m.id}: ects muss 3 oder 6 sein`)
    if (m.expectedStudents < 0) throw new Error(`Modul ${m.id}: expectedStudents negativ`)
    if (m.instructors.length === 0) throw new Error(`Modul ${m.id}: mindestens ein Instructor erforderlich`)
  }

  const sessions: SolverSession[] = modules.flatMap((mod) => {
    // SlotTypes bestimmen: Falls Restriktion FIXED_SLOT existiert, nutze diese für JEDEN Teil-Slot;
    // sonst Standard-Tag-Plan gemäss ECTS / onCampusDays-Override.
    const slotRestriction = mod.restrictions.find((r) => r.id === 'FIXED_SLOT')
    const customSlots = slotRestriction?.params?.['slotTypes']
    let dayPlan: SlotType[][]
    if (customSlots && Array.isArray(customSlots)) {
      // Ein FIXED_SLOT zwingt alle Teil-Sessions auf dieselben SlotTypes (z.B. ganzer Tag)
      dayPlan = Array(mod.onCampusDays ?? (mod.ects === 6 ? 3 : 2)).fill(null).map(() => customSlots as SlotType[])
    } else {
      dayPlan = dayPlanForEcts(mod.ects)
      if (mod.onCampusDays !== undefined) {
        // Override: Basis-Slotmix auf Wunsch-Anzahl Tage strecken/kürzen (ganze Tage vor Schrumpfung)
        const [full] = dayPlan
        if (dayPlan.length < mod.onCampusDays && full) {
          while (dayPlan.length < mod.onCampusDays) dayPlan.push([...full])
        } else if (dayPlan.length > mod.onCampusDays) {
          dayPlan = dayPlan.slice(0, mod.onCampusDays)
        }
      }
    }

    // Harte Tages-Filter (Outlook-Restrictions zitieren den Slot: NUR Tage relevant,
    // deren Slot-Typen der Session überlappen). Filter je Teil-Session-Slots.
    const allowedDaysByPart = dayPlan.map((part) => days.filter((d) => isDayAllowedForModule(d, mod, part)))
    if (allowedDaysByPart.map((a) => a.length).some((n) => n === 0)) {
      throw new Error(`Modul ${mod.id} (${mod.name}): Teil-Session ohne erlaubten Tag nach harten Filtern (Prüfe UNAVAILABLE_DATES/INSTRUCTOR_OUTLOOK_BUSY/FIXED_DAY)`)
    }

    // Harte Raum-Filter: Kapazität
    const allowedRooms = rooms.filter((r) => r.capacity >= mod.expectedStudents)
    if (allowedRooms.length === 0) {
      throw new Error(`Modul ${mod.id}: kein Raum erfüllt Kapazität ${mod.expectedStudents} (max verfügbar ${Math.max(...rooms.map((r) => r.capacity))})`)
    }

    return dayPlan.map((slotTypesPartial, partIdx) => {
      // Soft Penalties je Tag
      const allowedDays = allowedDaysByPart[partIdx]!
      const softPenalties: SolverSession['softPenalties'] = []
      for (const d of allowedDays) {
        softPenalties.push(...buildSoftPenalties(d, slotTypesPartial, mod))
      }
      return {
        id: `session-${mod.id}-p${partIdx}`,
        moduleId: mod.id,
        program: mod.program,
        semester: mod.semester,
        slotTypes: slotTypesPartial,
        expectedStudents: mod.expectedStudents,
        instructorIds: [...mod.instructors],
        allowedDayIds: allowedDays.map((d) => d.id),
        allowedRoomIds: allowedRooms.map((r) => r.id),
        softPenalties,
      }
    })
  })

  // Kap. 10.1/11.3 — Prerequisite-Beziehungen aus dem Domänenmodell übernehmen
  const prerequisites: SolverInput['prerequisites'] = []
  const moduleIds = new Set(modules.map((m) => m.id))
  for (const m of modules) {
    for (const prereq of m.prerequisiteModuleIds ?? []) {
      if (moduleIds.has(prereq)) prerequisites.push({ prerequisiteModuleId: prereq, dependentModuleId: m.id })
    }
  }

  // Wochenbalance — zählt On-Campus-TAGE pro Woche: da jede Teil-Session
  // genau einen On-Campus-Tag belegt, sind "Sessions pro Woche" und
  // "On-Campus-Tage pro Woche" identisch (Review-Nachtrag zu #1).
  let weeklyBalance: SolverInput['weeklyBalance']
  if (options.weeklyBalance) {
    weeklyBalance = options.weeklyBalance
  } else {
    const weeks = [...new Set(days.map((d) => d.week))].sort((a, b) => a - b)
    // Default: gleichmässig verteilen, ±1 Toleranz
    const total = sessions.length
    const w = weeks.length || 1
    const avg = Math.floor(total / w)
    weeklyBalance = {
      weeks,
      lowerPerWeek: Math.max(0, avg - 1),
      upperPerWeek: avg + 2,
    }
  }

  return { sessions, prerequisites, days, rooms, weeklyBalance }
}
