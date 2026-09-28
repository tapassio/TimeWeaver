/**
 * Kap. 3.1 — Solver hinter Interface kapseln
 * `or-tools-wasm` wird nicht direkt im Anwendungscode importiert.
 * Zweite Implementierung (z. B. native Python-Service) bleibt offen.
 */

import type { SolverInput } from './solverInput.js'
import type { RawSolverResult, SolveOptions, TimetableSolution } from './types.js'

export interface TimetableSolver {
  /**
   * Löst das Problem. Nimmt nur validierten SolverInput (Stufe 2),
   * kennt keine Restriction-Objekte mehr.
   */
  solveRaw(input: SolverInput, options?: SolveOptions): Promise<RawSolverResult>

  /**
   * Convenience: solveRaw + explainSolution → fachliches Ergebnis (Stufe 4)
   */
  solve(input: SolverInput, options?: SolveOptions): Promise<TimetableSolution>
}
