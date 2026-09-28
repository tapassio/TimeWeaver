/**
 * PoC Runner – prüft Kap. 6 Akzeptanzkriterien lokal
 * Grössenordnungen: 300-1000 Einheiten, 30-100 Slots, 20-100 Räume (skaliert runter für lokale Demo)
 */

import { buildSolverInput } from '../solverInput.js'
import { solveInProcess } from '../solverService.js'
import type { Module, OnCampusDay, Room } from '../domain.js'

function generateDays(count: number, startWeek = 5): OnCampusDay[] {
  const days: OnCampusDay[] = []
  let week = startWeek
  let date = new Date('2028-02-03') // Donnerstag
  for (let i = 0; i < count; i++) {
    const wd = ['Donnerstag', 'Freitag', 'Samstag'][i % 3] as OnCampusDay['weekday']
    const iso = date.toISOString().slice(0, 10)
    days.push({ id: iso, date: iso, week, weekday: wd, phase: 'main' })
    date.setDate(date.getDate() + 1)
    if (wd === 'Samstag') {
      date.setDate(date.getDate() + 4) // nächste Woche Donnerstag
      week++
    }
  }
  return days
}

function generateRooms(n: number): Room[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `room-${String(i + 1).padStart(3, '0')}`,
    name: `Raum ${i + 1}`,
    capacity: 20 + (i % 4) * 15, // 20,35,50,65
  }))
}

function generateModules(n: number, days: OnCampusDay[]): Module[] {
  // Realistisches Muster: Kohorten (Programm×Semester) aus der Tageskapazität
  // abgeleitet — eine EINE Kohorte kann laut Kap.-11.1-Regel nicht parallel an
  // zwei Modulen lernen; ohne Rotation würde der Generator unrealistisch
  // INFEASIBLE Instanzen erzeugen.
  const cohorts = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(days.length / 3))))
  return Array.from({ length: n }, (_, i) => ({
    id: `mod-${String(i + 1).padStart(3, '0')}`,
    name: `Modul ${i + 1}`,
    program: 'prog-dba',
    semester: Math.floor(i / Math.ceil(n / cohorts)) % cohorts,
    ects: (i % 3 === 0 ? 3 : 6) as 3 | 6,
    expectedStudents: 18 + (i % 5) * 5,
    instructors: [`instr-${String((i % 10) + 1).padStart(3, '0')}`, `instr-${String(((i + 3) % 10) + 1).padStart(3, '0')}`].slice(0, i % 2 === 0 ? 1 : 2),
    restrictions: i % 7 === 0 ? [{ id: 'AVOID_SATURDAY', category: 'soft', weight: 10 }] : i % 5 === 0 ? [{ id: 'AVOID_FRIDAY_AFTERNOON', category: 'soft', weight: 20 }] : [],
  }))
}

async function runCase(label: string, nModules: number, nDays: number, nRooms: number, timeLimit = 30) {
  console.log(`\n=== ${label}: ${nModules} Module, ${nDays} Tage, ${nRooms} Räume, limit ${timeLimit}s ===`)
  const days = generateDays(nDays)
  const rooms = generateRooms(nRooms)
  const modules = generateModules(nModules, days)

  const input = buildSolverInput(modules, days, rooms)
  const moduleNameById = new Map(modules.map((m) => [m.id, m.name]))

  const start = Date.now()
  const solution = await solveInProcess(input, { timeLimitSeconds: timeLimit, numSearchWorkers: 4 }, moduleNameById)
  const elapsed = Date.now() - start

  console.log(`Status: ${solution.status}  Objective: ${solution.objectiveValue}  Time: ${elapsed}ms (reported ${solution.solveTimeMs}ms)`)
  console.log(`Erklärungen:`)
  for (const e of solution.explanations) {
    if (!e.satisfied || e.category === 'soft') {
      console.log(`  - ${e.constraintId} [${e.category}] satisfied=${e.satisfied} cost=${e.cost} affected=${e.affectedSessionIds.length}`)
    }
  }
  const violations = solution.explanations.filter((e) => e.category === 'hard' && !e.satisfied)
  if (violations.length > 0) {
    console.log(`❌ Harte Verletzungen: ${violations.map((v) => v.constraintId).join(', ')}`)
  } else {
    console.log(`✅ Keine harten Verletzungen`)
  }
  return { status: solution.status, elapsed }
}

async function main() {
  // Klein für lokale Demo, PoC-Kriterium 300+ Module würde 60-120s brauchen
  await runCase('Small', 6, 6, 4, 10)
  await runCase('Medium-30', 30, 18, 10, 30)
  // Großer Fall nur wenn schnell – sonst skip
  // await runCase('Large-300', 300, 36, 20, 60)
  console.log('\nPoC fertig – für volle 300-1000 Einheiten `npm run solver:bench` mit --large nutzen.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
