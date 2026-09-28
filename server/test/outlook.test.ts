/**
 * Tests für Abschnitt 9 Outlook-Anbindung:
 *  - slotStatusFromAvailabilityView (Status→Status-Mapping nach aktueller Doku)
 *  - toRestrictions (stabile IDs in den Constraint-Katalog, 9.3)
 *  - buildSolverInput integriert INSTRUCTOR_OUTLOOK_* Restrictions (9.3/9.4)
 */
import assert from 'node:assert'
import { slotStatusFromAvailabilityView, toRestrictions, mapScheduleToRestrictions } from '../outlook/availability.js'
import { buildSolverInput } from '../solver/solverInput.js'
import type { Module, OnCampusDay, Room } from '../solver/domain.js'

console.log('--- Starting Outlook Integration Tests ---')

const dayStart = new Date('2027-02-15T00:00:00')

/** 15-Min-Raster: '0'=free ... '3'=oof, '4'=workingElsewhere */
function view(firstCode: string, from = '08:00', to = '12:00'): string {
  const toMin = Number(to.slice(0, 2)) * 60 + Number(to.slice(3, 5))
  const fromMin = Number(from.slice(0, 2)) * 60 + Number(from.slice(3, 5))
  const total = 24 * 60
  let out = ''
  for (let m = 0; m < total; m += 15) {
    out += m >= fromMin && m < toMin ? firstCode : '0'
  }
  return out
}

// 1. free + workingElsewhere => free
assert.strictEqual(slotStatusFromAvailabilityView(view('0'), dayStart, 15, 'vormittag'), 'free')
const allWorkingElsewhere = '4'.repeat(24 * 4)
assert.strictEqual(slotStatusFromAvailabilityView(allWorkingElsewhere, dayStart, 15, 'vormittag'), 'free')

// 2. tentative (nur '1') => tentative
assert.strictEqual(slotStatusFromAvailabilityView(view('1'), dayStart, 15, 'vormittag'), 'tentative')

// 3. busy => blocked, auch wenn restlich free
assert.strictEqual(slotStatusFromAvailabilityView(view('2'), dayStart, 15, 'vormittag'), 'blocked')

// 4. oof => blocked
assert.strictEqual(slotStatusFromAvailabilityView(view('3', '13:00', '17:00'), dayStart, 15, 'nachmittag'), 'blocked')

// 5. abend mit workingElsewhere + free => free; einzelnes unknown-Zeichen => unknown
assert.strictEqual(slotStatusFromAvailabilityView(allWorkingElsewhere, dayStart, 15, 'abend'), 'free')
assert.strictEqual(slotStatusFromAvailabilityView('', dayStart, 15, 'vormittag'), 'unknown')
console.log('✓ slotStatusFromAvailabilityView mapping passed')

// 6. toRestrictions — stabile Katalog-IDs
const day = { id: '2027-02-15', date: '2027-02-15', week: 7, weekday: 'Donnerstag', phase: 'main' } as const
assert.deepStrictEqual(toRestrictions('instr-1', day, 'vormittag', 'blocked'), [
  { id: 'INSTRUCTOR_OUTLOOK_BUSY', category: 'hard', params: { instructorId: 'instr-1', date: '2027-02-15', dayId: '2027-02-15', slot: 'vormittag' } },
])
assert.strictEqual(toRestrictions('instr-1', day, 'vormittag', 'tentative')[0]!.weight, 15)
assert.strictEqual(toRestrictions('instr-1', day, 'vormittag', 'unknown')[0]!.weight, 5)
assert.deepStrictEqual(toRestrictions('instr-1', day, 'vormittag', 'free'), [])
console.log('✓ toRestrictions stable catalog IDs passed')

