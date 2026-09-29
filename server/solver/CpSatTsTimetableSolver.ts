/**
 * Kap. 3.1 + 3.2 — CP-SAT Model Builder (Stufe 3) — cp-sat-ts-Engine.
 * Ablöse für or-tools-wasm: gleiches Modell, gleiche Soft/Hard-Semantik,
 * aber über das pure-TypeScript-Paket `cp-sat-ts`
 * (https://github.com/hedypamungkas/cp-sat-typescript — "cp-sat-ts").
 * Kennt keine Restriction-Objekte, nur SolverInput (Stufe 2).
 */

import { CpModel, CpSolver, LinearExpr } from 'cp-sat-ts'
import type { SolverInput } from './solverInput.js'
import type { RawSolverResult, SolveOptions, TimetableSolution } from './types.js'
import type { TimetableSolver } from './TimetableSolver.js'
import { explainSolution } from './explainSolution.js'
import { SOFT_PENALTY_SCALE, resolveWeight } from './constraintCatalog.js'

function slotsOverlap(a: string[], b: string[]): boolean {
  return a.some((s) => b.includes(s))
}

/* IntVarImpl.Basis-API hier: add/sub/mul (kein .minus/.times wie bei or-tools-wasm) */
type IntV = ReturnType<CpModel['newIntVar']>

export class CpSatTsTimetableSolver implements TimetableSolver {
  constructor(private moduleNameById: Map<string, string> = new Map()) {}

