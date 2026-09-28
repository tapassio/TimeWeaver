/**
 * Kap. Spec 4-5 — Import-Dialog-Zustand: Parsest je Datei, Typ-Erkennung
 * mit Signature-Spalten, MandatoryField-Resolution (auto statt Handarbeit).
 */
import type { ImportTypeDef } from '@/utils/importTypeDefs'
import { IMPORT_TYPE_DEFS, detectImportType } from '@/utils/importTypeDefs'

export interface ParsedFile {
  id: string
  file?: File
  buffer?: ArrayBuffer
  name: string
  size: number
  kind: 'excel' | 'csv'
  columns: string[]
  rows: Array<Record<string, unknown>>
  moduleConcept?: boolean
  /** import spec — Anzahl-Infos und Meta je Karte (vom Workbook-Parser) */
  moduleConceptMeta?: Record<string, string>
}

export interface MandatoryField {
  name: string
  why: string
  value: string | null
}

let seq = 0

export interface MandatoryFieldSpec {
  name: string
  why: string
  resolve: (ctx: { firstRow?: Record<string, unknown>; meta?: Record<string, string | null>; file: ParsedFile }) => string | null
}

/** Pflichtfelder je Regeltyp — resolve() versucht automatische Ableitung (Spec 5) */
export const MANDATORY_FIELDS_BY_TYPE: Record<string, MandatoryFieldSpec[]> = {
  learning_cycles: [
    { name: 'Modulname', why: 'wird als eindeutige Kennung des Moduls verwendet', resolve: ctx => (ctx.meta?.module_name ?? null) as string | null },
    { name: 'Studiengang', why: 'verknüpft das Modul mit dem Masterprogramm', resolve: ctx => (ctx.meta?.program ?? null) as string | null },
    { name: 'Semester', why: 'reihenfolge des Moduls im Programm', resolve: ctx => (ctx.meta?.semester ?? null) as string | null },
  ],
  modules: [
    { name: 'Code', why: 'eindeutige Kennung des Moduls', resolve: ctx => ((ctx.firstRow?.code as string) ?? (ctx.firstRow?.module_code as string) ?? null) },
    { name: 'Name', why: 'Anzeige-Name für Studierende und Verwaltung', resolve: ctx => (ctx.firstRow?.name as string) ?? null },
  ],
  study_programs: [
    { name: 'Programmname', why: 'identifiziert den Studiengang', resolve: ctx => (ctx.firstRow?.name as string) ?? null },
  ],
  rooms: [
    { name: 'Raumname', why: 'Referenz für die Terminplanung', resolve: ctx => (ctx.firstRow?.name as string) ?? null },
  ],
  locations: [
    { name: 'Gebäude', why: 'Ordnet Räume geografisch zu', resolve: ctx => (ctx.firstRow?.building as string) ?? null },
  ],
  availability: [
    { name: 'Dozent', why: 'Verknüpft den Verfügbarkeitsblock mit dem Dozierenden', resolve: ctx => ((ctx.firstRow?.lecturer as string) ?? (ctx.firstRow?.instructor as string) ?? (ctx.firstRow?.name as string) ?? null) },
  ],
  scheduling_rules: [
    { name: 'Regel-Name', why: 'Identifiziert die Scheduling-Regel', resolve: ctx => (ctx.firstRow?.name as string) ?? null },
  ],
  room_availability: [
    { name: 'Raum', why: 'Verknüpft die Raumverfügbarkeit mit dem Raum', resolve: ctx => ((ctx.firstRow?.roomId as string) ?? (ctx.firstRow?.room as string) ?? null) },
  ],
  weeks: [
    { name: 'Semester', why: 'Ordnet die Kalenderwoche dem Semester zu', resolve: ctx => ((ctx.firstRow?.semesterId as string) ?? (ctx.firstRow?.semester as string) ?? null) },
  ],
  schedule_entries: [
    { name: 'Modul', why: 'Belegung je Modul', resolve: ctx => ((ctx.firstRow?.moduleId as string) ?? (ctx.firstRow?.module as string) ?? null) },
  ],
}

/** resolves den Pflichtfeld-Wert aus Autokontext (Spaltenzeile, Meta vom Workbook-Parser, Dateiname) */
export function resolveMandatory(
  spec: MandatoryFieldSpec,
  file: ParsedFile,
): string | null {
  return spec.resolve({
    firstRow: (file.rows as Record<string, unknown>[])[0],
    meta: (file as unknown as { moduleConceptMeta?: Record<string, string> }).moduleConceptMeta,
    file,
  })
}

/** Kap. Spec 5 — Resolution für jede forderliche Pflichtangabe je Typ (Vorgabewerte aus der Datei) */
export function mandatoryFieldsFor(
  typeId: string,
  file: ParsedFile,
): Array<{ name: string; why: string; value: string | null; sourceText?: string }> {
  const specs: MandatoryFieldSpec[] = MANDATORY_FIELDS_BY_TYPE[typeId] ?? []
  return specs.map((spec) => ({ spec, ...resolveMandatoryEntry(spec, file) }))
}

function resolveMandatoryEntry(spec: MandatoryFieldSpec, file: ParsedFile): MandatoryField {
  const value = spec.resolve({
    firstRow: (file as ParsedFile & { rows: Array<Record<string, unknown>> }).rows?.[0] ?? {},
    meta: (file as unknown as { moduleConceptMeta?: Record<string, string> }).moduleConceptMeta,
    file,
  })
  return { name: spec.name, why: spec.why, value: value ?? null }
}

/** ID-Zuordnung `Datei → gewählter Typ` mit Vorgabe/Autsch蠕动; specdetection */
export function chosenTypeOrDefault(
  file: ParsedFile,
  chosen: Record<string, string | undefined>,
  types: ImportTypeDef[] = IMPORT_TYPE_DEFS,
): ImportTypeDef {
  const override = chosen[file.id]
  if (override) {
    const found = types.find(t => t.id === override)
    if (found) return found
  }
  return detectImportType(file, types)
}

/** Parse je Datei — CSV und Excel (Tab 1 als Tabelle, ohne Mapping-Konzept-Logik) */
export async function parseUploadedFile(file: File): Promise<ParsedFile> {
  const isExcel = /\.(xlsx|xlsm|xls)$/i.test(file.name)
  if (isExcel) {
    const buf = await file.arrayBuffer()
    const { parseExcel } = await import('@/utils/excelParser')
    const parsed = parseExcel(buf)
    return { id: `${file.name}_${++seq}`, name: file.name, size: file.size, kind: 'excel', columns: parsed.headers, rows: parsed.rows, buffer: buf, file }
  }
  const { parseCsv } = await import('@/utils/csvParser')
  const text = await file.text()
  const parsed = parseCsv(text, { hasHeader: true })
  return { id: `${file.name}_${++seq}`, name: file.name, size: file.size, kind: 'csv', columns: parsed.headers, rows: parsed.rows }
}
