/**
 * Central Excel parser: converts a spreadsheet file (xlsx/xls/csv) into the
 * same ParsedCsv structure used by the CSV import pipeline, so all imports
 * (CSV and Excel) share one mapping + save path (CsvImportDialog -> useCsvImport).
 */
import * as XLSX from 'xlsx'
import type { ParsedCsv } from '@/utils/csvParser'
import { parseCsv } from '@/utils/csvParser'

export const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.xlsm'] as const

export function isExcelFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return EXCEL_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/** Sheet selection: sheet name, 1-based index, or callback on sheet names. */
export type SheetSelector = string | number | ((sheets: string[]) => string)

export interface ExcelParseResult extends ParsedCsv {
  sheetNames: string[]
  selectedSheet: string
}

export function listSheetNames(workbook: XLSX.WorkBook): string[] {
  return workbook.SheetNames
}

/**
 * Parse raw spreadsheet content (e.g. from FileReader.readAsArrayBuffer) into
 * ParsedCsv from the selected sheet. Defaults to the first sheet.
 */
export function parseExcel(data: ArrayBuffer | Uint8Array, selector?: SheetSelector): ExcelParseResult {
  const workbook = XLSX.read(data, { type: 'array' })
  const sheetNames = workbook.SheetNames

  let selected = sheetNames[0] ?? ''
  if (typeof selector === 'string' && sheetNames.includes(selector)) {
    selected = selector
  } else if (typeof selector === 'number') {
    selected = sheetNames[selector] ?? selected
  } else if (typeof selector === 'function') {
    const byName = selector(sheetNames)
    if (byName && sheetNames.includes(byName)) selected = byName
  }

  const sheet = workbook.Sheets[selected]
  if (!sheet) {
    return { headers: [], rows: [], rawRows: [], sheetNames, selectedSheet: selected }
  }

  // Read as array-of-arrays so we control header handling like parseCsv does.
  const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  })

  // Remove fully empty rows, mirroring CSV parser behaviour (skips lines without content).
  const filledRows = rawRows.filter(row => row.some(cell => String(cell ?? '').trim() !== ''))
  if (filledRows.length === 0) {
    return { headers: [], rows: [], rawRows: [], sheetNames, selectedSheet: selected }
  }

  // Serialize back to CSV text and reuse the shared CSV parser -> identical
  // trimming, header handling and row objects for CSV and Excel imports.
  const csvText = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(filledRows))

  return {
    ...parseCsv(csvText, { hasHeader: true, delimiter: ',' }),
    sheetNames,
    selectedSheet: selected,
  }
}

/**
 * Flatten a "Detailed Module Concept" workbook (one sheet per module, fixed
 * layout) into flat rows with headers [module_name, program, module_code, ects,
 * lc_number, lc_content]; learning-cycle rows only. The result flows through
 * the same map/transform/save pipeline as any CSV import.
 */
/**
 * Semester-Inferenz aus dem Dateinamen, z.B. "DBA_Module_Concept_Semester2_FS2027.xlsx" → 2.
 * (Kap. 12.2/13 — nur Vorschlag, die Person bestätigt den Wert im Import-Dialog.)
 */
export function inferSemesterFromFilename(fileName: string): number | null {
  const m = fileName.match(/Semester\s*(\d+)/i)
  const n = m?.[1] ? Number(m[1]) : null
  return n && n >= 1 && n <= 12 ? n : null
}
