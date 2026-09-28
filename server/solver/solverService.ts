/**
 * Solver Service – Managed Worker Threads (Kap. 2)
 * Solver-Läufe laufen NICHT im Request-Handler: Der Worker isolate startet
 * mit derselben tsx-Loader-Konfiguration wie der Hauptprozess (execArgv wird
 * explizit vererbt — Node erbt loader-Flags NICHT automatisch).
 *
 * Review-Fixes #2/#3:
 *  - Der Entry-Point wird je nach Laufzeitform gewählt (.ts unter tsx,
 *    kompiliertes .js in Produktion) — kein hartkodierter Pfad mehr.
 *  - Worker-*Fehler* werden an den Aufrufer übermittelt (reject), NICHT
 *    still auf synchrones In-Prozess-Solving zurückgegriffen.
 *    solveInProcess bleibt bewusst für Tests/kleine Instanzen exportiert.
 */

import { Worker } from 'node:worker_threads'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SolverInput } from './solverInput.js'
import type { RawSolverResult, SolveOptions, TimetableSolution } from './types.js'
import { createTimetableSolver } from './engine.js'
import { explainSolution } from './explainSolution.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Serverseitige Obergrenze für solver-Läufe (PoC-Acceptance-Kriterium ≤ 120s) */
export const SOLVER_TIME_LIMIT_CAP = 120

export function capTimeLimitSeconds(v: number | undefined, fallback = 60): number {
  const raw = v ?? fallback
  return Math.max(1, Math.min(raw, SOLVER_TIME_LIMIT_CAP))
}

export interface JobHandle {
  promise: Promise<TimetableSolution>
  abort: () => void
}

/**
 * Resolves the Worker entry:
 *   - tsx/Dev: plain-JS Loader-Wrapper (`solverWorkerLoader.mjs`), der die
 *     tsx-ESM-Loader-API *im Worker* registriert wird — Node erbt
 *     loader-Flags nicht zuverlässig in Worker Threads (Review #2).
 *   - Produktion: kompiliertes `solverWorker.js` direkt.
 */
function resolveWorkerFile(): string {
  const tsPath = path.join(__dirname, 'worker', 'solverWorker.ts')
  const jsPath = path.join(__dirname, 'worker', 'solverWorker.js')
  const loaderPath = path.join(__dirname, 'worker', 'solverWorkerLoader.mjs')

  if (import.meta.url.endsWith('.ts')) {
    if (fs.existsSync(loaderPath)) return loaderPath
    if (fs.existsSync(tsPath)) return tsPath
  } else if (fs.existsSync(jsPath)) {
    return jsPath
  }
  throw new Error(
    `Solver Worker entry-point nicht gefunden (${loaderPath} / ${jsPath}). ` +
      'In Produktion muss das Paket gebaut werden ("npm run build"), im Dev-Pfad muss tsx installiert sein.',
  )
}


export function solveInWorker(
  input: SolverInput,
  options: SolveOptions = {},
  moduleNameById: Map<string, string> = new Map(),
  timeoutSeconds?: number,
): JobHandle {
  const effectiveOptions: SolveOptions = {
    timeLimitSeconds: capTimeLimitSeconds(
      timeoutSeconds ?? options.timeLimitSeconds ?? 60,
      60,
    ),
    numSearchWorkers: options.numSearchWorkers ?? 4,
    randomSeed: options.randomSeed,
  }

  let worker: Worker | null = null
  let rejectOuter: ((e: Error) => void) | null = null
  let timeout: NodeJS.Timeout | null = null

  const promise = new Promise<TimetableSolution>((resolve, reject) => {
    rejectOuter = reject

    let workerFile: string
    try {
      workerFile = resolveWorkerFile()
    } catch (e: any) {
      // strukturell kaputtes Deployment -> FEHLSCHLAG, kein stiller In-Prozess-Fallback
      reject(new Error(e.message))
      return
    }

    worker = new Worker(workerFile, {
      workerData: {
        input,
        options: effectiveOptions,
        moduleNameByIdEntries: [...moduleNameById.entries()],
      },
      // WICHTIG (Review #2): Node vererbt den tsx-Loader an Worker Threads
      // NICHT automatisch — process.execArgv explizit mitgeben.
      execArgv: process.execArgv,
    } as any)

    const killWindowMs = (effectiveOptions.timeLimitSeconds! + 5) * 1000
    timeout = setTimeout(() => {
      worker?.terminate()
      reject(new Error(`Solver Worker Timeout nach ${killWindowMs}ms`))
    }, killWindowMs)

    let settled = false
    worker.on('message', (msg: any) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      if (msg.ok) {
        const raw = msg.raw as RawSolverResult
        const solution = explainSolution(input, raw, moduleNameById)
        resolve(solution)
      } else {
        // Solver-Fehler im Worker: transparent an den Aufrufer
        reject(new Error(msg.error ?? 'Solver Worker fehlgeschlagen'))
      }
      worker?.terminate()
    })

    worker.on('error', (err: any) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      console.error('[solverService] Worker-Fehler — wird NICHT still in-process gelöst:', err?.message ?? err)
      reject(err instanceof Error ? err : new Error(String(err)))
    })

    worker.on('exit', (code) => {
      if (settled) return
      if (code !== 0) {
        settled = true
        if (timeout) clearTimeout(timeout)
        console.error(`[solverService] Worker exit ${code} — wird nicht still in-process gefangen`)
        reject(new Error(`Solver Worker beendet sich mit Code ${code}`))
      }
    })
  })

  return {
    promise,
    abort: () => {
      if (timeout) clearTimeout(timeout)
      worker?.terminate()
      rejectOuter?.(new Error('Solver abgebrochen'))
    },
  }
}

/** Convenience ohne Worker – direkt im Prozess (Tests, kleine Instanzen; KEIN Produktions-Fallback #3) */
export async function solveInProcess(
  input: SolverInput,
  options: SolveOptions = {},
  moduleNameById: Map<string, string> = new Map(),
): Promise<TimetableSolution> {
  const solver = createTimetableSolver(moduleNameById)
  return solver.solve(input, { ...options, timeLimitSeconds: capTimeLimitSeconds(options.timeLimitSeconds ?? 60) })
}
