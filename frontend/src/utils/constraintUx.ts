/**
 * Constraint-Erfassung: UI-taugliche Transformation des Constraint-Katalogs
 * (Spec Kap. 2/4). Der Catalog lebt in server/solver/constraintCatalog.ts und
 * wird über /api/timetable/constraints geladen.
 * Spec Fix 2026-09: Kategorien werden aus den vorhandenen Regeltypen ABGELEITET
 * (categoriesFromTypeDefs), nicht als eigenes Array gepflegt — sonst laufen
 * Sidebar-Kategorien und Regeltypen auseinander (fehlendes „Raum"/ROOM_CAPACITY).
 */

export type ConstraintCategoryId = 'zeitfenster' | 'raum' | 'reihenfolge' | 'verteilung' | 'tag'

export interface ConstraintCategory {
  id: ConstraintCategoryId
  label: string
}

/** Anzeige-Reihenfolge + Labels; die Liste ALS SUCHEN folgt aus categoryFromCatalogId */
export const CATEGORY_LABELS: Record<ConstraintCategoryId, string> = {
  zeitfenster: 'Zeitfenster',
  raum: 'Raum',
  reihenfolge: 'Reihenfolge',
  verteilung: 'Verteilung',
  tag: 'Tages-Tags',
}

export interface ConstraintTypeDef {
  id: string
  catalogId: string // stabile ID aus constraintCatalog.ts
  category: ConstraintCategoryId
  name: string
  desc: string
  hard: boolean // fest pro Typ, nicht durch die Person wählbar
  /** Kap. Spec 8 — systemseitig erzwungen (Solver-built-in), nicht editierbar */
  system?: boolean
}

export interface ConstraintInstance {
  /** `${moduleId}::${restrictionId}::${idx}` — stabile Identifikation zur Löschliste */
  id: string
  typeId: string
  moduleId: string
  moduleTitle: string
  params?: Record<string, unknown>
  weight?: number // nur weiche Regeln
}

interface CatalogDefLike {
  id: string
  category: 'hard' | 'soft'
  description: string
}

/** Kap. Spec 2 — Transformationsfunktion Katalog → UI-Typse Liste */
export function catalogToTypeDefs(
  catalog: Record<string, { id: string; category: 'hard' | 'soft'; description: string }>,
): ConstraintTypeDef[] {
  const mapping: Record<string, { type: ConstraintTypeDef['id']; category: ConstraintCategoryId }> = {
    ALLOWED_WEEKDAYS: { type: 'no_weekday', category: 'zeitfenster' },
    UNAVAILABLE_DATES: { type: 'exclude_dates', category: 'zeitfenster' },
    ALLOWED_PHASE: { type: 'phase_only', category: 'zeitfenster' },
    FIXED_DAY: { type: 'fixed_day', category: 'zeitfenster' },
    INSTRUCTOR_OUTLOOK_BUSY: { type: 'outlook_busy', category: 'zeitfenster' },
    MODULE_PREREQUISITE_ORDER: { type: 'prerequisite', category: 'reihenfolge' },
    AVOID_SATURDAY: { type: 'avoid_saturday', category: 'verteilung' },
    AVOID_FRIDAY_AFTERNOON: { type: 'avoid_friday', category: 'zeitfenster' },
    PREFER_MORNING: { type: 'prefer_morning', category: 'zeitfenster' },
    AVOID_EVENING: { type: 'avoid_evening', category: 'zeitfenster' },
    PREFER_EARLY_DATES: { type: 'prefer_early', category: 'verteilung' },
    REQUIRED_DAY_TAGS: { type: 'day_tags', category: 'tag' },
    PROHIBITED_DAY_TAGS: { type: 'day_tags', category: 'tag' },
    UNDESIRED_DAY_TAGS: { type: 'day_tags', category: 'tag' },
    PREFERRED_DAY_TAGS: { type: 'day_tags', category: 'tag' },
    // Spec Fix: ROOM_CAPACITY jetzt EDITIERBAR als „Raum"-Regel (schreibt expectedStudents)
    ROOM_CAPACITY: { type: 'room_capacity', category: 'raum' },
  }
  const defs: ConstraintTypeDef[] = []
  const seenIds = new Set<string>()
  for (const entry of Object.values(catalog as Record<string, CatalogDefLike>)) {
    const map = mapping[entry.id]
    if (!map) continue // System-Regeln (Solver-built-ins) erscheinen nur im Systemregeln-Block
    if (seenIds.has(map.type)) continue // tslups: mehrere Katalog-Ids → EIN Regeltyp (z. B. day_tags mit 4 Relationen)
    seenIds.add(map.type)
    defs.push({
      id: map.type,
      catalogId: entry.id,
      category: map.category,
      name: TYPE_NAMES[map.type] ?? entry.id,
      desc: entry.description,
      hard: entry.category === 'hard',
    })
  }
  // dedupe by typeId (multiple catalog ids pueden share a type via tags filter)
  return defs
}

