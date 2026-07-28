/**
 * Apple Numbers date parsing regression tests.
 * Run: npm run test:wedding-import-dates
 */

import * as XLSX from 'xlsx'
import { buildReviewRows } from '@/features/weddings/import/buildReviewRows'
import {
  buildRawRows,
  detectHeaderRow,
} from '@/features/weddings/import/detectHeaderRow'
import {
  parseImportDate,
  parseImportDateDetailed,
} from '@/features/weddings/import/parseDates'
import type { SpreadsheetCellValue, SpreadsheetMatrixRow } from '@/features/weddings/import/types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function cell(raw: unknown, formatted?: string): SpreadsheetCellValue {
  return {
    raw,
    formatted,
    cellType: raw instanceof Date ? 'd' : typeof raw === 'number' ? 'n' : 's',
  }
}

function matrixToRows(rows: SpreadsheetCellValue[][]): SpreadsheetMatrixRow[] {
  return rows.map((cells, index) => ({
    sheetRowIndexZeroBased: index,
    cells,
  }))
}

const FROZEN_TODAY = '2026-07-28'

run('Polish abbreviated text with year', () => {
  const cases: Array<[string, string]> = [
    ['11-kwi-2026', '2026-04-11'],
    ['16-maj-2026', '2026-05-16'],
    ['3-cze-2026', '2026-06-03'],
    ['4-lip-2026', '2026-07-04'],
    ['11-paź-2026', '2026-10-11'],
    ['11 kwi 2026', '2026-04-11'],
    ['11.kwi.2026', '2026-04-11'],
    ['11 KWI 2026', '2026-04-11'],
    ['11-kwi.', '2026-04-11'],
  ]
  for (const [input, expected] of cases) {
    assertEq(
      parseImportDate(input, { sheetName: 'Sezon 2026' }),
      expected,
      input,
    )
  }
})

run('missing year uses raw Date before sheet name', () => {
  const result = parseImportDateDetailed(
    cell(new Date(2026, 4, 16), '16-maj'),
    { sheetName: 'Sezon 2026' },
  )
  assertEq(result.date, '2026-05-16', 'date from raw Date')
})

run('missing year uses raw serial before sheet name', () => {
  const serial = 45824
  const result = parseImportDateDetailed(cell(serial, '16-maj'))
  assert(result.date !== null, 'serial parsed')
  assert(result.date !== FROZEN_TODAY, 'not today')
})

run('missing year without raw uses sheet name', () => {
  const result = parseImportDateDetailed(cell('16-maj', '16-maj'), {
    sheetName: 'Sezon 2026',
  })
  assertEq(result.date, '2026-05-16', 'sheet year applied')
})

run('missing year without any source fails safely', () => {
  const result = parseImportDateDetailed(cell('16-maj', '16-maj'))
  assertEq(result.date, null, 'no date')
  assertEq(result.issueCode, 'IMPORT_DATE_YEAR_MISSING', 'issue')
})

run('today fallback regression', () => {
  const invalid = [
    '16-xyz',
    'abc',
    null,
    undefined,
    cell('16-xyz', '16-xyz'),
  ]
  for (const value of invalid) {
    const parsed = parseImportDate(value, { sheetName: 'Sezon 2026' })
    assert(parsed == null || parsed !== FROZEN_TODAY, `must not be today: ${String(value)}`)
  }
})

run('prefers raw Date over formatted Numbers text', () => {
  const parsed = parseImportDateDetailed(
    cell(new Date(2026, 6, 3), '3-lip'),
  )
  assertEq(parsed.date, '2026-07-03', 'july from raw')
})

run('timezone regression for Date cells', () => {
  const utcDate = new Date('2026-05-15T22:00:00.000Z')
  assertEq(parseImportDate(utcDate), '2026-05-16', 'local calendar day preserved')
})

run('excel serial April through July', () => {
  const serials = [45820, 45824, 45839, 45854]
  for (const serial of serials) {
    const parsed = parseImportDate(serial)
    assert(parsed != null, `serial ${serial}`)
    assert(parsed !== FROZEN_TODAY, `serial ${serial} not today`)
  }
})

run('US short formatted date from Numbers export', () => {
  const result = parseImportDateDetailed(cell('', '4/11/26'))
  assertEq(result.date, '2026-04-11', 'm/d/yy formatted')
})

