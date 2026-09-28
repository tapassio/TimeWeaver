/**
 * Kap. 3.1 + 3.2 — CP-SAT Model Builder (Stufe 3)
 * Kennt keine Restriction-Objekte, nur SolverInput (Stufe 2).
 * Läuft serverseitig in Node.js; wird über Worker Thread isoliert (Kap. 2).
 */

import type { SolverInput } from './solverInput.js'
import type { RawSolverResult, SolveOptions, TimetableSolution } from './types.js'
import type { TimetableSolver } from './TimetableSolver.js'
import { explainSolution } from './explainSolution.js'
import { SOFT_PENALTY_SCALE, resolveWeight } from './constraintCatalog.js'

function slotsOverlap(a: string[], b: string[]): boolean {
  return a.some((s) => b.includes(s))
}

export class OrToolsWasmTimetableSolver implements TimetableSolver {
  constructor(private moduleNameById: Map<string, string> = new Map()) {}

  async solveRaw(input: SolverInput, options: SolveOptions = {}): Promise<RawSolverResult> {
    const start = Date.now()
    const { CpModel, CpSolver } = await import('or-tools-wasm/cp-sat')

    const model = new CpModel()

    const dayIndex = new Map(input.days.map((d, i) => [d.id, i]))
    const roomIndex = new Map(input.rooms.map((r, i) => [r.id, i]))
    const numDays = input.days.length
    const numRooms = input.rooms.length

    if (numDays === 0 || numRooms === 0 || input.sessions.length === 0) {
      throw new Error('SolverInput leer: days/rooms/sessions erforderlich')
    }

    const dayVars: any[] = []
    const roomVars: any[] = []

    for (const sess of input.sessions) {
      const allowedDayIndices = sess.allowedDayIds.map((id) => {
        const idx = dayIndex.get(id)
        if (idx === undefined) throw new Error(`Unbekannte dayId ${id} in Session ${sess.id}`)
        return idx
      })
      const allowedRoomIndices = sess.allowedRoomIds.map((id) => {
        const idx = roomIndex.get(id)
        if (idx === undefined) throw new Error(`Unbekannte roomId ${id} in Session ${sess.id}`)
        return idx
      })

      if (allowedDayIndices.length === 0) throw new Error(`Session ${sess.id}: keine erlaubten Tage`)
      if (allowedRoomIndices.length === 0) throw new Error(`Session ${sess.id}: keine erlaubten Räume`)

      const dv = model.newIntVar(0, numDays - 1, `day_${sess.id}`)
      const rv = model.newIntVar(0, numRooms - 1, `room_${sess.id}`)

      model.addAllowedAssignments([dv], allowedDayIndices.map((v) => [v]))
      model.addAllowedAssignments([rv], allowedRoomIndices.map((v) => [v]))

      dayVars.push(dv)
      roomVars.push(rv)
    }

    // Hard: Dozenten-Overlap – überlappende SlotTypes, gleicher Tag -> verboten
    for (let i = 0; i < input.sessions.length; i++) {
      for (let j = i + 1; j < input.sessions.length; j++) {
        const si = input.sessions[i]!
        const sj = input.sessions[j]!
        // Ein Modul darf sich selbst nicht doppelt am selben Tag verplanen (Mehrtägigkeit)
        if (si.moduleId === sj.moduleId) {
          model.addAllDifferent([dayVars[i], dayVars[j]])
          continue
        }
        if (!slotsOverlap(si.slotTypes, sj.slotTypes)) continue
        // Kap. 11.1 — Kohorten-Konflikt: dieselbe Kohorte (Programm+Semester)
        // kann nicht in überlappenden SlotTypes am selben Tag an zwei Modulen lernen.
        const cohortSame =
          si.program === sj.program &&
          (si.semester ?? 'default') === (sj.semester ?? 'default')
        if (cohortSame) {
          model.addAllDifferent([dayVars[i], dayVars[j]])
          continue
        }
        const shared = si.instructorIds.some((id) => sj.instructorIds.includes(id))
        if (!shared) continue
        model.addAllDifferent([dayVars[i], dayVars[j]])
      }
    }

    // Penalty-Kollektor (hard→soft), von der Objective-Sektion genutzt
    const penaltyTerms: any[] = []

    // Kap. 10.1 / 11.3 — Hard: MODULE_PREREQUISITE_ORDER
    // Alle Sessions des Prerequisite-Moduls liegen VOR allen Sessions des abhängigen Moduls
    // (dvA < dvB → addLinearConstraint(dvA - dvB, lb, -1), analog zur Konfliktprüfung).
    for (const prereq of input.prerequisites) {
      const aIndices = input.sessions
        .map((s, idx) => (s.moduleId === prereq.prerequisiteModuleId ? idx : -1))
        .filter((idx) => idx >= 0)
      const bIndices = input.sessions
        .map((s, idx) => (s.moduleId === prereq.dependentModuleId ? idx : -1))
        .filter((idx) => idx >= 0)
      for (const ai of aIndices) {
        for (const bi of bIndices) {
          const dvA = dayVars[ai]!
          const dvB = dayVars[bi]!
          // dvA - dvB <= -1  ⇔ dvA < dvB
          model.addLinearConstraint(dvA.minus(dvB), -numDays, -1)
        }
      }
    }

    // Kap. 11.4 — Soft: TEACHER_ROOM_STABILITY
    // Sessions desselben Moduls möglichst in demselben Raum (Paar-Differenzen penalizen)
    const roomPenaltyWeight = SOFT_PENALTY_SCALE * resolveWeight('TEACHER_ROOM_STABILITY')
    const sessionsByModule = new Map<string, number[]>()
    input.sessions.forEach((s, idx) => {
      const list = sessionsByModule.get(s.moduleId) ?? []
      list.push(idx)
      sessionsByModule.set(s.moduleId, list)
    })
    for (const indices of sessionsByModule.values()) {
      for (let i = 0; i + 1 < indices.length; i++) {
        const ri = roomVars[indices[i]!]
        const rj = roomVars[indices[i + 1]!]
        if (!ri || !rj) continue
        const diff = model.newIntVar(0, numRooms - 1, `roomStab_${indices[i]!}_${indices[i + 1]!}`)
        model.addAbsEquality(diff, ri.minus(rj))
        penaltyTerms.push((diff as any).times(roomPenaltyWeight))
      }
    }

    // Kap. 11.4 — Soft: TEACHER_MAKESPAN
    // Gesamtzeitspanne (max-min Day) der Sessions je DozierenderPerson penalize
    const instructorSessions = new Map<string, number[]>()
    input.sessions.forEach((s, idx) => {
      for (const iid of s.instructorIds) {
        const list = instructorSessions.get(iid) ?? []
        list.push(idx)
        instructorSessions.set(iid, list)
      }
    })
    const makespanWeight = SOFT_PENALTY_SCALE * resolveWeight('TEACHER_MAKESPAN')
    for (const indices of instructorSessions.values()) {
      if (indices.length < 2) continue
      const dayVarsOfInstr = indices.map((idx) => dayVars[idx]!)
      const maxVar = model.newIntVar(0, numDays - 1, `instrMax_${indices.join('_')}`)
      const minVar = model.newIntVar(0, numDays - 1, `instrMin_${indices.join('_')}`)
      model.addMaxEquality(maxVar, dayVarsOfInstr)
      model.addMinEquality(minVar, dayVarsOfInstr)
      const span = (maxVar.minus(minVar) as any)
      penaltyTerms.push(span.times(SOFT_PENALTY_SCALE * resolveWeight('TEACHER_MAKESPAN')))
    }

    // Hard: Raum-Kollision – gleiche (day,room) bei überlappenden Slots verboten
    // combined = day * numRooms + room, dann pairwise !=
    const combinedVars: any[] = input.sessions.map((_, idx) =>
      dayVars[idx].times(numRooms).plus(roomVars[idx]),
    )
    for (let i = 0; i < input.sessions.length; i++) {
      for (let j = i + 1; j < input.sessions.length; j++) {
        const si = input.sessions[i]!
        const sj = input.sessions[j]!
        if (!slotsOverlap(si.slotTypes, sj.slotTypes)) continue
        model.addAllDifferent([combinedVars[i], combinedVars[j]])
      }
    }

    // Hard: Weekly Balance – Bool isInWeek via AllowedAssignments Table
    for (const w of input.weeklyBalance.weeks) {
      const indicesInWeek = input.days
        .map((d, idx) => (d.week === w ? idx : -1))
        .filter((idx) => idx !== -1)
      if (indicesInWeek.length === 0) continue

      const bools: any[] = []
      for (let s = 0; s < input.sessions.length; s++) {
        const b = model.newBoolVar(`inWeek_${w}_${input.sessions[s]!.id}`)
        const allowedPairs: number[][] = []
        for (let d = 0; d < numDays; d++) {
          const isInW = indicesInWeek.includes(d) ? 1 : 0
          allowedPairs.push([isInW, d])
        }
        model.addAllowedAssignments([b, dayVars[s]], allowedPairs)
        bools.push(b)
      }
      // sum bools in [lower, upper]
      let expr = bools[0]
      for (let k = 1; k < bools.length; k++) expr = expr.plus(bools[k])
      model.addLinearConstraint(expr, input.weeklyBalance.lowerPerWeek, input.weeklyBalance.upperPerWeek)
    }

    // Objective: Soft-Penalties (skaliert) + early-days Tie-Breaker (unskaliert)
    //
    // Review-Fix (#7): Da Tie-Breaker über rohe Tagesindizes (0..numDays-1)
    // summiert und damit bei vielen Sessions durch die Soft-Penalties spielen kann,
    // werden die ECHTEN Soft-Constraints mit einem grossen Faktor skaliert.
    // Der Tie-Breaker bleibt unskaliert — er kann nie dominieren, egal wie
    // viele Sessions/Tage, und entscheidet nur bei Gleichstand.
    let objective: any | null = null

    for (let s = 0; s < input.sessions.length; s++) {
      const sess = input.sessions[s]!
      for (const pen of sess.softPenalties) {
        const dIdx = dayIndex.get(pen.dayId)
        if (dIdx === undefined) continue
        const isThisDay = model.newBoolVar(`pen_${sess.id}_${pen.constraintId}_${dIdx}`)
        const allowedEq: number[][] = []
        for (let d = 0; d < numDays; d++) {
          allowedEq.push([d === dIdx ? 1 : 0, d])
        }
        model.addAllowedAssignments([isThisDay, dayVars[s]], allowedEq)
        // weight (skaliert) * bool
        const weighted = isThisDay.times(pen.weight * SOFT_PENALTY_SCALE)
        penaltyTerms.push(weighted)
      }
    }

    // Add penalty terms to objective
    if (penaltyTerms.length > 0) {
      objective = penaltyTerms[0]
      for (let i = 1; i < penaltyTerms.length; i++) objective = objective.plus(penaltyTerms[i])
    }

    // Always add small tie-breaker: frühe Tage bevorzugen (PREFER_EARLY_DATES)
    // UNskaliert — maximal numDays-1 pro Session, während Soft-Penalties mit
    // SOFT_PENALTY_SCALE skaliert sind -> der Tie-Breaker kann nie dominieren.
    let earlyTerm = dayVars[0].times(1)
    for (let i = 1; i < dayVars.length; i++) earlyTerm = earlyTerm.plus(dayVars[i])
    if (objective) {
      // Skaliere Early-Term klein: + 0.1 * day – aber int only, daher + day
      // Das ist akzeptabel: day-Bevorzugung mit Gewicht 1 vs. Soft 10-20
      objective = objective.plus(earlyTerm)
    } else {
      // Fallback: nur early + room (falls keine softPenalties)
      let obj = earlyTerm
      for (let i = 0; i < roomVars.length; i++) obj = obj.plus(roomVars[i])
      objective = obj
    }

    model.minimize(objective)

    const solver = new CpSolver()
    const params: Record<string, unknown> = {
      numSearchWorkers: options.numSearchWorkers ?? 4,
    }
    if (options.timeLimitSeconds !== undefined) {
      ;(params as any).maxTimeInSeconds = options.timeLimitSeconds
    }
    if (options.randomSeed !== undefined) {
      ;(params as any).randomSeed = options.randomSeed
    }

    const statusCode = await solver.solve(model, params as any)
    const statusName = solver.statusName(statusCode) as RawSolverResult['status']
    const normalizedStatus: RawSolverResult['status'] =
      statusName === 'OPTIMAL' || statusName === 'FEASIBLE' || statusName === 'INFEASIBLE' ? statusName : 'UNKNOWN'

    const objectiveValue = (() => {
      try {
        return solver.objectiveValue()
      } catch {
        return 0
      }
    })()

    if (normalizedStatus === 'INFEASIBLE' || normalizedStatus === 'UNKNOWN') {
      return {
        status: normalizedStatus,
        objectiveValue,
        assignments: [],
        solveTimeMs: Date.now() - start,
      }
    }

    const assignments = input.sessions.map((sess, idx) => {
      const dIdx = solver.value(dayVars[idx])
      const rIdx = solver.value(roomVars[idx])
      const dayId = input.days[dIdx]!.id
      const roomId = input.rooms[rIdx]!.id
      return { sessionId: sess.id, dayId, roomId }
    })

    return {
      status: normalizedStatus,
      objectiveValue,
      assignments,
      solveTimeMs: Date.now() - start,
    }
  }

  async solve(input: SolverInput, options?: SolveOptions): Promise<TimetableSolution> {
    const raw = await this.solveRaw(input, options)
    return explainSolution(input, raw, this.moduleNameById)
  }
}
