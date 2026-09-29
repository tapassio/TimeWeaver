import { Router, Request, Response } from 'express'
import { buildSolverInput } from '../solver/solverInput.js'
import { solveInWorker, solveInProcess, capTimeLimitSeconds } from '../solver/solverService.js'
import { CONSTRAINT_CATALOG } from '../solver/constraintCatalog.js'
import { saveEntity } from '../db'
import type { SolverInput } from '../solver/solverInput.js'
import type { Module, OnCampusDay, Room } from '../solver/domain.js'

export const timetableRouter = Router()

// GET /api/timetable/constraints – Katalog exponieren
timetableRouter.get('/constraints', (_req: Request, res: Response) => {
  res.json(Object.values(CONSTRAINT_CATALOG))
})

// POST /api/timetable/solve
// Body: { modules: Module[], days: OnCampusDay[], rooms: Room[], options?: { timeLimitSeconds, numSearchWorkers }, useWorker?: boolean }
timetableRouter.post('/solve', async (req: Request, res: Response) => {
  try {
    const { modules, days, rooms, classes, options, solverInput, useWorker, persist, semesterId } = req.body as {
      persist?: boolean
      /** Snapshot-Historie (data-model-comparison.md §3.6): Semester-Kontext */
      semesterId?: string
      modules?: Module[]
      days?: OnCampusDay[]
      rooms?: Room[]
      /** data-model-comparison.md §3.1 — Kohorten (Classes) für Kohorten-Konflikt */
      classes?: Array<{ id: string; programId: string; semester?: number; moduleIds?: string[] }>
      options?: { timeLimitSeconds?: number; numSearchWorkers?: number; randomSeed?: number }
      solverInput?: SolverInput
      useWorker?: boolean
    }

    let input: SolverInput
    let moduleNameById: Map<string, string>

    if (solverInput) {
      input = solverInput
      moduleNameById = new Map((solverInput.sessions ?? []).map((s) => [s.moduleId, s.moduleId]))
    } else {
      if (!modules || !days || !rooms) {
        res.status(400).json({ error: 'modules, days, rooms erforderlich (oder solverInput)' })
        return
      }
      input = buildSolverInput(modules, days, rooms, { classes })
      moduleNameById = new Map(modules.map((m) => [m.id, m.name]))
    }

    const shouldUseWorker = useWorker !== false // default true (Node kontrolliert Hardware)
    const solverOptions = {
      timeLimitSeconds: capTimeLimitSeconds(options?.timeLimitSeconds, 30),
      numSearchWorkers: options?.numSearchWorkers ?? 4,
      randomSeed: options?.randomSeed,
    }

    let solution
    if (shouldUseWorker) {
      const handle = solveInWorker(input, solverOptions, moduleNameById)
      solution = await handle.promise
    } else {
      solution = await solveInProcess(input, solverOptions, moduleNameById)
    }

    if (persist) {
      // data-model-comparison.md §3.6 — Schedule-Snapshot (ein JSON-Blob pro
      // Semester/Lauf, KEIN Row-per-Session-Modell).
      await saveEntity(
        'schedule_snapshots',
        'ss-' + (semesterId ?? 'unassigned') + '-' + Date.now(),
        {
          semesterId: semesterId ?? null,
          created_at: new Date().toISOString(),
          engine: process.env.SOLVER_ENGINE ?? 'timefold',
          timeLimitSeconds: solverOptions.timeLimitSeconds,
          schedule: solution.schedule.map((s) => ({
            sessionId: s.sessionId, moduleId: s.moduleId, moduleName: s.moduleName,
            dayId: s.day.id, slotTypes: s.slotTypes, roomId: s.room.id, instructorIds: s.instructorIds,
          })),
        },
      ).catch((e: any) => console.warn('[timetable/solve] Snapshot fehlgeschlagen:', e.message))
    }

    res.json(solution)
  } catch (err: any) {
    console.error('[timetable/solve] error', err)
    res.status(500).json({ error: err.message ?? String(err) })
  }
})

// POST /api/timetable/solve-raw – nur Stufen 2→3, ohne Explain (für Benchmarks)
timetableRouter.post('/solve-raw', async (req: Request, res: Response) => {
  try {
    const { modules, days, rooms, classes, options, solverInput, useWorker } = req.body as any
    let input: SolverInput
    if (solverInput) input = solverInput
    else {
      if (!modules || !days || !rooms) {
        res.status(400).json({ error: 'modules, days, rooms erforderlich' })
        return
      }
      input = buildSolverInput(modules, days, rooms, { classes })
    }
    const solverOptions = {
      timeLimitSeconds: capTimeLimitSeconds(options?.timeLimitSeconds, 30),
      numSearchWorkers: options?.numSearchWorkers ?? 4,
    }
    const shouldUseWorker = useWorker !== false
    const moduleNameById = new Map<string, string>()
    let raw
    if (shouldUseWorker) {
      const { solveInWorker } = await import('../solver/solverService.js')
      const handle = solveInWorker(input, solverOptions, moduleNameById)
      const sol = await handle.promise
      raw = { status: sol.status, objectiveValue: sol.objectiveValue, assignments: sol.rawAssignments, explanations: sol.explanations }
      res.json(raw)
      return
    } else {
      const { createTimetableSolver } = await import('../solver/engine.js')
      const solver = createTimetableSolver()
      raw = await solver.solveRaw(input, solverOptions)
      res.json(raw)
      return
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? String(err) })
  }
})
