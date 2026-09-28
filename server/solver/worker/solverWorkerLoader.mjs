/**
 * Worker-Entry für Dev/tsx: registriert die tsx-ESM-Loader-API INNERHALB des
 * Worker-Threads (Node erbt den Loader NICHT automatisch in Workerd, vgl. Review #2)
 * und importiert dann den eigentlichen typisierten SolverWorker.
 * In Produktion wird direkt das kompilierte solverWorker.js benutzt.
 */
/* eslint-disable no-undef */
import { register } from 'tsx/esm/api'

register()

import('./solverWorker.ts').catch((err) => {
  console.error('[solverWorkerLoader] import des solverWorkers.ts fehlgeschlagen:', err)
  process.exit(1)
})
