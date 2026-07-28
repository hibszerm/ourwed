import * as XLSXNamespace from 'xlsx'
import type { ParsedWorkbook, ParsedWorkbookSheet, SpreadsheetMatrixRow } from './types'

/** Vite ESM has named exports; Node CJS interop often nests under `.default`. */
const XLSX = ((XLSXNamespace as { default?: typeof XLSXNamespace }).default ??
  XLSXNamespace) as typeof XLSXNamespace

type XlsxCellObject = import('xlsx').CellObject
type XlsxWorkSheet = import('xlsx').WorkSheet
type XlsxWorkBook = import('xlsx').WorkBook

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024

const ACCEPTED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv'])

export function validateImportFile(file: File): string | null {
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  if (!ACCEPTED_EXTENSIONS.has(ext)) {
    return 'Nie udało się odczytać tego pliku. Wybierz plik XLSX lub CSV.'
  }
  if (file.size === 0) {
    return 'Wybrany plik jest pusty.'
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return 'Plik jest zbyt duży. Maksymalny rozmiar to 10 MB.'
  }
  return null
}

function trimTrailingEmptyRows(rows: SpreadsheetMatrixRow[]): SpreadsheetMatrixRow[] {
  let end = rows.length
  while (end > 0) {
    const row = rows[end - 1]
    if (
      !row ||
      row.cells.every((cell) => {
        const display = cell.formatted?.trim() || String(cell.raw ?? '').trim()
        return display === ''
      })
    ) {
      end -= 1
      continue
    }
    break
  }
  return rows.slice(0, end)
}

function readSheetCell(cell: XlsxCellObject | undefined) {
  if (!cell) return { raw: '' }
  return {
    raw: cell.v ?? '',
    formatted: cell.w,
    cellType: cell.t,
    numberFormat: cell.z == null ? undefined : String(cell.z),
  }
}

function sheetToRows(sheet: XlsxWorkSheet): SpreadsheetMatrixRow[] {
  const ref = sheet['!ref']
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const rows: SpreadsheetMatrixRow[] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      cells.push(readSheetCell(sheet[addr]))
    }
    rows.push({ sheetRowIndexZeroBased: r, cells })
  }
  return trimTrailingEmptyRows(rows)
}

function workbookUses1904DateSystem(workbook: XlsxWorkBook): boolean {
  return Boolean(workbook.Workbook?.WBProps?.date1904)
}

export async function parseImportWorkbook(file: File): Promise<ParsedWorkbook> {
  const validation = validateImportFile(file)
  if (validation) throw new Error(validation)

  const buffer = await file.arrayBuffer()
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''

  let workbook: XlsxWorkBook
  try {
    if (ext === '.csv') {
      const text = new TextDecoder('utf-8').decode(buffer)
      const withBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
      workbook = XLSX.read(withBom, {
        type: 'string',
        FS: withBom.includes(';') && !withBom.includes(',') ? ';' : ',',
      })
    } else {
      workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    }
  } catch {
    throw new Error('Nie udało się odczytać tego pliku. Wybierz plik XLSX lub CSV.')
  }

  if (!workbook.SheetNames.length) {
    throw new Error('Nie znaleźliśmy danych do importu w wybranym arkuszu.')
  }

  const date1904 = workbookUses1904DateSystem(workbook)
  const sheets: ParsedWorkbookSheet[] = workbook.SheetNames.map(
    (name: string, index: number) => {
      const rows = sheetToRows(workbook.Sheets[name]!)
      const dataRowCount = rows.filter((row) =>
        row.cells.some((cell) => {
          const display = cell.formatted?.trim() || String(cell.raw ?? '').trim()
          return display !== ''
        }),
      ).length
      return {
        id: `sheet-${index}`,
        name,
        rowCount: Math.max(0, dataRowCount - 1),
        rows,
        date1904,
      }
    },
  ).filter((sheet: ParsedWorkbookSheet) => sheet.rows.length > 0)

  if (!sheets.length) {
    throw new Error('Nie znaleźliśmy danych do importu w wybranym arkuszu.')
  }

  return { fileName: file.name, sheets }
}
