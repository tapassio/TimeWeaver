export interface AclInfo {
  _canEdit?: boolean
  _isAdmin?: boolean
}

export interface ModuleConstraint {
  type: 'requires' | 'corequisite' | 'forbids'
  targetModuleId: string
}

/**
 * Modul für die Terminplanung (On-Campus-Tage je Semester, Kap. 11):
 * Kernfelder kommen aus dem Solver-Domänenmodell (server/core/domain.ts).
 * Die Kohorte + Instructor-Zuordnung dominieren die Planung; Mapping-Felder
 * (Kompetenzen, Proofs) gehören zu CourseWeaver und sind hier nicht nötig.
 */
export interface Module extends AclInfo {
  id?: string
  _id?: string
  code?: string
  name: string
  program?: string
  /** Programm/Kohorte (1, 2, 3 …) */
  semester?: number
  /** 3 oder 6 ECTS — 6 ECTS = 3 Campus-Tage, 3 ECTS = 1,5 Tage */
  ects?: 3 | 6
  /** Anzahl On-Campus-Tage, die das Modul belegen soll (Kern des Solverproblems) */
  onCampusDays?: number
  expectedStudents?: number
  instructors?: string[]
  prerequisiteModuleIds?: string[]
  requiredDayTags?: string[]
  prohibitedDayTags?: string[]
  preferredDayTags?: string[]
  undesiredDayTags?: string[]
  restrictions?: Array<{ id: string; category: 'hard' | 'soft'; weight?: number; params?: Record<string, unknown> }>
  description?: string
  contact?: string
  url?: string
  creditPoints?: number
  contactHours?: number
  selfStudyHours?: number
  constraints?: ModuleConstraint[]
  curriculumVersionId?: string
}

export type ModuleExport = Module[]
