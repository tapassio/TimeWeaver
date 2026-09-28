/**
 * Gemeinsames Kern-Domänenmodell (Checkliste Kap. 11)
 * Program/Instructor/Module-Kernfelder teilen sich der CP-SAT-Solver und die
 * Curriculum-Mapping-Pipeline — beide beschreiben dasselbe fachliche Objekt
 * "Modul" aus zwei Blickwinkeln (Terminplanung vs. Inhaltsanalyse).
 * Stabile IDs orientieren sich am 1EdTech-CASE-Standard für verknüpfte
 * Kompetenzobjekte.
 */

export interface Program {
  id: string
  name: string
}

export interface Instructor {
  id: string
  name: string
}

/** Modul-Kernfelder, die beide Blickwinkel teilen */
export interface ModuleCore {
  id: string
  name: string
  program: string // Program.id
  /**
   * Kap. 10.1 — Prerequisites: stabile Referenzen auf Module, die vollständig
   * VOR diesem Modul verplant werden müssen ("requires"-Beziehung im Store).
   */
  prerequisiteModuleIds?: string[]
}
