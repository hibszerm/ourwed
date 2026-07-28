import { HEADER_ALIASES } from './columnMapping'
import { spreadsheetCellDisplay } from './parseDates'
import { normalizeHeaderKey } from './normalizeHeader'
import type { RawImportRow, SpreadsheetCellValue, SpreadsheetMatrixRow } from './types'

export type HeaderDetectionResult = {
  /** Zero-based Excel/sheet row index of the detected header row. */
  headerRowIndexZeroBased: number
  /** One-based Excel row number of the detected header row. */
  headerRowNumberOneBased: number
  headers: string[]
  columnIds: string[]
  confidence: number
}

const KNOWN_HEADERS = new Set(
  Object.values(HEADER_ALIASES).flatMap((aliases) => aliases.map(normalizeHeaderKey)),
)

function cellText(cell: SpreadsheetCellValue | undefined): string {
  return spreadsheetCellDisplay(cell ?? { raw: '' })
}

function scoreHeaderRow(row: SpreadsheetMatrixRow): number {
  const cells = row.cells.map((cell) => cellText(cell))
  const nonEmpty = cells.filter(Boolean)
  if (nonEmpty.length < 2) return 0

  const unique = new Set(nonEmpty.map(normalizeHeaderKey))
  const knownHits = [...unique].filter((h) => KNOWN_HEADERS.has(h)).length
  const textLike = nonEmpty.filter((c) => /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(c)).length

  return knownHits * 4 + textLike + unique.size * 0.5
}

export function detectHeaderRow(rows: SpreadsheetMatrixRow[]): HeaderDetectionResult {
  const scanLimit = Math.min(rows.length, 20)
  let bestIndex = 0
  let bestScore = -1

  for (let i = 0; i < scanLimit; i++) {
    const score = scoreHeaderRow(rows[i] ?? { sheetRowIndexZeroBased: i, cells: [] })
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  const headerRow = rows[bestIndex] ?? { sheetRowIndexZeroBased: 0, cells: [] }
  const headerCells = headerRow.cells.map((cell) => cellText(cell))
  const headers = headerCells.map((header, index) => header || `Kolumna ${index + 1}`)
  const columnIds = headers.map((_, index) => `col-${index}`)

  return {
    headerRowIndexZeroBased: headerRow.sheetRowIndexZeroBased,
    headerRowNumberOneBased: headerRow.sheetRowIndexZeroBased + 1,
    headers,
    columnIds,
    confidence: bestScore,
  }
}

export function buildRawRows(input: {
  rows: SpreadsheetMatrixRow[]
  headerRowIndexZeroBased: number
  headers: string[]
  columnIds: string[]
}): RawImportRow[] {
  const result: RawImportRow[] = []

  for (const matrixRow of input.rows) {
    if (matrixRow.sheetRowIndexZeroBased <= input.headerRowIndexZeroBased) continue

    const values: Record<string, SpreadsheetCellValue> = {}
    let hasValue = false

    for (let c = 0; c < input.columnIds.length; c++) {
      const value = matrixRow.cells[c] ?? { raw: '' }
      if (cellText(value) !== '') hasValue = true
      values[input.columnIds[c]!] = value
    }

    if (hasValue) {
      result.push({
        sourceRowNumber: matrixRow.sheetRowIndexZeroBased + 1,
        values,
      })
    }
  }

  return result
}

export function isHeaderLikeDataRow(input: {
  row: RawImportRow
  mappings: Array<{ sourceColumnId: string; sourceHeader: string; targetField: string }>
}): boolean {
  const mappedHeaders = input.mappings
    .filter((mapping) => mapping.targetField !== 'ignore')
    .map((mapping) => normalizeHeaderKey(mapping.sourceHeader))
    .filter(Boolean)

  if (mappedHeaders.length < 2) return false

  let matches = 0
  for (const mapping of input.mappings) {
    if (mapping.targetField === 'ignore') continue
    const cell = input.row.values[mapping.sourceColumnId]
    const normalized = normalizeHeaderKey(spreadsheetCellDisplay(cell))
    if (normalized && mappedHeaders.includes(normalized)) {
      matches += 1
    }
  }

  return matches >= 2
}
