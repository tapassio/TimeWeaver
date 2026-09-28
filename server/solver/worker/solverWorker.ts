/**
 * Worker Thread für CP-SAT (Kap. 2: nicht im Request-Handler, isoliert)
 * Läuft in eigenem V8-Isolate – blockiert nicht den Event Loop,
 * Speicher-Problem reisst nicht die API mit.
 */

import { parentPort, workerData } from 'node:worker_threads'
import { createTimetableSolver } from '../engine.js'
import type { SolverInput } from '../solverInput.js'
import type { SolveOptions } from '../types.js'

interface WorkerPayload {
  input: SolverInput
  options: SolveOptions
  moduleNameByIdEntries: Array<[string, string]>
}

async function run() {
  const { input, options, moduleNameByIdEntries } = workerData as WorkerPayload
  const solver = createTimetableSolver(new Map(moduleNameByIdEntries))
  try {
    const raw = await solver.solveRaw(input, options)
    parentPort?.postMessage({ ok: true, raw })
  } catch (err: any) {
    parentPort?.postMessage({ ok: false, error: err?.message ?? String(err), stack: err?.stack })
  }
}

run()
