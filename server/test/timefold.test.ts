/**
 * Tests für den Timefold-Client:
 *  - buildTimefoldRequest zeigt dieselbe Struktur wie SolveApi.toProblem
 *  - HTTP-Roundtrip gegen den echten Timefold-Service (wenn TIMEFOLD_URL erreichbar)
 *  - cohort conflict via lokaler Fallback-Engine (Solver-Referenz, immer aktiv)
 */
import assert from 'node:assert'
import { buildTimefoldRequest, timefoldUrl, timefoldHealth } from '../solver/TimefoldClientTimetableSolver.js'
import { TimefoldHybridSolver } from '../solver/engine.js'
import { solveInProcess } from '../solver/solverService.js'
import type { SolverInput } from '../solver/solverInput.js'
import type { OnCampusDay, Room } from '../solver/domain.js'

console.log('--- Timefold Client Mapping Tests ---')

// environment resolution (lokal isoliert: danach echte Konfiguration wiederherstellen)
const liveTimefoldUrlEnv = process.env.TIMEFOLD_URL // Konfiguration sichern — untere Abschnitte nutzen sie
delete process.env.TIMEFOLD_URL
assert.strictEqual(timefoldUrl(), null)
process.env.TIMEFOLD_URL = 'http://localhost:8081'
assert.strictEqual(timefoldUrl(), 'http://localhost:8081')
process.env.TIMEFOLD_URL = 'http://localhost:8081/   '
assert.strictEqual(timefoldUrl(), 'http://localhost:8081')
process.env.TIMEFOLD_URL = liveTimefoldUrlEnv // Original-Zustand restoren
delete process.env.TIMEFOLD_URL // danach: HTTP-Roundtrip-Block setzt neu

const days: OnCampusDay[] = [
  { id: 'd1', date: '2027-03-04', week: 10, weekday: 'Donnerstag', phase: 'main' },
  { id: 'd2', date: '2027-03-05', week: 10, weekday: 'Freitag', phase: 'main' },
  { id: 'd3', date: '2027-03-06', week: 10, weekday: 'Samstag', phase: 'main' },
]
const rooms: Room[] = [
  { id: 'r1', name: 'A101', capacity: 30 },
  { id: 'r2', name: 'A102', capacity: 30 },
]
const sessions: SolverInput['sessions'] = [
  {
    id: 'sess-1',
    moduleId: 'mod-a',
    program: 'prog-dba',
    semester: 1,
    slotTypes: ['vormittag'],
    expectedStudents: 20,
    instructorIds: ['instr-1'],
    allowedDayIds: days.map(d => d.id),
    allowedRoomIds: rooms.map(r => r.id),
    softPenalties: [],
  },
  {
    id: 'sess-2',
    moduleId: 'mod-b',
    program: 'prog-dba',
    semester: 1,
    slotTypes: ['vormittag'],
    expectedStudents: 20,
    instructorIds: ['instr-2'],
    allowedDayIds: ['d2', 'd3'],
    allowedRoomIds: ['r2'],
    softPenalties: [],
  },
]

const input: SolverInput = {
  sessions,
  days,
  rooms,
  prerequisites: [{ dependentModuleId: 'mod-b', prerequisiteModuleId: 'mod-a' }],
  weeklyBalance: { weeks: [10], lowerPerWeek: 0, upperPerWeek: 2 },
}

// Map request shape
const req = buildTimefoldRequest(input, { timeLimitSeconds: 10, randomSeed: 7 })
assert.strictEqual(req.sessions.length, 2)
assert.strictEqual(req.days.length, 3)
assert.strictEqual(req.rooms.length, 2)
assert.strictEqual(req.prerequisites.length, 1)
assert.strictEqual(req.prerequisites[0]!.prerequisiteModuleId, 'mod-a')
assert.deepStrictEqual(req.sessions[0]!.softPenalties, [])
assert.strictEqual(req.options.timeLimitSeconds, 10)
assert.strictEqual(req.options.randomSeed, 7)
assert.strictEqual(req.weeklyBalance.upperPerWeek, 2)
console.log('✓ buildTimefoldRequest payload shape passed')

// HTTP-Roundtrip gegen den echten Timefold-Service — NUR wenn er konfiguriert ist.
const liveTimefoldUrl = liveTimefoldUrlEnv // Original-Env (oben gesichert)
if (liveTimefoldUrl) {
  process.env.TIMEFOLD_URL = liveTimefoldUrl.trim()
}
if (await timefoldHealth()) {
  process.env.SOLVER_ENGINE = 'timefold'
  const tfResult = await new TimefoldHybridSolver().solve(input, { timeLimitSeconds: 30 })
  assert.strictEqual(tfResult.schedule.length, 2)
  const tfA = tfResult.schedule.find(x => x.moduleId === 'mod-a')!
  const tfB = tfResult.schedule.find(x => x.moduleId === 'mod-b')!
  assert.notStrictEqual(tfA.day.id, tfB.day.id)
  console.log(`✓ Timefold HTTP round-trip via ${timefoldUrl()} passed`)
} else {
  console.log('- Timefold-Service nicht konfiguriert — HTTP-Roundtrip übersprungen')
}

// Fallback-Referenz: kohortenkonfliktfrei via lokaler Engine (immer aktiv)
delete process.env.TIMEFOLD_URL
process.env.SOLVER_ENGINE = 'cp-sat-ts'
const result = await solveInProcess(input, { timeLimitSeconds: 20, randomSeed: 11 })
assert.strictEqual(result.schedule.length, 2)
const schedModA = result.schedule.find(x => x.moduleId === 'mod-a')!
const schedModB = result.schedule.find(x => x.moduleId === 'mod-b')!
assert.notStrictEqual(schedModA.day.id, schedModB.day.id)
console.log('✓ cohort conflict solved (in-process reference) passed')
console.log('--- All Timefold Client Mapping Tests Passed ---')
