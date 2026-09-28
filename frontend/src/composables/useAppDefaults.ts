/**
 * Zentrale App-Voreinstellungen (localStorage 'courseweaver_defaults'):
 * Scopes: Standard-Departement/Programm/Semester + Planungs-Kalender
 * (Wochentage für On-Campus-Slots, Kalenderwochen-Range).
 * Planungs-Seiten lesen die Werte bei jedem Load frisch — Änderungen aus
 * den Einstellungen wirken nach dem nächsten Seiten-/Ansichts-Load.
 */
export interface PlanningDefaults {
  /** Vorhandene On-Campus-Tage (Mon..Sa) — default Do,Fr,Sa */
  planningDays: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>
  /** null = automatisch (HS: 39–51, FS: 6–23) */
  startKW: number | null
  /** null = automatisch */
  endKW: number | null
}

export const DEFAULT_PLANNING_DAYS: PlanningDefaults['planningDays'] = ['thursday', 'friday', 'saturday']

export const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Montag',
  tuesday: 'Dienstag',
  wednesday: 'Mittwoch',
  thursday: 'Donnerstag',
  friday: 'Freitag',
  saturday: 'Samstag',
  sunday: 'Sonntag',
}

export interface AppDefaults {
  defaultDepartment?: string
  defaultProgram?: string
  defaultSemester?: string
  planning?: PlanningDefaults
}

const KEY = 'courseweaver_defaults'

export function loadAppDefaults(): AppDefaults {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as AppDefaults
  } catch { /* falls korrumpiert */ }
  return {}
}

export function saveAppDefaults(d: AppDefaults): void {
  localStorage.setItem(KEY, JSON.stringify(d))
}
