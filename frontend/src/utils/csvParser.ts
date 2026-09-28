/**
 * Robust CSV parser that handles:
 * - Comma, semicolon, and tab delimiters
 * - Quoted fields with escaped quotes ("" -> ")
 * - Newlines inside quoted fields
 * - Trimmed header names
 */
export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  rawRows: string[][]
}

export interface ParseCsvOptions {
  delimiter?: string
  hasHeader?: boolean
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || ''
  const commas = (firstLine.match(/,/g) || []).length
  const semicolons = (firstLine.match(/;/g) || []).length
  const tabs = (firstLine.match(/\t/g) || []).length

  if (semicolons > commas && semicolons > tabs) return ';'
  if (tabs > commas && tabs > semicolons) return '\t'
  return ','
}

export function parseCsv(text: string, optionsOrDelimiter?: string | ParseCsvOptions): ParsedCsv {
  let customDelimiter: string | undefined
  let hasHeader = true

  if (typeof optionsOrDelimiter === 'string') {
    customDelimiter = optionsOrDelimiter
  } else if (optionsOrDelimiter) {
    customDelimiter = optionsOrDelimiter.delimiter
    if (optionsOrDelimiter.hasHeader !== undefined) {
      hasHeader = optionsOrDelimiter.hasHeader
    }
  }

  const delimiter = customDelimiter || detectDelimiter(text)
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"'
        i += 2
      } else if (char === '"') {
        inQuotes = false
        i++
      } else {
        currentField += char
        i++
      }
    } else {
      if (char === '"') {
        inQuotes = true
        i++
      } else if (char === delimiter) {
        currentRow.push(currentField.trim())
        currentField = ''
        i++
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++
        }
        currentRow.push(currentField.trim())
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ''
        i++
      } else if (char === '\n') {
        currentRow.push(currentField.trim())
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ''
        i++
      } else {
        currentField += char
        i++
      }
    }
  }

  // Push final field/row if any content exists
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow)
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], rawRows: [] }
  }

  let headers: string[] = []
  let dataRows: string[][] = []

  if (hasHeader) {
    const rawHeaders = rows[0] || []
    headers = rawHeaders.map((h, idx) => (h ? h.trim() : `Column ${idx + 1}`))
    dataRows = rows.slice(1)
  } else {
    const maxCols = Math.max(...rows.map(r => r.length), 0)
    headers = Array.from({ length: maxCols }, (_, idx) => `Column ${idx + 1}`)
    dataRows = rows
  }

  const parsedRows: Record<string, string>[] = []
  for (const row of dataRows) {
    const rowObj: Record<string, string> = {}
    let hasAnyData = false
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const header = headers[colIdx]
      if (!header) continue
      const val = row[colIdx]?.trim() ?? ''
      rowObj[header] = val
      if (val) hasAnyData = true
    }
    if (hasAnyData) {
      parsedRows.push(rowObj)
    }
  }

  return {
    headers,
    rows: parsedRows,
    rawRows: dataRows,
  }
}
