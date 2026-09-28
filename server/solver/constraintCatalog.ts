/**
 * Constraint-Katalog mit stabilen IDs (Kap. 3.3)
 * Jede Regel hat feste ID, Kategorie und Gewicht.
 * Wird sowohl von buildSolverInput (Stufe 2) als auch von explainSolution (Stufe 4) verwendet.
 */

export type ConstraintCategory = 'hard' | 'soft'

/**
 * Skalierungsfaktor für Soft-Penalties im Solver-Objective (Review-Fix #7):
 * Die echten Soft-Constraints werden mit SOFT_PENALTY_SCALE multipliziert,
 * der Early-Date-Tie-Breaker bleibt unskaliert — dadurch kann der
 * Tie-Breaker nie dominieren, egal wie viele Sessions/Tage.
 * explainSolution multipliziert Soft-Costs mit demselben Faktor, so dass
 * Report von objectiveValue konsistent ist.
 */
export const SOFT_PENALTY_SCALE = 1000

export interface ConstraintDefinition {
  id: string
  category: ConstraintCategory
  weight: number // hard: 1 (irrelevant, erzwingt Filter), soft: Strafgewicht
  enabled: boolean
  description: string
}

/**
 * Stabile IDs – nie umbenennen, nur deprecaten.
 * Neue Regeln hier ergänzen, nicht hart codiert im Modell verstecken.
 */
