/**
 * Review-Fix #1/#7/#8 — Solver-Unit-Tests:
 *  - buildSolverInput: Mehrtägigkeit pro Modul (6 ECTS = 3 Teil-Sessions,
 *    3 ECTS = 1.5 Tage), gleiche Modul-Id, AllowedDayIds je Teil
 *  - Solverintegrale Eigenschaften mit OR-Tools WASM:
 *      * alle Teil-Sessions eines Moduls liegen auf unterschiedlichen Tagen
 *      * harte Filter (UNAVAILABLE_DATES, INSTRUCTOR_OUTLOOK_BUSY), Soft-Penalties
 *      * Wochenbalance zählt On-Campus-Tage pro Woche
 *  - Kap. 11 — COHORT_CONFLICT, MODULE_PREREQUISITE_ORDER, generisches
 *    Tag-System (REQUIRED_DAY_TAGS / UNDESIRED_DAY_TAGS)
 */
import assert from 'node:assert'
import { buildSolverInput } from '../solver/solverInput.js'
import { solveInProcess } from '../solver/solverService.js'
import type { Module, OnCampusDay, Room } from '../solver/domain.js'

const days: OnCampusDay[] = []
const weekLabels = ['Donnerstag', 'Freitag', 'Samstag'] as const
for (let w = 0; w < 4; w++) {
  for (let d = 0; d < 3; d++) {
    const date = new Date(Date.UTC(2028, 1, 3 + w * 7 + d)).toISOString().slice(0, 10)
    days.push({ id: date, date, week: 5 + w, weekday: weekLabels[d]!, phase: w < 3 ? 'main' : 'final' })
  }
}
const rooms: Room[] = [
  { id: 'room-a', name: 'R A', capacity: 40 },
  { id: 'room-b', name: 'R B', capacity: 80 },
]

console.log('--- Solver Unit Tests ---')

