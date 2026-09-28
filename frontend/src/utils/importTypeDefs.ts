/**
 * Kap. Spec 3 — Import-Typen mit Signatur-Spalten für die automatische
 * Typ-Erkennung. Reuse der existierenden IMPORT_CONFIGS-Ids aus csvSchemas.ts,
 * damit Save/Transform unverändert über den zentralen Import-Lauf laufen kann.
 */

export interface ImportTypeDef {
  id: string
  label: string
  /** Spaltennamen, die typisch für diesen Dateityp sind (Typ-Erkennung, Spec 3) */
  signatureColumns: string[]
}

export const IMPORT_TYPE_DEFS: ImportTypeDef[] = [
  {
    id: 'learning_cycles',
    label: 'Modul-Konzept (Module & Learning Cycles)',
    signatureColumns: ['learning goals', 'main content', 'didactics & tools', 'assignment type'],
  },
  {
    id: 'modules',
    label: 'Module',
    signatureColumns: ['code', 'ects', 'creditpoints', 'contacthours'],
  },
  {
    id: 'study_programs',
    label: 'Study Programs',
    signatureColumns: ['degreetype', 'study_program', 'studiengang'],
  },
  {
    id: 'competencies',
    label: 'Competencies',
    signatureColumns: ['category', 'topic', 'framework_name'],
  },
  {
    id: 'proofs_of_knowledge',
    label: 'Proofs of Knowledge',
    signatureColumns: ['assessmenttype', 'multiplechoice', 'freetext', 'assignmentscope'],
  },
  {
    id: 'rooms',
    label: 'Rooms',
    signatureColumns: ['room_number', 'capacity_seats', 'room_type'],
  },
  {
    id: 'locations',
    label: 'Locations',
    signatureColumns: ['building', 'campus', 'address'],
  },
]

/** Kap. Spec 3 — Score-Suche über Signatur-Spalten je Datei */
export function detectImportType(file: { columns: string[] }, types: ImportTypeDef[]): ImportTypeDef {
  const columns = file.columns.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const scored = types.map(t => ({
    type: t,
    score: t.signatureColumns.filter((sig) => {
      const sigNorm = sig.toLowerCase().replace(/[^a-z0-9]/g, '')
      return columns.some(col => col.includes(sigNorm) || sigNorm.includes(col))
    }).length,
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0]!.type
}
