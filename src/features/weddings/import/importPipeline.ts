import { mergeSavedColumnMappings } from './columnMapping'
import { buildRawRows, detectHeaderRow } from './detectHeaderRow'
import { spreadsheetCellDisplay } from './parseDates'
import type {
  ColumnMapping,
  ParsedWorkbookSheet,
  RawImportRow,
  SpreadsheetMatrixRow,
} from './types'
import { devDebugArgs } from '@/lib/debug/devConsole'

export function headersFromMatrixRow(row: SpreadsheetMatrixRow): {
  headers: string[]
  columnIds: string[]
} {
  const headers = row.cells.map(
    (cell, index) => spreadsheetCellDisplay(cell) || `Kolumna ${index + 1}`,
  )
  const columnIds = headers.map((_, index) => `col-${index}`)
  return { headers, columnIds }
}

export function findMatrixRow(
  rows: SpreadsheetMatrixRow[],
  headerRowIndexZeroBased: number,
): SpreadsheetMatrixRow | undefined {
  return rows.find((row) => row.sheetRowIndexZeroBased === headerRowIndexZeroBased)
}

/** Single source of truth after header row is chosen (auto-detect or manual). */
export function applyHeaderRowSelection(input: {
  sheet: ParsedWorkbookSheet
  headerRowIndexZeroBased: number
  savedMappings?: ColumnMapping[] | null
}): {
  confirmedHeaderRowIndexZeroBased: number
  headerRowNumberOneBased: number
  headers: string[]
  columnIds: string[]
  rawRows: RawImportRow[]
  mappings: ColumnMapping[]
} {
  const headerRow = findMatrixRow(input.sheet.rows, input.headerRowIndexZeroBased)
  if (!headerRow) {
    throw new Error('Nie znaleziono wiersza nagłówków w arkuszu.')
  }

  const { headers, columnIds } = headersFromMatrixRow(headerRow)
  const rawRows = buildRawRows({
    rows: input.sheet.rows,
    headerRowIndexZeroBased: input.headerRowIndexZeroBased,
    headers,
    columnIds,
  })
  const mappings = mergeSavedColumnMappings({
    headers,
    columnIds,
    saved: input.savedMappings ?? null,
  })

  return {
    confirmedHeaderRowIndexZeroBased: input.headerRowIndexZeroBased,
    headerRowNumberOneBased: input.headerRowIndexZeroBased + 1,
    headers,
    columnIds,
    rawRows,
    mappings,
  }
}

export function detectAndApplyHeaderRow(input: {
  sheet: ParsedWorkbookSheet
  savedMappings?: ColumnMapping[] | null
}) {
  const detection = detectHeaderRow(input.sheet.rows)
  const applied = applyHeaderRowSelection({
    sheet: input.sheet,
    headerRowIndexZeroBased: detection.headerRowIndexZeroBased,
    savedMappings: input.savedMappings,
  })
  return { detection, ...applied }
}

export type ImportDateRowDiagnostics = {
  confirmedHeaderRowIndexZeroBased: number
  sourceRowNumberOneBased: number
  mappedDateColumn: string | null
  rawDateCell: unknown
  formattedDateCell: string | null
  parsedDate: string | null
  dateIssueCode: string | null
  reviewWeddingDate: string | null
}

export function logImportDateDiagnostics(
  diagnostics: ImportDateRowDiagnostics,
): void {
  try {
    if (!import.meta.env?.DEV) return
  } catch {
    return
  }
  devDebugArgs('[wedding-import] first data row date diagnostics', diagnostics)
}
