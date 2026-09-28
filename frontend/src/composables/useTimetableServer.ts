/**
 * Client für serverseitiges CP-SAT (Kap. 2: Node, nicht Browser)
 * Dünner Wrapper um /api/timetable/solve – kein direkter or-tools-wasm Import.
 * Browser-Solving bleibt als optionales Feature (useTimetableCpSat) für Offline.
 */

export interface SolveOptions {
  timeLimitSeconds?: number
  numSearchWorkers?: number
  randomSeed?: number
}

// Duplikat der Domänen-Typen für Frontend – serverseitig in server/solver/domain.ts kanonisch
export type SlotType = 'vormittag' | 'nachmittag' | 'abend'
export interface Restriction {
  id: string
  category: 'hard' | 'soft'
  weight?: number
  params?: Record<string, unknown>
}
export interface Module {
  id: string
  name: string
  program: string
  ects: 3 | 6
  expectedStudents: number
  instructors: string[]
  restrictions: Restriction[]
}
export interface OnCampusDay {
  id: string
  date: string
  week: number
  weekday: 'Donnerstag' | 'Freitag' | 'Samstag'
  phase: 'main' | 'final'
}
export interface Room {
  id: string
  name: string
  capacity: number
}

export async function solveTimetableOnServer(
  modules: Module[],
  days: OnCampusDay[],
  rooms: Room[],
  options: SolveOptions = {},
  useWorker = true,
) {
  const res = await fetch('/api/timetable/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modules, days, rooms, options, useWorker }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `Solve fehlgeschlagen: ${res.status}`)
  }
  return res.json()
}

export async function fetchConstraintCatalog() {
  const res = await fetch('/api/timetable/constraints')
  if (!res.ok) throw new Error('Katalog nicht verfügbar')
  return res.json()
}