export const CONSTRAINT_CATALOG = {
  // --- Hard: Filter erzeugen allowedDayIds / allowedRoomIds
  NO_TEACHER_OVERLAP: {
    id: 'NO_TEACHER_OVERLAP',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Dozent darf nicht in überlappenden SlotTypes am selben Tag in zwei Modulen sein',
  },
  ROOM_CAPACITY: {
    id: 'ROOM_CAPACITY',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Raumkapazität muss expectedStudents erfüllen',
  },
  ROOM_OCCUPANCY: {
    id: 'ROOM_OCCUPANCY',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Raum darf nicht in überlappenden SlotTypes am selben Tag doppelt belegt sein',
  },
  UNAVAILABLE_DATES: {
    id: 'UNAVAILABLE_DATES',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Harte Sperrzeiten pro Modul (params: { dates: string[] })',
  },
  ALLOWED_WEEKDAYS: {
    id: 'ALLOWED_WEEKDAYS',
    category: 'hard',
    weight: 1,
    enabled: true,
    description: 'Nur bestimmte Wochentage erlaubt (params: { weekdays: OnCampusDay["weekday"][] })',
  },
  INSTRUCTOR_OUTLOOK_BUSY: {
    id: 'INSTRUCTOR_OUTLOOK_BUSY',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Outlook: Instructor busy/oof im Slot (params: { instructorId, date, slot })',
  },
  /** Kap. 11.1 — Kohorten-Konflikt: dieselbe Kohorte (Programm+Semester) kann nicht parallel lernen */
  COHORT_CONFLICT: {
    id: 'COHORT_CONFLICT',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Kohorte (Programm+Semester) kann nicht in überlappenden SlotTypes am selben Tag in zwei Modulen sein',
  },
  /** Kap. 11.3 — unabhängig bestätigt (ITC + Conference-Scheduling): Voraussetzungen zuerst */
  MODULE_PREREQUISITE_ORDER: {
    id: 'MODULE_PREREQUISITE_ORDER',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Alle On-Campus-Days des Prerequisite-Moduls liegen VOR denen des abhängigen Moduls',
  },
  /** Kap. 11.4 — Soft: „Teacher room stability“ auf Modul-Ebene */
  TEACHER_ROOM_STABILITY: {
    id: 'TEACHER_ROOM_STABILITY',
    category: 'soft' as const,
    weight: 10,
    enabled: true,
    description: 'Sessions eines Moduls möglichst in demselben Raum (logistischer Mehraufwand vermeiden)',
  },
  /** Kap. 11.4 — Soft: Zeitspanne/Lücken über die Sessions einer Dozierenden-Person minimieren */
  TEACHER_MAKESPAN: {
    id: 'TEACHER_MAKESPAN',
    category: 'soft' as const,
    weight: 5,
    enabled: true,
    description: 'Gesamte Zeitspanne (max-min Tag) der Sessions je DozierenderPerson minimieren',
  },
  /**
   * Kap. 11.2 — generisches Tag-System: ein einziger generischer Builder deckt
   * required/prohibited (hart) und preferred/undesired (soft) ab — keine bespoke
   * Sonderregeln mehr für jede neue Tages-Restriktion.
   */
  REQUIRED_DAY_TAGS: {
    id: 'REQUIRED_DAY_TAGS',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Alle gesetzten requiredDayTags müssen am Tag vorhanden sein (weekday:friday, week:odd, phase:final…)',
  },
  PROHIBITED_DAY_TAGS: {
    id: 'PROHIBITED_DAY_TAGS',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Keines der gesetzten prohibitedDayTags darf am Tag vorhanden sein',
  },
  PREFERRED_DAY_TAGS: {
    id: 'PREFERRED_DAY_TAGS',
    category: 'soft' as const,
    weight: 5,
    enabled: true,
    description: 'preferredDayTags bevorzugen (Penalty wenn Tag keins der Tags hat)',
  },
  UNDESIRED_DAY_TAGS: {
    id: 'UNDESIRED_DAY_TAGS',
    category: 'soft' as const,
    weight: 5,
    enabled: true,
    description: 'undesiredDayTags meiden (Penalty wenn Tag einen dieser Tags trägt)',
  },

  INSTRUCTOR_OUTLOOK_TENTATIVE: {
    id: 'INSTRUCTOR_OUTLOOK_TENTATIVE',
    category: 'soft',
    weight: 15,
    enabled: true,
    description: 'Outlook: tentative Termine im Slot meiden (params: { instructorId, date, slot })',
  },
  INSTRUCTOR_OUTLOOK_UNKNOWN: {
    id: 'INSTRUCTOR_OUTLOOK_UNKNOWN',
    category: 'soft',
    weight: 5,
    enabled: true,
    description: 'Outlook: unbekannter Status — Slot meiden, manuelle Prüfung anstossen (params: { instructorId, date, slot })',
  },
  ALLOWED_PHASE: {
    id: 'ALLOWED_PHASE',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Nur bestimmte Phasen erlaubt (params: { phases: ("main"|"final")[] })',
  },
  FIXED_DAY: {
    id: 'FIXED_DAY',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Modul fix auf Datum gelegt (params: { dates: string[] })',
  },
  WEEKLY_BALANCE: {
    id: 'WEEKLY_BALANCE',
    category: 'hard' as const,
    weight: 1,
    enabled: true,
    description: 'Wochenbalance: min/max Module pro Kalenderwoche',
  },

  // --- Soft: erzeugen softPenalties (gewichtete Präferenzen)
  AVOID_FRIDAY_AFTERNOON: {
    id: 'AVOID_FRIDAY_AFTERNOON',
    category: 'soft' as const,
    weight: 20,
    enabled: true,
    description: 'Freitag Nachmittag meiden',
  },
  AVOID_SATURDAY: {
    id: 'AVOID_SATURDAY',
    category: 'soft' as const,
    weight: 10,
    enabled: true,
    description: 'Samstag meiden',
  },
  PREFER_MORNING: {
    id: 'PREFER_MORNING',
    category: 'soft' as const,
    weight: 5,
    enabled: true,
    description: 'Vormittag bevorzugen (params gewichtet)',
  },
  AVOID_EVENING: {
    id: 'AVOID_EVENING',
    category: 'soft' as const,
    weight: 15,
    enabled: true,
    description: 'Abend-Slot meiden',
  },
  MINIMIZE_STUDENT_GAPS: {
    id: 'MINIMIZE_STUDENT_GAPS',
    category: 'soft' as const,
    weight: 5,
    enabled: false,
    description: 'Lücken im Stundenplan minimieren (platzhalter, braucht Kohortenmodell)',
  },
  PREFER_EARLY_DATES: {
    id: 'PREFER_EARLY_DATES',
    category: 'soft' as const,
    weight: 1,
    enabled: true,
    description: 'Frühe Termine leicht bevorzugen (tie-breaker)',
  },
} as const satisfies Record<string, ConstraintDefinition>

export type ConstraintId = keyof typeof CONSTRAINT_CATALOG

/** Hilfen: Gewicht auflösen (Restriction.weight überschreibt Katalog falls gesetzt) */
export function resolveWeight(id: string, override?: number): number {
  const entry = (CONSTRAINT_CATALOG as Record<string, ConstraintDefinition>)[id]
  if (override !== undefined) return override
  return entry?.weight ?? 1
}

export function isHard(id: string): boolean {
  const entry = (CONSTRAINT_CATALOG as Record<string, ConstraintDefinition>)[id]
  return entry?.category === 'hard'
}

export function getConstraint(id: string): ConstraintDefinition | undefined {
  return (CONSTRAINT_CATALOG as Record<string, ConstraintDefinition>)[id]
}
