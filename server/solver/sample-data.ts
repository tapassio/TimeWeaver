/**
 * Solver-Beispieldaten — KEINE Hardcodes mehr im Code:
 * Die Daten liegen in mockGUI/data/solver-sample.json und werden hier
 * typisiert eingelesen (einmalig synchron bei Modulload).
 * Pfadauflösung robust: relative zum Modul (tsx/dev und dist) oder zum cwd.
 * Stufe-1-Daten (Domänenmodell) für Tests, Benchmarks und Demos.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Module, OnCampusDay, Program, Room } from './domain.js'

interface SolverSampleData {
  programs: Program[]
  rooms: Room[]
  days: OnCampusDay[]
  modules: Module[]
}

function resolveSamplePath(): string {
  const rel = 'mockGUI/data/solver-sample.json'
  const candidates = [
    // tsx/dev: .../server/solver/ -> 2x hoch = Projekt-Root
    fileURLToPath(new URL('../../' + rel, import.meta.url)),
    // kompiliert: .../dist/server/solver/ -> 3x hoch = Projekt-Root
    fileURLToPath(new URL('../../../' + rel, import.meta.url)),
    // npm scripts laufen aus dem Projekt-Root
    path.resolve(process.cwd(), rel),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error(
    `solver-sample.json nicht gefunden (Kandidaten: ${candidates.join('; ')}) — ` +
      'Beispieldaten liegen in mockGUI/data/ und müssen mit dem Projekt verteilt werden.',
  )
}

const parsed = JSON.parse(readFileSync(resolveSamplePath(), 'utf-8')) as SolverSampleData

export const samplePrograms: Program[] = parsed.programs
export const sampleRooms: Room[] = parsed.rooms
export const sampleDays: OnCampusDay[] = parsed.days
export const sampleModules: Module[] = parsed.modules
