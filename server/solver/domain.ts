/**
 * Stufe 1 — Fachliches Domänenmodell (Timetable-Solver)
 * Das, was Menschen im Kopf haben. Entspricht sample-data.js als Typen.
 * Keine Solver-Artefakte, keine CpModel-Variablen.
 *
 * Program/Instructor/Modul-Kernfelder kommen aus dem SHARED Kern-Domänenmodell
 * (server/core/domain.ts), damit CP-SAT-Terminplanung und Curriculum-Mapping
 * dieselbe Modul-Definition nutzen (Checkliste Kap. 11).
 */

export type { Program, Instructor } from '../core/domain.js'

export interface Room {
  id: string
  name: string
  capacity: number
}

export interface RoomAvailability {
  id: string
  roomId: string
  weekId?: string
  weekday: string
  startTime: string
  endTime: string
}

export interface Week {
  id: string
  semesterId: string
  semesterWeek: number
  startDate: string
  endDate: string
  daysOff?: string[]
}

export interface ScheduleEntry {
  id: string
  weekId: string
  moduleIds: string[]
  roomIds: string[]
  classIds: string[]
  lecturerIds: string[]
  weekday: string
  startTime: string
  endTime: string
}

export interface OnCampusDay {
  id: string
  date: string // ISO-Datum YYYY-MM-DD
  week: number // Kalenderwoche
  weekday: 'Donnerstag' | 'Freitag' | 'Samstag'
  phase: 'main' | 'final'
}

export type SlotType = 'vormittag' | 'nachmittag' | 'abend'

export interface Restriction {
  id: string // stabile ID, siehe constraintCatalog (3.3)
  category: 'hard' | 'soft'
  weight?: number // nur bei 'soft' – falls undefined, gilt Katalog-Gewicht
  params?: Record<string, unknown> // z. B. { dates: ['2026-11-14'] }
}

export interface Module {
  id: string
  name: string
  program: string // Program.id
  ects: 3 | 6
  /**
   * Kap. 11.1 — Kohorten-Verbindlichkeit: Module in derselben Kohorte
   * (Programm + Semester) dürfen nicht am selben Tag grenz-parallel laufen.
   */
  semester?: number
  /**
   * Anzahl On-Campus-Tage, die das Modul belegen soll (Kern des Solverproblems).
   * Konvention laut Doku: 6 ECTS = 3 On-Campus-Days, 3 ECTS = 1.5 Tage
   * (→ 2 Teiltage: 1 ganzer Tag + 1 Vormittag). buildSolverInput() erzeugt
   * daraus mehrere SolverSessions pro Modul.
   */
  onCampusDays?: number
  expectedStudents: number
  instructors: string[] // Instructor.id[]
  restrictions: Restriction[]
  /**
   * Kap. 10.1/11.3 — Prerequisite: stabile Referenzen auf Module, dessen
   * On-Campus-Tage vollständig VOR denen dieses Moduls liegen müssen.
   * Entspricht dem "Talk prerequisite talks"-Constraint aus ITC/Conference-Scheduling.
   */
  prerequisiteModuleIds?: string[]
  /**
   * Kap. 11.2 — generisches Tag-System (Conference-Scheduling-Muster):
   * Tage tragen Tags (weekday:friday, week:odd, phase:final), Module deklarieren
   * Beziehungen dazu — required/prohibited = hart, preferred/undesired = soft.
   */
  requiredDayTags?: string[]
  prohibitedDayTags?: string[]
  preferredDayTags?: string[]
  undesiredDayTags?: string[]
  competencyIds?: string[]
  proofOfCompetencyIds?: string[]
}

export interface Semester {
  id: string
  name: string
  code?: string
  startDate: string
  endDate: string
}

export interface CurriculumVersion {
  id: string
  name: string
  versionNumber: number
  programId?: string
}
