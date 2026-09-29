/**
 * Engine-Auswahl für den TimetableSolver (TimeWeaver).
 *
 * Default: **Timefold, direkt** — der Java-Solver (https://github.com/TimefoldAI/timefold-solver)
 * läuft als eigenständiges Spring-Boot-Microservice (solver-java/) und wird
 * via HTTP REST aufgerufen (TIMEFOLD_URL). Kein automatischer Fallback:
 * Ist Timefold nicht erreichbar, schlägt der Solve mit einer klaren
 * Fehlermeldung fehl (Operator sieht sofort, dass der Solver-Service down ist).
 *
 * Explizite Engines (opt-in für Benchmarks / solverlose Entwicklung):
 *   timefold        → Timefold, ohne Fallback (Default)
 *   timefold-fallback → Timefold bevorzugt, bei Nichterreichbarkeit auf Hybrid
 *   cp-sat-ts       → lokale Hybrid-Engine (cp-sat-ts → or-tools-wasm)
 *   or-tools-wasm   → Alt-Engine ohne Fallback
 */

import { CpSatTsTimetableSolver } from './CpSatTsTimetableSolver.js'
import { OrToolsWasmTimetableSolver } from './OrToolsWasmTimetableSolver.js'
import { TimefoldClientTimetableSolver, timefoldHealth } from './TimefoldClientTimetableSolver.js'
import type { TimetableSolver } from './TimetableSolver.js'
import type { SolverInput } from './solverInput.js'
import type { RawSolverResult, SolveOptions, TimetableSolution } from './types.js'
import { explainSolution } from './explainSolution.js'

export type SolverEngineId = 'timefold' | 'timefold-fallback' | 'cp-sat-ts' | 'or-tools-wasm'

export function resolveSolverEngine(): SolverEngineId {
  const env = (process.env.SOLVER_ENGINE ?? 'timefold').toLowerCase()
  if (env === 'or-tools-wasm') return 'or-tools-wasm'
  if (env === 'cp-sat-ts') return 'cp-sat-ts'
  if (env === 'timefold-fallback') return 'timefold-fallback'
  return 'timefold'
}

/** cp-sat-ts-Ergebnis ist verwertbar, wenn eine Lösung (oder fast-UNSAT) vorliegt. */
function usable(raw: RawSolverResult): boolean {
  return raw.status === 'OPTIMAL' || raw.status === 'FEASIBLE'
}

/**
 * Kap. 5 Bench-Messung 2026-09: die pure-TS-Engine produziert bei grossen
 * Instanzen (viele pairwise-AllDifferent + Objective) keine Erstlösung im
 * Zeitlimit — dann wäre der cp-sat-ts-Vorlauf verschwendete Zeit. Ab dieser
 * Session-Anzahl direkt or-tools verwenden (env-überschreibbar).
 */
const BIG_INSTANCE_SESSIONS = Number(process.env.SOLVER_BIG_INSTANCE_SESSIONS ?? 60)

export class HybridTimetableSolver implements TimetableSolver {
  constructor(private moduleNameById: Map<string, string> = new Map()) {}

  async solveRaw(input: SolverInput, options: SolveOptions = {}): Promise<RawSolverResult> {
    const solverEnv = process.env.SOLVER_ENGINE?.toLowerCase()
    const allowFallback = solverEnv !== 'cp-sat-ts-only' && solverEnv !== 'or-tools-wasm'

    if (solverEnv === 'or-tools-wasm') {
      return new OrToolsWasmTimetableSolver(this.moduleNameById).solveRaw(input, options)
    }

    if (!allowFallback || input.sessions.length > BIG_INSTANCE_SESSIONS) {
      // gross: cp-sat-ts-Versuch wäre Budget-Verschwendung → direkt or-tools
      return new OrToolsWasmTimetableSolver(this.moduleNameById).solveRaw(input, options)
    }

    const primary = new CpSatTsTimetableSolver(this.moduleNameById)
    const raw = await primary.solveRaw(input, options)
    if (usable(raw)) return raw

    console.warn(
      `[engine] cp-sat-ts lieferte '${raw.status}'` +
        ` (keine bewertbare Lösung) — Fallback auf or-tools-wasm.`,
    )
    const fallback = new OrToolsWasmTimetableSolver(this.moduleNameById)
    const fallbackRaw = await fallback.solveRaw(input, options)
    // beide Engines verbrauchten Zeit: addieren
    return { ...fallbackRaw, solveTimeMs: (raw.solveTimeMs ?? 0) + (fallbackRaw.solveTimeMs ?? 0) }
  }

  async solve(input: SolverInput, options?: SolveOptions): Promise<TimetableSolution> {
    const raw = await this.solveRaw(input, options)
    return explainSolution(input, raw, this.moduleNameById)
  }
}

/**
 * Timefold-Direktaufruf — Default in TimeWeaver (kein CP-SAT-TS-Fallback).
 * `SOLVER_ENGINE=timefold-fallback` aktiviert den transparenten Fallback
 * auf die lokale Hybrid-Engine (für solverlose Maschinen / CI).
 */
export class TimefoldHybridSolver implements TimetableSolver {
  constructor(private moduleNameById: Map<string, string> = new Map()) {}

  async solveRaw(input: SolverInput, options: SolveOptions = {}): Promise<RawSolverResult> {
    const solverEnv = process.env.SOLVER_ENGINE?.toLowerCase()
    const allowFallback = solverEnv === 'timefold-fallback'

    if (await timefoldHealth()) {
      return new TimefoldClientTimetableSolver(this.moduleNameById).solveRaw(input, options)
    }

    if (!allowFallback) {
      console.error(
        '[engine] Timefold-Service nicht erreichbar (' + (process.env.TIMEFOLD_URL ?? 'TIMEFOLD_URL ungesetzt') + ')',
      )
      throw new Error(
        `Timefold-Solver nicht erreichbar (${process.env.TIMEFOLD_URL ?? 'TIMEFOLD_URL ungesetzt'}). ` +
          'Lösen: "docker compose up -d solver" oder SOLVER_ENGINE=timefold-fallback (um lokale Engine zu nutzen).',
      )
    }

    console.warn('[engine] Timefold nicht erreichbar — Fallback auf lokale Hybrid-Engine (cp-sat-ts → or-tools-wasm)')
    return new HybridTimetableSolver(this.moduleNameById).solveRaw(input, options)
  }

  async solve(input: SolverInput, options?: SolveOptions): Promise<TimetableSolution> {
    const raw = await this.solveRaw(input, options)
    return explainSolution(input, raw, this.moduleNameById)
  }
}

export function createTimetableSolver(moduleNameById: Map<string, string> = new Map()): TimetableSolver {
  switch (resolveSolverEngine()) {
    case 'or-tools-wasm':
      return new OrToolsWasmTimetableSolver(moduleNameById)
    case 'cp-sat-ts':
      return new HybridTimetableSolver(moduleNameById)
    case 'timefold-fallback':
      return new TimefoldHybridSolver(moduleNameById)
    default:
      // timefold — direkt, ohne CP-SAT-TS-Fallback
      return new TimefoldClientTimetableSolver(moduleNameById)
  }
}