run('end-to-end Numbers-like workbook fixture', () => {
  const rows: SpreadsheetCellValue[][] = [
    [
      cell('Data'),
      cell('Nazwisko'),
      cell('wartosc umowy'),
    ],
    [cell(new Date(2026, 3, 11), '11-kwi'), cell('Chiara Czestochowa'), cell(8550)],
    [cell(new Date(2026, 3, 12), '12-kwi'), cell('Jakub Wiecha'), cell(7550)],
    [cell(new Date(2026, 4, 16), '16-maj'), cell('Monika Węgrzyn'), cell(7900)],
    [cell(new Date(2026, 4, 23), '23-maj'), cell('Gdansk'), cell(11300)],
    [cell(new Date(2026, 5, 3), '3-cze'), cell('Dominika Oświęcimska'), cell(5000)],
    [cell(new Date(2026, 5, 4), '4-cze'), cell('Marta Mezibrocka'), cell(9150)],
    [cell(new Date(2026, 5, 13), '13-cze'), cell('Oskar Soliński'), cell(8400)],
    [cell(new Date(2026, 6, 3), '3-lip'), cell('Malwina Siekaniec'), cell(7100)],
  ]

  const detection = detectHeaderRow(matrixToRows(rows))
  const raw = buildRawRows({
    rows: matrixToRows(rows),
    headerRowIndexZeroBased: detection.headerRowIndexZeroBased,
    headers: detection.headers,
    columnIds: detection.columnIds,
  })
  const mappings = [
    { sourceColumnId: 'col-0', sourceHeader: 'Data', targetField: 'weddingDate' as const },
    { sourceColumnId: 'col-1', sourceHeader: 'Nazwisko', targetField: 'coupleDisplayName' as const },
    { sourceColumnId: 'col-2', sourceHeader: 'wartosc umowy', targetField: 'contractValue' as const },
  ]
  const review = buildReviewRows({
    rows: raw,
    mappings,
    existingWeddings: [],
    catalog: [],
    sheetName: 'Sezon 2026',
  })

  assertEq(review.length, 8, 'row count')
  assertEq(review[0]!.weddingDate, '2026-04-11', 'apr 11')
  assertEq(review[2]!.weddingDate, '2026-05-16', 'may 16')
  assertEq(review[4]!.weddingDate, '2026-06-03', 'jun 3')
  assertEq(review[7]!.weddingDate, '2026-07-03', 'jul 3')
  assert(
    review.every((row) => row.weddingDate !== FROZEN_TODAY),
    'no today fallback',
  )
  assertEq(review[2]!.coupleDisplayName, 'Monika Węgrzyn', 'name preserved')
  assertEq(review[2]!.contractValue, 7900, 'price preserved')
})

run('written XLSX with Numbers-like cells', () => {
  const wb = XLSX.utils.book_new()
  const ws: XLSX.WorkSheet = {}
  const entries: Array<[string, SpreadsheetCellValue]> = [
    ['A1', cell('Data')],
    ['B1', cell('Nazwisko')],
    ['C1', cell('wartosc umowy')],
    ['A2', cell(new Date(2026, 3, 11), '11-kwi')],
    ['B2', cell('Chiara Czestochowa')],
    ['C2', cell(8550)],
    ['A3', cell(new Date(2026, 4, 16), '16-maj')],
    ['B3', cell('Monika Węgrzyn')],
    ['C3', cell(7900)],
    ['A4', cell(new Date(2026, 6, 3), '3-lip')],
    ['B4', cell('Malwina Siekaniec')],
    ['C4', cell(7100)],
  ]
  for (const [addr, value] of entries) {
    if (value.raw instanceof Date) {
      ws[addr] = { t: 'd', v: value.raw, w: value.formatted }
    } else if (typeof value.raw === 'number') {
      ws[addr] = { t: 'n', v: value.raw }
    } else {
      ws[addr] = { t: 's', v: String(value.raw) }
    }
  }
  ws['!ref'] = 'A1:C4'
  XLSX.utils.book_append_sheet(wb, ws, 'Sezon 2026')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const wb2 = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sheet = wb2.Sheets['Sezon 2026']!
  for (const addr of ['A2', 'A3', 'A4']) {
    const c = sheet[addr]!
    const parsed = parseImportDateDetailed({
      raw: c.v,
      formatted: c.w,
      cellType: c.t,
    })
    assert(parsed.date != null, `${addr} parsed`)
    assert(parsed.date !== FROZEN_TODAY, `${addr} not today`)
  }
})

console.log('\nWedding import date tests finished.')