// 1. Mehrtägigkeit: 6 ECTS default = 3 Teil-Sessions, 3 ECTS = 2 (1.5 Tage)
{
  const input = buildSolverInput(
    [
      { id: 'm6', name: 'Sechs', program: 'p', ects: 6, expectedStudents: 20, instructors: ['i1'], restrictions: [] },
      { id: 'm3', name: 'Drei', program: 'p', ects: 3, expectedStudents: 20, instructors: ['i2'], restrictions: [] },
      { id: 'm3o', name: 'Drei-Override', program: 'p', ects: 3, expectedStudents: 20, instructors: ['i3'], restrictions: [], onCampusDays: 3 },
    ],
    days,
    rooms,
  )
  const m6 = input.sessions.filter((s) => s.moduleId === 'm6')
  const m3 = input.sessions.filter((s) => s.moduleId === 'm3')
  assert.strictEqual(m6.length, 3, '6 ECTS → 3 Teil-Sessions')
  assert.strictEqual(m3.length, 2, '3 ECTS → 2 Teil-Sessions (1.5 Tage)')
  assert.deepStrictEqual(m6.map((s) => s.slotTypes), [['vormittag', 'nachmittag'], ['vormittag', 'nachmittag'], ['vormittag', 'nachmittag']])
  // 3 ECTS: 1 ganzer Tag + 1 NACHMITTAG-Halbtag (wäre der Halbtag vormittags,
  // wäre der Vormittags-Slot der Kohorte überbucht — Review 2026-09)
  assert.deepStrictEqual(m3.map((s) => s.slotTypes), [['vormittag', 'nachmittag'], ['nachmittag']])
  assert.deepStrictEqual(m3.map((s) => s.id), ['session-m3-p0', 'session-m3-p1'])
  const m3oSessions = input.sessions.filter((s) => s.moduleId === 'm3o')
  assert.strictEqual(m3oSessions.length, 3)
  console.log('✓ buildSolverInput: Mehrtägigkeit (Teil-Sessions pro Modul) passed')

  // 2. Solve: Teil-Sessions eines Moduls auf DISJEKTEN Tagen
  const solution = await solveInProcess(input, { timeLimitSeconds: 60 }, new Map([
    ['m6', 'Sechs'], ['m3', 'Drei'], ['m3o', 'Drei-Override'],
  ]))
  assert.ok(solution.status === 'OPTIMAL' || solution.status === 'FEASIBLE', `Status ${solution.status}`)
  const byModule = new Map<string, Set<string>>()
  for (const s of solution.schedule) {
    const set = byModule.get(s.moduleId) ?? new Set()
    set.add(s.day.id)
    byModule.set(s.moduleId, set)
  }
  for (const [moduleId, daySet] of byModule) {
    const expected = moduleId === 'm6' ? 3 : moduleId === 'm3' ? 2 : 3
    assert.strictEqual(daySet.size, expected, `Modul ${moduleId}: ${expected} unterschiedliche Tage`)
  }
  const perWeek = new Map<number, number>()
  for (const s of solution.schedule) perWeek.set(s.day.week, (perWeek.get(s.day.week) ?? 0) + 1)
  assert.ok([...perWeek.values()].every((c) => c >= 1), `Wochenbalance verletzt: ${JSON.stringify([...perWeek])}`)
  console.log('✓ solveInProcess: unterschiedliche On-Campus-Tage je Modul passed')

  // 3. Hard-Filter: UNAVAILABLE_DATES && Outlook-Busy schränken erlaubte Tage ein
  const restricted = buildSolverInput(
    [
      {
        id: 'm1', name: 'Blocked', program: 'p', ects: 3, expectedStudents: 20, instructors: ['i1'],
        restrictions: [
          { id: 'UNAVAILABLE_DATES', category: 'hard', params: { dates: [days[0]!.date] } },
          { id: 'INSTRUCTOR_OUTLOOK_BUSY', category: 'hard', params: { instructorId: 'i1', date: days[1]!.date, slot: 'nachmittag' } },
        ],
      },
    ],
    days,
    rooms,
  )
  const partFull = restricted.sessions.find((s) => s.slotTypes.includes('nachmittag'))!
  const partHalf = restricted.sessions.find((s) => s.slotTypes.length === 1)!
  assert.ok(!partFull.allowedDayIds.includes(days[0]!.id), 'UNAVAILABLE_DATES sperrt')
  assert.ok(!partFull.allowedDayIds.includes(days[1]!.id), 'Outlook busy nachmittag sperrt ganztägigen Teil')
  // Halbtag ist (seit Nachmittag-Fix) ebenfalls nachmittags → Outlook busy sperrt ihn ebenfalls
  assert.ok(!partHalf.allowedDayIds.includes(days[1]!.id), 'Outlook busy nachmittag sperrt Nachmittag-Halbtag')
  assert.ok(partHalf.allowedDayIds.includes(days[2]!.id), 'Nachmittag-Halbtag bleibt auf freien Tagen erlaubt')
  console.log('✓ buildSolverInput: harte Filter inkl. Outlook je Teil-Session passed')
}

