/**
 * Timefold-Solver-Client (https://github.com/TimefoldAI/timefold-solver)
 *
 * Der Timefold-Solver läuft als eigenständiges Java-Microservice
 * (solver-java/, Spring Boot) und wird via HTTP angesprochen:
 *   POST {TIMEFOLD_URL}/api/solve  → RawSolverResult-kompatible Antwort.
 *
 * Stabile Regel-IDs (constraintCatalog.ts) bleiben garantiert gleich, da der
 * Java-ConstraintProvider denselben Katalog portiert und nur Roh-Ergebnisse
 * (assignments day/room) zurückliefert — die fachliche Auswertung
 * (explainSolution.ts) bleibt invariant.
 */

import { SolverInput } from './solverInput.js'
import { explainSolution } from './explainSolution.js'
import type { RawSolverResult, SolveOptions, TimetableSolution } from './types.js'

export interface TimefoldRequest {
  sessions: Array<{
    id: string
    moduleId: string
    moduleName?: string
    program: string
    semester?: number | null
    slotTypes: string[]
    expectedStudents: number
    instructorIds: string[]
    allowedDayIds: string[]
    allowedRoomIds: string[]
    softPenalties: Array<{ dayId: string; constraintId: string; weight: number }>
  }>
  days: Array<{ id: string; date: string; week: number; weekday: string; phase: string }>
  rooms: Array<{ id: string; name: string; capacity: number }>
  prerequisites: Array<{ dependentModuleId: string; prerequisiteModuleId: string }>
  weeklyBalance: { weeks: number[]; lowerPerWeek: number; upperPerWeek: number }
  options: { timeLimitSeconds: number; randomSeed?: number }
}

export interface TimefoldResponse {
  status: string
  objectiveValue: number
  solveTimeMs?: number
  assignments: Array<{ sessionId: string; dayId: string | null; roomId: string | null }>
  score?: { hard: number; soft: number }
}

export function timefoldUrl(): string | null {
  const url = process.env.TIMEFOLD_URL?.trim()
  return url ? url.replace(/\/+$/, '') : null
}

/** Prüft, ob der Timefold-Service erreichbar ist (Health-Check). */
export async function timefoldHealth(timeoutMs = 2500): Promise<boolean> {
  const url = timefoldUrl()
  if (!url) return false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`${url}/api/health`, { signal: controller.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

/** SolverInput → Timefold-Problem-JSON (Spiegelbild von SolveApi.toProblem). */
export function buildTimefoldRequest(input: SolverInput, options: SolveOptions = {}): TimefoldRequest {
  const randomSeed = options.randomSeed
  return {
    sessions: input.sessions.map(s => ({
      id: s.id,
      moduleId: s.moduleId,
      program: s.program,
      semester: s.semester ?? null,
      slotTypes: s.slotTypes,
      expectedStudents: s.expectedStudents,
      instructorIds: s.instructorIds,
      allowedDayIds: s.allowedDayIds,
      allowedRoomIds: s.allowedRoomIds,
      softPenalties: s.softPenalties,
    })),
    days: input.days,
    rooms: input.rooms,
    prerequisites: input.prerequisites,
    weeklyBalance: input.weeklyBalance,
    options: {
      timeLimitSeconds: Math.max(1, Math.min(options.timeLimitSeconds ?? 30, 600)),
      ...(randomSeed !== undefined ? { randomSeed } : {}),
    },
  }
}

export class TimefoldClientTimetableSolver {
  constructor(private moduleNameById: Map<string, string> = new Map()) {}

  async solveRaw(input: SolverInput, options: SolveOptions = {}): Promise<RawSolverResult> {
    const url = timefoldUrl()
    if (!url) throw new Error('TIMEFOLD_URL ist nicht konfiguriert — Timefold-Service nicht erreichbar')

    const body = JSON.stringify(buildTimefoldRequest(input, options))
    const controller = new AbortController()
    const limitMs = Math.min((options.timeLimitSeconds ?? 30) * 1000 + 15000, 660000)
    const timer = setTimeout(() => controller.abort(), limitMs)

    try {
      const res = await fetch(`${url}/api/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Timefold-Solver HTTP ${res.status}: ${text.slice(0, 400)}`)
      }
      const data = (await res.json()) as TimefoldResponse
      const status = data.status === 'OPTIMAL'
        ? 'OPTIMAL'
        : data.assignments.length > 0 ? 'FEASIBLE' : 'UNKNOWN'
      return {
        status,
        objectiveValue: data.objectiveValue ?? (data.score?.soft ?? 0),
        assignments: data.assignments
          .filter(a => a.sessionId && a.dayId && a.roomId)
          .map(a => ({ sessionId: a.sessionId, dayId: a.dayId as string, roomId: a.roomId as string })),
        solveTimeMs: data.solveTimeMs,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async solve(input: SolverInput, options?: SolveOptions): Promise<TimetableSolution> {
    const raw = await this.solveRaw(input, options)
    return explainSolution(input, raw, this.moduleNameById)
  }
}