/* ---------------------------------------------------------------------- */
/* Kap. 11.2 — Tag-basierte Constraint-Generalisierung: die 4 Katalog-Ids   */
/* (REQUIRED/PROHIBITED/PREFERRED/UNDESIRED_DAY_TAGS) werden als EIN Regel- */
/* typ 'day_tags' über die Relation gewählt. Tag-Regeln leben als           */
/* Modul-Felder (mod.requiredDayTags etc. — der Solver liest genau dort).   */
/* ---------------------------------------------------------------------- */

export type TagRelation = 'required' | 'prohibited' | 'preferred' | 'undesired'

export interface TagRuleValue {
  relation: TagRelation
  /** Freitext mit Autocomplete aus bereits verwendeten Tags (TagRuleFields) */
  tag: string
  targetModuleId: string
}

export const TAG_CATALOG_IDS = ['REQUIRED_DAY_TAGS', 'PROHIBITED_DAY_TAGS', 'PREFERRED_DAY_TAGS', 'UNDESIRED_DAY_TAGS'] as const

export const TAG_RELATION_META: Record<TagRelation, { label: string; catalogId: string; moduleField: string; hard: boolean }> = {
  required:   { label: 'Benötigt',    catalogId: 'REQUIRED_DAY_TAGS',   moduleField: 'requiredDayTags',   hard: true },
  prohibited: { label: 'Verboten',    catalogId: 'PROHIBITED_DAY_TAGS', moduleField: 'prohibitedDayTags', hard: true },
  preferred:  { label: 'Bevorzugt',   catalogId: 'PREFERRED_DAY_TAGS',  moduleField: 'preferredDayTags',  hard: false },
  undesired:  { label: 'Ungewünscht', catalogId: 'UNDESIRED_DAY_TAGS',  moduleField: 'undesiredDayTags',  hard: false },
}

export function tagCatalogId(relation: TagRelation): string {
  return TAG_RELATION_META[relation].catalogId
}


/** Spec Fix — Kategorien aus den VORHANDENEN Regeltypen ableiten (nicht als eigenes Array pflegen). */
export const CATEGORY_ORDER: ConstraintCategoryId[] = ['zeitfenster', 'raum', 'reihenfolge', 'verteilung', 'tag']

export function categoriesFromTypeDefs(typeDefs: ConstraintTypeDef[]): ConstraintCategory[] {
  const present = new Set(typeDefs.map((t) => t.category))
  return CATEGORY_ORDER.filter((id) => present.has(id)).map((id) => ({ id, label: CATEGORY_LABELS[id] }))
}

/** Spec: lesbarer Name pro Regeltyp (Zeilen- und Karten-Anzeige) */
export const TYPE_NAMES: Record<string, string> = {
  no_weekday: 'Nicht an Wochentagen',
  exclude_dates: 'Gesperrte Termine',
  phase_only: 'Nur Phase',
  fixed_day: 'Fixierter Tag',
  outlook_busy: 'Outlook-Sperre',
  prerequisite: 'Prerequisite-Ordnung',
  avoid_saturday: 'Samstag vermeiden',
  avoid_friday: 'Freitagnachmittag vermeiden',
  prefer_morning: 'Vormittag bevorzugen',
  avoid_evening: 'Abendtermine vermeiden',
  prefer_early: 'Frühe Termine bevorzugen',
  day_tags: 'Tages-Tags',
  room_capacity: 'Raum-Kapazität',
  generic_soft: 'Weiche Regel (eigenes Gewicht)',
}

/** Kap. Spec 8 — Systemregeln: fest im Solver für jedes Modul, nicht editierbar */
export const SYSTEM_RULE_IDS = [
  // ROOM_CAPACITY ist seit Spec-Fix eine editierbare „Raum"-Regel (siehe RoomCapacityFields)
  'NO_TEACHER_OVERLAP',
  'ROOM_OCCUPANCY',
  'COHORT_CONFLICT',
  'WEEKLY_BALANCE',
  'TEACHER_ROOM_STABILITY',
  'TEACHER_MAKESPAN',
] as const

export interface CatalogConstraintLike {
  id: string
  category: 'hard' | 'soft'
  description: string
}

export function systemRules(catalog: Record<string, CatalogConstraintLike>): CatalogConstraintLike[] {
  return SYSTEM_RULE_IDS.map((id) => catalog[id]).filter((c): c is CatalogConstraintLike => !!c)
}

/** Badge-Klassen Hart/Weich — Spec Kap. 5: eine Stelle für die Farblogik */
export function badgeClasses(hard: boolean): string {
  return hard ? 'badge badge-hard' : 'badge badge-soft'
}