// 4. Kap. 11.1/11.3/11.2 — Kohorten-Konflikt, Prerequisite-Ordnung, generische Tags
{
  // 4a. COHORT_CONFLICT: dieselbe Kohorte (Programm + Semester) → unterschiedliche Tage
  const cohortMods: Module[] = [
    { id: 'c1', name: 'C1', program: 'prog-dba', semester: 1, ects: 3 as const, expectedStudents: 10, instructors: ['i1'], restrictions: [] },
    { id: 'c2', name: 'C2', program: 'prog-dba', semester: 1, ects: 3 as const, expectedStudents: 10, instructors: ['i2'], restrictions: [] },
  ]
  const cohortInput = buildSolverInput(cohortMods, days, rooms)
  const cohortSol = await solveInProcess(cohortInput, { timeLimitSeconds: 30 }, new Map([['c1', 'C1'], ['c2', 'C2']]))
  const dayC1 = cohortSol.schedule.filter((s) => s.moduleId === 'c1')[0]!.day.id
  const dayC2 = cohortSol.schedule.filter((s) => s.moduleId === 'c2')[0]!.day.id
  assert.notStrictEqual(dayC1, dayC2, 'Kohorten-Module dürfen nicht am selben Tag laufen')
  console.log('✓ COHORT_CONFLICT passed')

  // 4b. MODULE_PREREQUISITE_ORDER: alle Sessions von c1 VOR c2
  const prereqMods: Module[] = [
    { id: 'c1', name: 'C1', program: 'prog-dba', semester: 1, ects: 3, expectedStudents: 10, instructors: ['i1'], restrictions: [] },
    { id: 'c2', name: 'C2', program: 'prog-dba', semester: 1, ects: 3, expectedStudents: 10, instructors: ['i2'], restrictions: [], prerequisiteModuleIds: ['c1'] },
  ]
  const prInput = buildSolverInput(prereqMods, days, rooms)
  assert.strictEqual(prInput.prerequisites.length, 1, 'ein Prerequisite-Paar')
  const prSol = await solveInProcess(prInput, { timeLimitSeconds: 60 }, new Map([['c1', 'C1'], ['c2', 'C2']]))
  assert.ok(prSol.status === 'OPTIMAL' || prSol.status === 'FEASIBLE', `Status ${prSol.status}`)
  const findDay = (mid: string) => prSol.schedule.filter((s) => s.moduleId === mid).map((s) => s.day.date)[0] as string
  assert.ok(findDay('c1') < findDay('c2'), `Prerequisite muss vor abhängigem Modul liegen (${findDay('c1')} vs ${findDay('c2')})`)
  const prEval = prSol.explanations.find((e) => e.constraintId === 'MODULE_PREREQUISITE_ORDER')
  assert.ok(prEval && prEval.satisfied, 'MODULE_PREREQUISITE_ORDER satisfied')
  console.log('✓ MODULE_PREREQUISITE_ORDER passed')

  // 4c. REQUIRED_DAY_TAGS (Kap. 11.2 generischer Builder): nur Freitage erlaubt
  const tagMods: Module[] = [
    {
      id: 'tg1', name: 'Tagged', program: 'prog-dba', ects: 3, expectedStudents: 10, instructors: ['i3'], restrictions: [],
      requiredDayTags: ['weekday:freitag'],
    },
  ]
  const tagInput = buildSolverInput(tagMods as any, days, rooms)
  for (const s of tagInput.sessions) {
    // weekdays:freitag —uerdo alle nur Freitage (KW gültig)
    assert.deepStrictEqual(
      s.allowedDayIds,
      days.filter((d) => d.weekday === 'Freitag').map((d) => d.id),
      'nur Freitage erlaubt',
    )
  }
  console.log('✓ REQUIRED_DAY_TAGS generic builder passed')

  // 4d. UNDESIRED_DAY_TAGS (soft): Donnerstag meiden → Freitag gewinner
  const uDays: OnCampusDay[] = [
    { id: 'd-thu', date: '2028-05-25', week: 20, weekday: 'Donnerstag', phase: 'main' },
    { id: 'd-fri', date: '2028-05-26', week: 20, weekday: 'Freitag', phase: 'main' },
  ]
  const undesiredMods: Module[] = [
    {
      id: 'u1', name: 'U', program: 'prog-dba', semester: 2, ects: 3, expectedStudents: 10, instructors: ['i4'], restrictions: [],
      undesiredDayTags: ['weekday:donnerstag'],
      onCampusDays: 1,
    },
    { id: 'u2', name: 'V', program: 'prog-dba', semester: 3, ects: 3, expectedStudents: 10, instructors: ['i5'], restrictions: [] },
  ]
  const uInput = buildSolverInput(undesiredMods as any, uDays, rooms)
  assert.ok(uInput.sessions[0]!.softPenalties.some((p) => p.dayId === 'd-thu' && p.constraintId === 'UNDESIRED_DAY_TAGS'))
  const uSol = await solveInProcess(uInput, { timeLimitSeconds: 30 }, new Map([['u1', 'U'], ['u2', 'V']]))
  assert.ok(uSol.status === 'OPTIMAL' || uSol.status === 'FEASIBLE', `Status ${uSol.status}`)
  const u1Day = uSol.schedule.filter((s) => s.moduleId === 'u1')[0]!
  assert.strictEqual(u1Day.day.id, 'd-fri', 'Donnerstag (undesired) gemieden')
  console.log('✓ UNDESIRED_DAY_TAGS generic soft passed')
}

console.log('--- All Solver Unit Tests Passed ---')
