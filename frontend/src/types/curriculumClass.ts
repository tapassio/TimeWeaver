/**
 * Kohorte (Klasse) für die Terminplanung: eine Gruppe von Teilnehmenden,
 * die gemeinsamSlots belegt — Referenziert aus ScheduleEntry.classIds.
 */
export type AclInfo = import('@/types/curriculum').AclInfo

export interface ClassEntity extends AclInfo {
  _id?: string
  id?: string
  name: string
  /** z.B. "DBA_FS2027" — Programm + Semester-Kohorte */
  code?: string
  program?: string
  semester?: number
  studentCount?: number
  moduleIds?: string[]
}

export type ClassExport = ClassEntity[]