// 7. buildSolverInput: Outlook busy sperrt betroffenen Tag (Slot-Überlappung)
const days: OnCampusDay[] = [
  { id: 'd1', date: '2027-02-15', week: 7, weekday: 'Donnerstag', phase: 'main' },
  { id: 'd2', date: '2027-02-16', week: 7, weekday: 'Freitag', phase: 'main' },
]
const rooms: Room[] = [{ id: 'r1', name: 'R', capacity: 30, }]
const modules: Module[] = [
  {
    id: 'mod-1',
    name: 'Testmodul',
    program: 'prog-dba',
    ects: 6,
    expectedStudents: 20,
    instructors: ['instr-1'],
    restrictions: [
      { id: 'INSTRUCTOR_OUTLOOK_BUSY', category: 'hard', params: { instructorId: 'instr-1', date: '2027-02-15', slot: 'vormittag' } },
    ],
  },
]
const input = buildSolverInput(modules, days, rooms)
assert.strictEqual(input.sessions[0]!.allowedDayIds.length, 1)
assert.strictEqual(input.sessions[0]!.allowedDayIds[0], 'd2')

// 8. nicht betroffener Instructor / nicht überlappender Slot sperrt nicht
const modules2: Module[] = [
  {
    id: 'mod-1',
    name: 'Testmodul',
    program: 'prog-dba',
    ects: 3, // default slotTypes: ['vormittag']
    expectedStudents: 20,
    instructors: ['instr-1'],
    restrictions: [
      { id: 'INSTRUCTOR_OUTLOOK_BUSY', category: 'hard', params: { instructorId: 'instr-1', date: '2027-02-15', slot: 'abend' } },
      { id: 'INSTRUCTOR_OUTLOOK_BUSY', category: 'hard', params: { instructorId: 'instr-9', date: '2027-02-15', slot: 'vormittag' } },
    ],
  },
]
const input2 = buildSolverInput(modules2, days, rooms)
assert.deepStrictEqual(input2.sessions[0]!.allowedDayIds, ['d1', 'd2'])

// 9. tentative/unknown erzeugen Soft-Penalties mit Katalog-Gewicht
const modules3: Module[] = [
  {
    id: 'mod-1',
    name: 'Testmodul',
    program: 'prog-dba',
    ects: 3,
    expectedStudents: 20,
    instructors: ['instr-1'],
    restrictions: [
      { id: 'INSTRUCTOR_OUTLOOK_TENTATIVE', category: 'soft', params: { instructorId: 'instr-1', date: '2027-02-15', slot: 'vormittag' } },
      { id: 'INSTRUCTOR_OUTLOOK_UNKNOWN', category: 'soft', params: { instructorId: 'instr-1', date: '2027-02-16', slot: 'vormittag' } },
    ],
  },
]
const input3 = buildSolverInput(modules3, days, rooms)
const pens = input3.sessions[0]!.softPenalties
assert.strictEqual(pens.filter((p) => p.constraintId === 'INSTRUCTOR_OUTLOOK_TENTATIVE').length, 1)
assert.strictEqual(pens.find((p) => p.constraintId === 'INSTRUCTOR_OUTLOOK_TENTATIVE')?.weight, 15)
assert.strictEqual(pens.find((p) => p.constraintId === 'INSTRUCTOR_OUTLOOK_UNKNOWN')?.weight, 5)
console.log('✓ buildSolverInput OUTLOOK restriction integration passed')

// 10. mapScheduleToRestrictions End-to-End (9.3->9.4 Zwischenschritt)
const restrictions = mapScheduleToRestrictions({
  instructorId: 'instr-1',
  availabilityView: view('2'),
  dayStart,
  intervalMinutes: 15,
  days: [day],
  slots: ['vormittag', 'nachmittag', 'abend'],
})
assert.ok(restrictions.some((r) => r.id === 'INSTRUCTOR_OUTLOOK_BUSY' && r.params?.['slot'] === 'vormittag'))
assert.strictEqual(restrictions.filter((r) => r.id === 'INSTRUCTOR_OUTLOOK_BUSY').length, 1)
assert.strictEqual(restrictions.filter((r) => r.category === 'soft').length, 0)
console.log('✓ mapScheduleToRestrictions passed')

console.log('--- All Outlook Tests Passed Successfully ---')
