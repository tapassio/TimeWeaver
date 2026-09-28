/**
 * Benchmark-Set mit repräsentativen Instanzen (Kap. 5 Checkliste)
 * Wiederverwendbar für jeden Vergleichslauf + Version-Pinning-Regression
 */
import { buildSolverInput } from '../solverInput.js'
import { solveInProcess } from '../solverService.js'
import type { Module, OnCampusDay, Room } from '../domain.js'

function generateDays(weeks: number): OnCampusDay[] {
  const days: OnCampusDay[] = []
  let date = new Date('2028-02-03')
  let week = 5
  for (let w = 0; w < weeks; w++) {
    for (const wd of ['Donnerstag', 'Freitag', 'Samstag'] as const) {
      const iso = date.toISOString().slice(0, 10)
      days.push({ id: iso, date: iso, week, weekday: wd, phase: 'main' })
      date.setDate(date.getDate() + 1)
    }
    date.setDate(date.getDate() + 4)
    week++
  }
  return days
}

function generateRooms(n: number): Room[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Raum ${i}`, capacity: 20 + (i % 5) * 10 }))
}

function generateModules(n: number, days: OnCampusDay[], programs = ['prog-dba']): Module[] {
  // Kohortenrotierung (Programm×Semester): eine Kohorte kann nicht parallel an
  // zwei Modulen lernen (Kap. 11.1) — Kohortenzahl leitet sich aus der Tages-
  // kapazität ab (≥1 Modulplatz pro ≈3 Tagen), sonst künstlich INFEASIBLE.
  const cohorts = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(days.length / 3))))
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    name: `Modul ${i}`,
    program: programs[i % programs.length]!,
    semester: Math.floor(i / Math.ceil(n / cohorts)) % cohorts,
    ects: (i % 4 === 0 ? 3 : 6) as 3 | 6,
    expectedStudents: 15 + (i % 6) * 5,
    instructors: [`instr-${i % 12}`, `instr-${(i + 5) % 12}`].slice(0, 1 + (i % 2)),
    restrictions: i % 10 === 0 ? [{ id: 'AVOID_SATURDAY', category: 'soft', weight: 10 }] : [],
  }))
}

async function bench(label: string, modules: number, weeks: number, rooms: number, timeLimit: number) {
  const days = generateDays(weeks)
  const rms = generateRooms(rooms)
  const mods = generateModules(modules, days)
  const input = buildSolverInput(mods, days, rms)
  const start = Date.now()
  const sol = await solveInProcess(input, { timeLimitSeconds: timeLimit, numSearchWorkers: 4 }, new Map(mods.map((m) => [m.id, m.name])))
  const wall = Date.now() - start
  const obj = sol.objectiveValue
  const hardViol = sol.explanations.filter((e) => e.category === 'hard' && !e.satisfied).length
  console.log(`${label.padEnd(18)} | mods=${String(modules).padStart(4)} days=${String(days.length).padStart(3)} rooms=${String(rooms).padStart(3)} | status=${sol.status.padEnd(10)} obj=${String(obj).padStart(6)} hardViol=${hardViol} | wall ${wall}ms solver ${sol.solveTimeMs}ms`)
}

async function main() {
  const { resolveSolverEngine } = await import('../engine.js')
  console.log(`Benchmark – CourseWeaver CP-SAT (${resolveSolverEngine()}, Node)\n`)
  await bench('S-PoC-min', 30, 6, 20, 15)
  await bench('M-PoC-mid', 120, 8, 30, 30)
  await bench('L-PoC-max', 300, 10, 50, 60)
  // 1000 nur auf kontrollierter Hardware
  if (process.argv.includes('--large')) {
    await bench('XL-1000', 1000, 12, 100, 120)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
