// CP-SAT Stundenplan-Planung via or-tools-wasm (Google OR-Tools)
// Browser-fähig (WASM Threads) – erfordert COOP/COEP Header (siehe vite.config.ts)
import { CpModel, CpSolver } from 'or-tools-wasm/cp-sat'

export interface HalfDaySlot {
  date: string // YYYY-MM-DD
  weekday: 'thursday' | 'friday' | 'saturday'
  period: 'morning' | 'afternoon'
}

export interface TimetableModule {
  _id: string
  title: string
  expected_students?: number
  required_room_features?: string[]
  scheduling_constraint?: {
    must_not_overlap_with_module_ids?: string[]
  }
}

export interface TimetableRoom {
  _id: string
  name: string
  capacity: number
}

export interface TimetableBlock {
  _id: string
  module_id: string
  slots?: HalfDaySlot[]
  room_id?: string
  instructor_ids: string[]
}

export interface TimetableInstructor {
  _id: string
  name: string
}

export interface SolveResult {
  status: string
  statusCode: number
  assignments: Array<{ blockId: string; slot: HalfDaySlot; roomId: string }>
  objectiveValue?: number
  solveTimeMs: number
}

// Hilfsfunktion: einfache Demo (desks/tables aus README)
export async function solveSimpleDemo(): Promise<{ status: string; desks: number; tables: number; profit: number }> {
  const model = new CpModel()
  const desks = model.newIntVar(0, 4, 'desks')
  const tables = model.newIntVar(0, 3, 'tables')
  // 3*desks + 4*tables <= 12
  model.addLinearConstraint(desks.times(3).plus(tables.times(4)), 0, 12)
  model.maximize(desks.times(20).plus(tables.times(30)))
  const solver = new CpSolver()
  const status = await solver.solve(model, { numSearchWorkers: 1 })
  return {
    status: solver.statusName(status),
    desks: solver.value(desks),
    tables: solver.value(tables),
    profit: solver.objectiveValue(),
  }
}

/**
 * Stundenplan CP-SAT – vereinfachtes Modell:
 * - Jeder Block wählt genau einen Zeitslot und einen Raum.
 * - Constraints:
 *   - Dozent Doppelbuchung: gleicher Slot => Dozent darf nur in einem Block sein (AllDifferent je Dozent)
 *   - Unverfügbarkeit: Block darf nicht auf unverfügbaren Slot eines Dozenten
 *   - Modul-Exklusion: muss-not-overlap Module dürfen nicht gleichen Slot belegen
 *   - Raum-Kapazität: expected_students > seats verbietet Raum
 * - Objective: minimiere Slot- + Raum-Index (frühe Termine, kleine Räume)
 */
export async function solveTimetable(
  blocks: TimetableBlock[],
  rooms: TimetableRoom[],
  slots: HalfDaySlot[],
  _instructors: TimetableInstructor[],
  instructorAvailability?: Array<{ instructor_id: string; unavailable_half_days: HalfDaySlot[] }>,
  moduleMap?: Map<string, TimetableModule>,
): Promise<SolveResult> {
  const start = Date.now()
  const model = new CpModel()

  const numSlots = slots.length
  const numRooms = rooms.length
  if (numSlots === 0 || numRooms === 0 || blocks.length === 0) {
    throw new Error('Slots, Räume oder Blöcke fehlen')
  }

  const slotKey = (s: HalfDaySlot) => `${s.date}_${s.period}`

  const unavailableByInstr = new Map<string, Set<string>>()
  instructorAvailability?.forEach((a) => {
    unavailableByInstr.set(a.instructor_id, new Set(a.unavailable_half_days.map(slotKey)))
  })

  const slotVars = blocks.map((b) => model.newIntVar(0, numSlots - 1, `slot_${b._id}`))
  const roomVars = blocks.map((b) => model.newIntVar(0, numRooms - 1, `room_${b._id}`))

  // Dozent darf nicht doppelt: alle Slots seiner Blöcke verschieden
  const blocksByInstr = new Map<string, number[]>()
  blocks.forEach((b, idx) => {
    b.instructor_ids.forEach((iid) => {
      if (!blocksByInstr.has(iid)) blocksByInstr.set(iid, [])
      blocksByInstr.get(iid)!.push(idx)
    })
  })
  for (const [, idxs] of blocksByInstr) {
    if (idxs.length > 1) {
      const vars = idxs.map((i) => slotVars[i]!).filter(Boolean)
      model.addAllDifferent(vars)
    }
  }

  // Unverfügbarkeit
  blocks.forEach((b, idx) => {
    const forbiddenIndices: number[] = []
    b.instructor_ids.forEach((iid) => {
      const unavail = unavailableByInstr.get(iid)
      if (!unavail) return
      slots.forEach((s, sIdx) => {
        if (unavail.has(slotKey(s))) forbiddenIndices.push(sIdx)
      })
    })
    if (forbiddenIndices.length) {
      const allowed = Array.from({ length: numSlots }, (_, i) => i).filter((i) => !forbiddenIndices.includes(i))
      if (allowed.length === 0) throw new Error(`Kein verfügbarer Slot für Block ${b._id}`)
      model.addAllowedAssignments([slotVars[idx]!], allowed.map((v) => [v]))
    }
  })

  // Raum Kapazität
  if (moduleMap) {
    blocks.forEach((b, idx) => {
      const mod = moduleMap.get(b.module_id)
      if (!mod?.expected_students) return
      const forbiddenRooms: number[] = []
      rooms.forEach((r, rIdx) => {
        if (r.capacity < mod.expected_students!) forbiddenRooms.push(rIdx)
      })
      if (forbiddenRooms.length) {
        const allowed = Array.from({ length: numRooms }, (_, i) => i).filter((i) => !forbiddenRooms.includes(i))
        if (allowed.length === 0) throw new Error(`Kein passender Raum für Block ${b._id}`)
        model.addAllowedAssignments([roomVars[idx]!], allowed.map((v) => [v]))
      }
    })
  }

  // Modul-Exklusion: verschiedene Slots
  if (moduleMap) {
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const m1 = moduleMap.get(blocks[i]!.module_id)
        const m2 = moduleMap.get(blocks[j]!.module_id)
        const excl =
          m1?.scheduling_constraint?.must_not_overlap_with_module_ids?.includes(blocks[j]!.module_id) ||
          m2?.scheduling_constraint?.must_not_overlap_with_module_ids?.includes(blocks[i]!.module_id)
        if (excl) {
          model.addAllDifferent([slotVars[i]!, slotVars[j]!])
        }
      }
    }
  }

  // Objective: minimiere Summe Slot + Raum
  let obj = slotVars[0]!.times(1)
  for (let i = 1; i < slotVars.length; i++) obj = obj.plus(slotVars[i]!)
  for (let i = 0; i < roomVars.length; i++) obj = obj.plus(roomVars[i]!)
  model.minimize(obj)

  const solver = new CpSolver()
  const status = await solver.solve(model, { numSearchWorkers: 4 })

  const statusName = solver.statusName(status)
  const assignments = blocks.map((b, idx) => {
    const sIdx = solver.value(slotVars[idx]!)
    const rIdx = solver.value(roomVars[idx]!)
    const slot = slots[sIdx]
    const roomId = rooms[rIdx]!._id
    if (!slot) throw new Error(`Kein Slot für Block ${b._id}`)
    return {
      blockId: b._id,
      slot,
      roomId,
    }
  })

  return {
    status: statusName,
    statusCode: status as number,
    assignments,
    objectiveValue: solver.objectiveValue(),
    solveTimeMs: Date.now() - start,
  }
}