/** Kap. Spec 2 — Modul-Restrictions in Instanzen zerlegen (mit Module-Kontext zum Save) */
const RESTRICTION_TYPE: Record<string, string> = {
  ALLOWED_WEEKDAYS: 'no_weekday',
  UNAVAILABLE_DATES: 'exclude_dates',
  ALLOWED_PHASE: 'phase_only',
  FIXED_DAY: 'fixed_day',
  INSTRUCTOR_OUTLOOK_BUSY: 'outlook_busy',
  MODULE_PREREQUISITE_ORDER: 'prerequisite',
  AVOID_SATURDAY: 'avoid_saturday',
  AVOID_FRIDAY_AFTERNOON: 'avoid_friday',
  PREFER_MORNING: 'prefer_morning',
  AVOID_EVENING: 'avoid_evening',
  PREFER_EARLY_DATES: 'prefer_early',
  REQUIRED_DAY_TAGS: 'day_tags',
  PROHIBITED_DAY_TAGS: 'day_tags',
  UNDESIRED_DAY_TAGS: 'day_tags',
  PREFERRED_DAY_TAGS: 'day_tags',
}

export function typeFromCatalog(catalogId: string): string {
  return RESTRICTION_TYPE[catalogId] ?? 'generic_soft'
}

/**
 * Modul-Restrictions in Instanzen zerlegen (mit Module-Kontext zum Save).
 * Spec Fix 2026-09: SYNTHETISCHE Instanzen für Regeln, die als Modul-FELD
 * gespeichert werden (keine restrictions-Einträge) — nur so existieren die
 * „Raum"-Kapazität und die 4 Tag-Relationen als editierbare Zeilen (Akkordeon):
 *   - room_capacity  → expectedStudents
 *   - required/prohibited/preferred/undesired DayTags (je existierender Eintrag eine Zeile)
 *   - prerequisite   → prerequisiteModuleIds (je Zielmodul eine Zeile)
 * Synthetic-Ids: `${moduleId}::CATALOG::synthetic(...)` → ruleSource ist null,
 * Speichern/Löschen laufen in die Sonderfälle (nicht in restrictions[]).
 */
export function instancesFromModule(
  module: { _id?: string; id?: string; title?: string; name?: string; restrictions?: Array<{ id: string; category: string; weight?: number; params?: Record<string, unknown> }>, expectedStudents?: number, requiredDayTags?: unknown, prohibitedDayTags?: unknown, preferredDayTags?: unknown, undesiredDayTags?: unknown, prerequisiteModuleIds?: unknown },
): ConstraintInstance[] {
  const moduleId = module._id ?? module.id ?? ''
  const title = module.title ?? module.name ?? moduleId
  const out: ConstraintInstance[] = []
  for (const r of module.restrictions ?? []) {
    const idx = (module.restrictions ?? []).indexOf(r)
    if (r.id === 'FIXED_SLOT') continue // interner Solver-Mechanismus, nicht UI-editierbar
    // outlook-Instanzen: zwei Restriktionen teilen die Id (date in params) → stabil
    const date = (r.params as any)?.date ?? ''
    out.push({
      id: `${moduleId}::${r.id}::${idx}${date ? `::${date}` : ''}`,
      typeId: typeFromCatalog(r.id),
      moduleId,
      moduleTitle: title,
      params: r.params,
      weight: r.weight,
    })
  }

  // Raume Kapazität (Raum-Kategorie)
  const cap = Number(module.expectedStudents)
  if (Number.isFinite(cap)) {
    out.push({
      id: `${moduleId}::ROOM_CAPACITY::synthetic`,
      typeId: 'room_capacity',
      moduleId,
      moduleTitle: title,
      params: { students: cap },
    })
  }

  // Tag-Relationen (Tages-Tags-Kategorie) — je Tag-Eintrag eine Zeile
  for (const relation of Object.keys(TAG_RELATION_META) as TagRelation[]) {
    const arr = module[TAG_RELATION_META[relation].moduleField as keyof typeof module] as unknown
    if (!Array.isArray(arr)) continue
    for (const tag of arr as unknown[]) {
      if (typeof tag !== 'string' || !tag) continue
      out.push({
        id: `${moduleId}::${TAG_RELATION_META[relation].catalogId}::synthetic::${tag}`,
        typeId: 'day_tags',
        moduleId,
        moduleTitle: title,
        params: { relation, tag },
      })
    }
  }

  // Prerequisites — je Zielmodul eine Zeile (Voraussetzungs-Ordnung)
  const prereqs = Array.isArray(module.prerequisiteModuleIds) ? (module.prerequisiteModuleIds as string[]) : []
  if (prereqs.length > 0) {
    const moduleTitleById = new Map<string, string>()
    void moduleTitleById
    for (const target of prereqs) {
      out.push({
        id: `${moduleId}::MODULE_PREREQUISITE_ORDER::synthetic::${target}`,
        typeId: 'prerequisite',
        moduleId,
        moduleTitle: title,
        params: { targetModuleId: target },
      })
    }
  }

  return out
}

