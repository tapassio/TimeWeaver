/**
 * Public Barrel für Solver – hält Interface stabil.
 * Anwendung importiert nur hierüber, nicht direkt or-tools-wasm.
 */

export * from './domain.js'
export * from './solverInput.js'
export * from './types.js'
export * from './constraintCatalog.js'
export * from './TimetableSolver.js'
export * from './CpSatTsTimetableSolver.js'
export * from './OrToolsWasmTimetableSolver.js'
export * from './engine.js'
export * from './TimefoldClientTimetableSolver.js'
export * from './explainSolution.js'
export * from './solverService.js'
export { buildSolverInput } from './solverInput.js'
