/**
 * Stufen 3 & 4 — CP-SAT Ergebnis + fachliches Ergebnis
 * Getrennt testbar: Stufe 3 ist roh, Stufe 4 anreichernd.
 */

import type { OnCampusDay, Room, SlotType } from './domain.js'

// ---------------------------------------------------------------------------
// Stufe 3 — CP-SAT-Ergebnis (roh)
// ---------------------------------------------------------------------------

export interface RawSolverResult {
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN'
  objectiveValue: number
  assignments: Array<{ sessionId: string; dayId: string; roomId: string }>
  solveTimeMs?: number
  // optionale Solver-Metadaten
  wallTimeMs?: number
}

// ---------------------------------------------------------------------------
// Stufe 4 — fachliches Ergebnis + Erklärungen
// ---------------------------------------------------------------------------

export interface ScheduledSession {
  moduleId: string
  moduleName: string
  sessionId: string
  day: OnCampusDay
  room: Room
  slotTypes: SlotType[]
  instructorIds: string[]
  /** Outlook-Anbindung (9.5): Graph-Event-ID + transactionId, falls bereits veröffentlicht */
  graphEventId?: string
  outlookTransactionId?: string
}

export interface RuleEvaluation {
  constraintId: string // dieselbe ID wie im Constraint-Katalog (3.3)
  category: 'hard' | 'soft'
  satisfied: boolean
  cost: number // summierte Strafkosten für diese Regel
  affectedSessionIds: string[]
  message?: string // menschenlesbar
}

export interface TimetableSolution {
  status: RawSolverResult['status']
  objectiveValue: number
  schedule: ScheduledSession[]
  explanations: RuleEvaluation[]
  solveTimeMs?: number
  rawAssignments?: RawSolverResult['assignments']
}

// Optionen für den Solve-Aufruf (Kap. 3.1 SolveOptions)
export interface SolveOptions {
  timeLimitSeconds?: number // 30-120 laut PoC
  numSearchWorkers?: number // default: 4 (Node kontrolliert Hardware)
  randomSeed?: number
}