  async solveRaw(input: SolverInput, options: SolveOptions = {}): Promise<RawSolverResult> {
    const start = Date.now()
    const model = new CpModel()

    const dayIndex = new Map(input.days.map((d, i) => [d.id, i]))
    const roomIndex = new Map(input.rooms.map((r, i) => [r.id, i]))
    const numDays = input.days.length
    const numRooms = input.rooms.length

    if (numDays === 0 || numRooms === 0 || input.sessions.length === 0) {
      throw new Error('SolverInput leer: days/rooms/sessions erforderlich')
    }

    const dayVars: IntV[] = []
    const roomVars: IntV[] = []

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

    // Hard: Dozenten-/Kohorten-Overlap – überlappende SlotTypes, gleicher Tag -> verboten
    for (let i = 0; i < input.sessions.length; i++) {
      for (let j = i + 1; j < input.sessions.length; j++) {
        const si = input.sessions[i]!
        const sj = input.sessions[j]!
        if (si.moduleId === sj.moduleId) {
          model.addAllDifferent([dayVars[i], dayVars[j]])
          continue
        }
        if (!slotsOverlap(si.slotTypes, sj.slotTypes)) continue
        // data-model-comparison.md §3.1 — Kohorte auch über Class-Überschneidung
        // (Kohorten-Verbindlichkeit gilt zusätzlich zu Programm+Semester).
        const sameClass =
          (si.classIds ?? []).some((c) => (sj.classIds ?? []).includes(c))
        const cohortSame =
          sameClass ||
          (si.program === sj.program &&
          (si.semester ?? 'default') === (sj.semester ?? 'default'))
        if (cohortSame) {
          model.addAllDifferent([dayVars[i], dayVars[j]])
          continue
        }
        const shared = si.instructorIds.some((id) => sj.instructorIds.includes(id))
        if (!shared) continue
        model.addAllDifferent([dayVars[i], dayVars[j]])
      }
    }

    const penaltyTerms: LinearExpr[] = []

    // Kap. 10.1 / 11.3 — Hard: MODULE_PREREQUISITE_ORDER (dvA < dvB)
    for (const prereq of input.prerequisites) {
      const aIndices = input.sessions
        .map((s, idx) => (s.moduleId === prereq.prerequisiteModuleId ? idx : -1))
        .filter((idx) => idx >= 0)
      const bIndices = input.sessions
        .map((s, idx) => (s.moduleId === prereq.dependentModuleId ? idx : -1))
        .filter((idx) => idx >= 0)
      for (const ai of aIndices) {
        for (const bi of bIndices) {
          // dvA - dvB <= -1  ⇔ dvA < dvB
          model.addLinearConstraint(
            LinearExpr.fromVar(dayVars[ai]!).sub(dayVars[bi]!),
            -numDays,
            -1,
          )
        }
      }
    }

    // Kap. 11.4 — Soft: TEACHER_ROOM_STABILITY
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
        model.addAbsEquality(diff, LinearExpr.fromVar(ri).sub(rj))
        penaltyTerms.push(diff.mul(roomPenaltyWeight))
      }
    }

    // Kap. 11.4 — Soft: TEACHER_MAKESPAN
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
      penaltyTerms.push(
        LinearExpr.fromVar(maxVar).sub(minVar).mul(makespanWeight),
      )
    }

    // Hard: Raum-Kollision – gleiche (day,room) bei überlappenden Slots verboten.
    // combined als echte IntVar (AllDifferent über Variablen, nicht Ausdrücke)
    const combinedVars: IntV[] = input.sessions.map((_, idx) => {
      const cv = model.newIntVar(0, numDays * numRooms - 1, `combined_${idx}`)
      model.add(
        LinearExpr.fromVar(dayVars[idx]!).mul(numRooms).add(roomVars[idx]!).eq(cv),
      )
      return cv
    })
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

      const bools: IntV[] = []
      for (let s = 0; s < input.sessions.length; s++) {
        const b = model.newBoolVar(`inWeek_${w}_${input.sessions[s]!.id}`)
        const allowedPairs: number[][] = []
        for (let d = 0; d < numDays; d++) {
          const isInW = indicesInWeek.includes(d) ? 1 : 0
          allowedPairs.push([isInW, d])
        }
        model.addAllowedAssignments([b as unknown as IntV, dayVars[s]], allowedPairs)
        bools.push(b as unknown as IntV)
      }
      let expr = LinearExpr.fromVar(bools[0]!)
      for (let k = 1; k < bools.length; k++) expr = expr.add(bools[k]!)
      model.addLinearConstraint(expr, input.weeklyBalance.lowerPerWeek, input.weeklyBalance.upperPerWeek)
    }

    // Objective: Soft-Penalties (skaliert) + early-days Tie-Breaker (unskaliert)
    let objective: LinearExpr | null = null

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
        model.addAllowedAssignments([isThisDay as unknown as IntV, dayVars[s]], allowedEq)
        penaltyTerms.push(LinearExpr.fromVar(isThisDay).mul(pen.weight * SOFT_PENALTY_SCALE))
      }
    }

    if (penaltyTerms.length > 0) {
      objective = penaltyTerms[0]!
      for (let i = 1; i < penaltyTerms.length; i++) objective = objective.add(penaltyTerms[i]!)
    }

    let earlyTerm = LinearExpr.fromVar(dayVars[0]!).mul(1)
    for (let i = 1; i < dayVars.length; i++) earlyTerm = earlyTerm.add(dayVars[i]!)
    if (objective) {
      objective = objective.add(earlyTerm)
    } else {
      let obj = earlyTerm
      for (let i = 0; i < roomVars.length; i++) obj = obj.add(roomVars[i]!)
      objective = obj
    }

    model.minimize(objective)

    const solver = new CpSolver()
    solver.parameters.maxTimeInSeconds = options.timeLimitSeconds
    solver.parameters.randomSeed = options.randomSeed ?? 1
    // numWorkers ist beim synchronen solve() ein dokumentierter No-op; parallele
    // Diversifikation kommt durch unseren eigenen Worker-Thread (Kap. 2).

    const status = solver.solve(model)
    const statusName = solver.statusName(status)!
    const normalizedStatus: RawSolverResult['status'] =
      statusName === 'OPTIMAL' || statusName === 'FEASIBLE' || statusName === 'INFEASIBLE' ? statusName : 'UNKNOWN'

    let objectiveValue = 0
    try {
      objectiveValue = solver.objectiveValue
    } catch {
      objectiveValue = 0
    }

    // Parser-Kompatibilität: der Worker postet msg.raw — unverändert.
    if (normalizedStatus === 'INFEASIBLE' || normalizedStatus === 'UNKNOWN') {
      return {
        status: normalizedStatus,
        objectiveValue,
        assignments: [],
        solveTimeMs: Date.now() - start,
      }
    }

    const assignments = input.sessions.map((sess, idx) => {
      const dIdx = solver.value(dayVars[idx]!)
      const rIdx = solver.value(roomVars[idx]!)
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
