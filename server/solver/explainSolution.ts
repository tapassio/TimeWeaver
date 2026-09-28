/**
 * Stufe 4 — fachliches Ergebnis + Erklärungen
 * CP-SAT liefert keine automatische fachliche Erklärung (Timefold tut das).
 * -> Nach dem Lösen jede Regel nochmals gegen den fertigen Stundenplan auswerten.
 */

import type { SolverInput } from './solverInput.js'
import type { RawSolverResult, RuleEvaluation, TimetableSolution } from './types.js'
import { CONSTRAINT_CATALOG, SOFT_PENALTY_SCALE } from './constraintCatalog.js'

function slotsOverlap(a: string[], b: string[]): boolean {
  return a.some((s) => b.includes(s))
}

export function explainSolution(
  input: SolverInput,
  raw: RawSolverResult,
  moduleNameById: Map<string, string>,
): TimetableSolution {
  // schnelles Lookup
  const dayById = new Map(input.days.map((d) => [d.id, d]))
  const roomById = new Map(input.rooms.map((r) => [r.id, r]))
  const sessionById = new Map(input.sessions.map((s) => [s.id, s]))

  // build schedule
  const schedule: TimetableSolution['schedule'] = raw.assignments.map((a) => {
    const sess = sessionById.get(a.sessionId)!
    const day = dayById.get(a.dayId)!
    const room = roomById.get(a.roomId)!
    return {
      moduleId: sess.moduleId,
      moduleName: moduleNameById.get(sess.moduleId) ?? sess.moduleId,
      sessionId: sess.id,
      day,
      room,
      slotTypes: sess.slotTypes,
      instructorIds: sess.instructorIds,
    }
  })

  // Hilfs-Index: Zuordnung session -> day/room

  const explanations: RuleEvaluation[] = []

  // --- ROOM_CAPACITY (hard) -----------------------------------------------
  {
    const affected: string[] = []
    let satisfied = true
    for (const a of raw.assignments) {
      const sess = sessionById.get(a.sessionId)!
      const room = roomById.get(a.roomId)!
      if (room.capacity < sess.expectedStudents) {
        satisfied = false
        affected.push(a.sessionId)
      }
    }
    explanations.push({
      constraintId: CONSTRAINT_CATALOG.ROOM_CAPACITY.id,
      category: 'hard',
      satisfied,
      cost: satisfied ? 0 : affected.length * CONSTRAINT_CATALOG.ROOM_CAPACITY.weight,
      affectedSessionIds: affected,
      message: satisfied ? 'Alle Räume erfüllen Kapazität' : `${affected.length} Session(s) mit zu kleinem Raum`,
    })
  }

  // --- NO_TEACHER_OVERLAP (hard) -----------------------------------------
  {
    const affectedSet = new Set<string>()
    let satisfied = true
    for (let i = 0; i < raw.assignments.length; i++) {
      for (let j = i + 1; j < raw.assignments.length; j++) {
        const ai = raw.assignments[i]!
        const aj = raw.assignments[j]!
        if (ai.dayId !== aj.dayId) continue
        const si = sessionById.get(ai.sessionId)!
        const sj = sessionById.get(aj.sessionId)!
        if (!slotsOverlap(si.slotTypes, sj.slotTypes)) continue
        const sharedInstr = si.instructorIds.some((id) => sj.instructorIds.includes(id))
        if (sharedInstr) {
          satisfied = false
          affectedSet.add(ai.sessionId)
          affectedSet.add(aj.sessionId)
        }
      }
    }
    explanations.push({
      constraintId: CONSTRAINT_CATALOG.NO_TEACHER_OVERLAP.id,
      category: 'hard',
      satisfied,
      cost: 0,
      affectedSessionIds: [...affectedSet],
      message: satisfied ? 'Keine Dozenten-Doppelbelegung' : 'Dozenten kollidieren am selben Tag/Slot',
    })
  }

  // --- ROOM_OCCUPANCY (hard) ---------------------------------------------
  {
    const affectedSet = new Set<string>()
    let satisfied = true
    for (let i = 0; i < raw.assignments.length; i++) {
      for (let j = i + 1; j < raw.assignments.length; j++) {
        const ai = raw.assignments[i]!
        const aj = raw.assignments[j]!
        if (ai.dayId !== aj.dayId) continue
        if (ai.roomId !== aj.roomId) continue
        const si = sessionById.get(ai.sessionId)!
        const sj = sessionById.get(aj.sessionId)!
        if (!slotsOverlap(si.slotTypes, sj.slotTypes)) continue
        satisfied = false
        affectedSet.add(ai.sessionId)
        affectedSet.add(aj.sessionId)
      }
    }
    explanations.push({
      constraintId: CONSTRAINT_CATALOG.ROOM_OCCUPANCY.id,
      category: 'hard',
      satisfied,
      cost: 0,
      affectedSessionIds: [...affectedSet],
      message: satisfied ? 'Keine Raum-Doppelbelegung' : 'Räume kollidieren am selben Tag/Slot',
    })
  }

  // --- WEEKLY_BALANCE (hard) ---------------------------------------------
  {
    const countByWeek = new Map<number, number>()
    for (const a of raw.assignments) {
      const day = dayById.get(a.dayId)!
      countByWeek.set(day.week, (countByWeek.get(day.week) ?? 0) + 1)
    }
    const { weeks, lowerPerWeek, upperPerWeek } = input.weeklyBalance
    const violating: string[] = []
    let satisfied = true
    for (const w of weeks) {
      const c = countByWeek.get(w) ?? 0
      if (c < lowerPerWeek || c > upperPerWeek) {
        satisfied = false
        // betroffene Sessions in dieser Woche sammeln
        for (const a of raw.assignments) {
          if (dayById.get(a.dayId)!.week === w) violating.push(a.sessionId)
        }
      }
    }
    explanations.push({
      constraintId: CONSTRAINT_CATALOG.WEEKLY_BALANCE.id,
      category: 'hard',
      satisfied,
      cost: 0,
      affectedSessionIds: [...new Set(violating)],
      message: satisfied
        ? `Wochenbalance ${lowerPerWeek}–${upperPerWeek} eingehalten`
        : `Wochenbalance verletzt (Soll ${lowerPerWeek}–${upperPerWeek})`,
    })
  }


  // --- COHORT_CONFLICT (Kap. 11.1, hard) -----------------------------------
  {
    const affectedSet = new Set<string>()
    let satisfied = true
    for (let i = 0; i < raw.assignments.length; i++) {
      for (let j = i + 1; j < raw.assignments.length; j++) {
        const ai = raw.assignments[i]!
        const aj = raw.assignments[j]!
        if (ai.dayId !== aj.dayId) continue
        const si = sessionById.get(ai.sessionId)!
        const sj = sessionById.get(aj.sessionId)!
        const cohortSame = si.program === sj.program && (si.semester ?? 'default') === (sj.semester ?? 'default')
        if (!cohortSame || si.moduleId === sj.moduleId) continue
        if (!slotsOverlap(si.slotTypes, sj.slotTypes)) continue
        satisfied = false
        affectedSet.add(ai.sessionId)
        affectedSet.add(aj.sessionId)
      }
    }
    explanations.push({
      constraintId: 'COHORT_CONFLICT',
      category: 'hard',
      satisfied,
      cost: 0,
      affectedSessionIds: [...affectedSet],
      message: satisfied ? 'Keine Kohorten-Doppelbelegung' : 'Kohorte (Programm+Semester) kollidiert am selben Tag',
    })
  }

  // --- MODULE_PREREQUISITE_ORDER (Kap. 11.3, hard) --------------------------
  {
    let satisfied = true
    const affected: string[] = []
    const dayIndex = new Map(input.days.map((d, i) => [d.id, i]))
    for (const { prerequisiteModuleId, dependentModuleId } of input.prerequisites) {
      const aAssign = raw.assignments.filter(a => sessionById.get(a.sessionId)!.moduleId === prerequisiteModuleId)
      const bAssign = raw.assignments.filter(a => sessionById.get(a.sessionId)!.moduleId === dependentModuleId)
      for (const a of aAssign) {
        const idxA = dayIndex.get(a.dayId)!
        for (const b of bAssign) {
          const idxB = dayIndex.get(b.dayId)!
          if (idxA >= idxB) {
            satisfied = false
            affected.push(a.sessionId, b.sessionId)
          }
        }
      }
    }
    explanations.push({
      constraintId: 'MODULE_PREREQUISITE_ORDER',
      category: 'hard',
      satisfied,
      cost: 0,
      affectedSessionIds: [...new Set(affected)],
      message: satisfied
        ? 'Prerequisite-Reihenfolge eingehalten'
        : 'Prerequisite-Modul liegt nach abhängigem Modul',
    })
  }

  // --- Soft constraints: AVOID_*, PREFER_* --------------------------------
  // Diese wurden als softPenalties pro Session/Tag vorgerechnet; hier re-evaluieren, PREFER_* --------------------------------
  // Diese wurden als softPenalties pro Session/Tag vorgerechnet; hier re-evaluieren
  const softIds = ['AVOID_FRIDAY_AFTERNOON', 'AVOID_SATURDAY', 'AVOID_EVENING', 'PREFER_MORNING'] as const
  for (const cid of softIds) {
    const def = (CONSTRAINT_CATALOG as any)[cid]
    if (!def) continue
    let cost = 0
    const affected: string[] = []
    for (const a of raw.assignments) {
      const sess = sessionById.get(a.sessionId)!
      const hit = sess.softPenalties.find((p) => p.constraintId === cid && p.dayId === a.dayId)
      if (hit) {
        // in derselben Skalierung wie das Solver-Objective (SOFT_PENALTY_SCALE)
        cost += hit.weight * SOFT_PENALTY_SCALE
        affected.push(a.sessionId)
      }
    }
    explanations.push({
      constraintId: def.id,
      category: 'soft',
      satisfied: cost === 0,
      cost,
      affectedSessionIds: affected,
      message: cost === 0 ? `${def.description}: erfüllt` : `${def.description}: ${cost} Strafpunkte`,
    })
  }

  return {
    status: raw.status,
    objectiveValue: raw.objectiveValue,
    schedule,
    explanations,
    solveTimeMs: raw.solveTimeMs,
    rawAssignments: raw.assignments,
  }
}
