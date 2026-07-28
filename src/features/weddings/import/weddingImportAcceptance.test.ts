/**
 * Wedding spreadsheet import acceptance tests.
 * Run: npm run test:wedding-import
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as XLSX from 'xlsx'
import {
  buildReviewRows,
  revalidateReviewRow,
  reviewRowToCreateInput,
} from '@/features/weddings/import/buildReviewRows'
import {
  detectHeaderRow,
  buildRawRows,
} from '@/features/weddings/import/detectHeaderRow'
import {
  suggestColumnMappings,
  validateColumnMappings,
} from '@/features/weddings/import/columnMapping'
import { parseImportDate } from '@/features/weddings/import/parseDates'
import { parseImportMoney } from '@/features/weddings/import/parseMoney'
import {
  parseCoupleDisplayName,
  partner2ForCreate,
} from '@/features/weddings/import/parseNames'
import { detectDuplicateCandidates } from '@/features/weddings/import/detectDuplicates'
import { isLikelySummaryRow } from '@/features/weddings/import/detectSummaryRows'
import { matchPackageByName } from '@/features/weddings/import/packageMatch'
import type {
  ColumnMapping,
  RawImportRow,
  SpreadsheetMatrixRow,
} from '@/features/weddings/import/types'

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

function matrixToRows(matrix: unknown[][]): SpreadsheetMatrixRow[] {
  return matrix.map((row, index) => ({
    sheetRowIndexZeroBased: index,
    cells: row.map((value) => ({
      raw: value,
      formatted: typeof value === 'string' ? value : undefined,
    })),
  }))
}

function sheetRows(matrix: unknown[][]): RawImportRow[] {
  const asRows = matrixToRows(matrix)
  const detection = detectHeaderRow(asRows)
  return buildRawRows({
    rows: asRows,
    headerRowIndexZeroBased: detection.headerRowIndexZeroBased,
    headers: detection.headers,
    columnIds: detection.columnIds,
  })
}

const mappingsFromHeaders = (headers: string[]): ColumnMapping[] =>
  suggestColumnMappings({
    headers,
    columnIds: headers.map((_, i) => `col-${i}`),
  })

run('date: DD.MM.YYYY and excel serial', () => {
  assertEq(parseImportDate('12.06.2027'), '2027-06-12', 'dotted')
  assertEq(parseImportDate('3.4.2027'), '2027-04-03', 'short dotted')
  const serial = parseImportDate(45820)
  assert(serial != null, 'serial parsed')
  assertEq(parseImportDate('31.02.2027'), null, 'invalid')
})

run('money: Polish formats', () => {
  assertEq(parseImportMoney(5000), 5000, 'numeric')
  assertEq(parseImportMoney('5 000'), 5000, 'spaced')
  assertEq(parseImportMoney('5 000 zł'), 5000, 'zł')
  assertEq(parseImportMoney('5.000,00'), 5000, 'decimal comma')
  assertEq(parseImportMoney('5 000,00 PLN'), 5000, 'pln')
  assertEq(parseImportMoney('-100'), null, 'negative')
})

run('names: split and single client', () => {
  const both = parseCoupleDisplayName('Anna Kowalska i Piotr Nowak')
  assertEq(both?.partner1Name, 'Anna Kowalska', 'p1')
  assertEq(both?.partner2Name, 'Piotr Nowak', 'p2')
  const single = parseCoupleDisplayName('Piotr Nowak')
  assertEq(single?.partner1Name, 'Piotr Nowak', 'single')
  assertEq(partner2ForCreate(''), '—', 'placeholder')
})

run('header detection skips title row', () => {
  const rows = [
    ['Lista ślubów 2027'],
    [],
    ['Termin', 'Młodzi', 'Cena', 'Telefon', 'Uwagi'],
    ['12.06.2027', 'Anna Kowalska i Piotr Nowak', '8 500 zł', '500 600 700', 'Kościół'],
  ]
  const detection = detectHeaderRow(matrixToRows(rows))
  assertEq(detection.headerRowIndexZeroBased, 2, 'header row')
  const mapped = mappingsFromHeaders(detection.headers)
  assert(
    mapped.some((m) => m.targetField === 'weddingDate'),
    'date mapped',
  )
  assert(
    mapped.some((m) => m.targetField === 'coupleDisplayName'),
    'couple mapped',
  )
})

run('column mapping validation', () => {
  const ok = mappingsFromHeaders(['Termin', 'Młodzi', 'Cena'])
  assertEq(validateColumnMappings(ok), null, 'valid')
  const bad = mappingsFromHeaders(['Telefon'])
  assert(validateColumnMappings(bad) !== null, 'missing required')
})

run('scenario A: typical Polish excel row', () => {
  const rows = [
    ['Termin', 'Młodzi', 'Cena', 'Telefon', 'Uwagi'],
    ['12.06.2027', 'Anna Kowalska i Piotr Nowak', '8 500 zł', '500 600 700', 'Kościół w Gliwicach'],
    ['19.06.2027', 'Marta i Adam', '6500', '', 'Brak pakietu'],
  ]
  const raw = sheetRows(rows)
  const mappings = mappingsFromHeaders(['Termin', 'Młodzi', 'Cena', 'Telefon', 'Uwagi'])
  const review = buildReviewRows({
    rows: raw,
    mappings,
    existingWeddings: [],
    catalog: [],
    sheetName: 'Sezon 2026',
  })
  assertEq(review.length, 2, 'two rows')
  assertEq(review[0]!.weddingDate, '2027-06-12', 'date1')
  assertEq(review[0]!.contractValue, 8500, 'value1')
  assert(review[0]!.coupleDisplayName.includes('Anna'), 'name1')
})

run('summary row flagged', () => {
  assert(
    isLikelySummaryRow({
      coupleDisplayName: 'Razem',
      weddingDate: null,
      contractValue: 12000,
    }),
    'summary',
  )
})

run('duplicate detection', () => {
  const dupes = detectDuplicateCandidates({
    weddingDate: '2027-06-12',
    coupleDisplayName: 'Anna Kowalska i Piotr Nowak',
    partner1Name: 'Anna Kowalska',
    partner2Name: 'Piotr Nowak',
    contractValue: 8500,
    existingWeddings: [
      {
        id: 'w1',
        date: '2027-06-12',
        price: 8500,
        couple: {
          partner1: 'Anna Kowalska',
          partner2: 'Piotr Nowak',
          email: '',
          phone: '',
          venue: '',
          city: '',
        },
      } as never,
    ],
  })
  assert(dupes.length > 0, 'duplicate found')
})

run('package exact match only', () => {
  const exact = matchPackageByName('Pakiet Premium', [
    { id: 'p1', name: 'Pakiet Premium' },
    { id: 'p2', name: 'Pakiet Standard' },
  ])
  assert(exact.exact, 'exact')
  assertEq(exact.packageId, 'p1', 'id')
  const fuzzy = matchPackageByName('Premium', [
    { id: 'p1', name: 'Pakiet Premium' },
  ])
  assert(!fuzzy.exact, 'no fuzzy auto')
})

run('CSV semicolon parsing via xlsx', () => {
  const csv = 'Termin;Młodzi;Cena\n12.06.2027;Anna i Jan;6500'
  const wb = XLSX.read(csv, { type: 'string', FS: ';' })
  const sheet = wb.Sheets[wb.SheetNames[0]!]!
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  const raw = sheetRows(matrix as unknown[][])
  assertEq(raw.length, 1, 'one data row')
})

run('review revalidation after edit', () => {
  const row = buildReviewRows({
    rows: [
      {
        sourceRowNumber: 2,
        values: {
          col0: { raw: '12.06.2027' },
          col1: { raw: 'Anna i Jan' },
          col2: { raw: '5000' },
        },
      },
    ],
    mappings: [
      { sourceColumnId: 'col0', sourceHeader: 'Termin', targetField: 'weddingDate' },
      { sourceColumnId: 'col1', sourceHeader: 'Młodzi', targetField: 'coupleDisplayName' },
      { sourceColumnId: 'col2', sourceHeader: 'Cena', targetField: 'contractValue' },
    ],
    existingWeddings: [],
    catalog: [],
  })[0]!
  const next = revalidateReviewRow(
    { ...row, weddingDate: null },
    [],
    [],
  )
  assertEq(next.status, 'invalid', 'invalid after clearing date')
})

run('UI wiring', () => {
  const page = readFileSync(resolve('src/pages/WeddingsPage.tsx'), 'utf8')
  const router = readFileSync(resolve('src/routes/router.tsx'), 'utf8')
  const importPage = readFileSync(resolve('src/pages/WeddingImportPage.tsx'), 'utf8')
  assert(page.includes('Importuj z pliku'), 'entry button')
  assert(router.includes('/sluby/import'), 'route')
  assert(importPage.includes('executeWeddingImport'), 'batch import')
  assert(importPage.includes('Sprawdź dane'), 'review step')
})

run('import service uses creation source', () => {
  const service = readFileSync(resolve('src/lib/api/weddingService.ts'), 'utf8')
  const build = readFileSync(
    resolve('src/features/weddings/import/buildReviewRows.ts'),
    'utf8',
  )
  assert(service.includes('spreadsheet_import'), 'timeline source')
  assert(build.includes('preserveImportedPrice'), 'preserve price')
  assert(build.includes('displayName'), 'stores presentation title')
})

run('review create input keeps imported presentation title', () => {
  const input = reviewRowToCreateInput({
    id: 'row-2',
    sourceRowNumber: 2,
    weddingDate: '2026-04-11',
    coupleDisplayName: 'Jakub Wiecha',
    partner1Name: 'Jakub Wiecha',
    partner2Name: '',
    contractValue: 7550,
    status: 'ready',
    issues: [],
    duplicateCandidates: [],
    selectedForImport: true,
  })
  assertEq(input.displayName, 'Jakub Wiecha', 'displayName')
  assertEq(input.partner1, 'Jakub Wiecha', 'partner1')
  assertEq(input.partner2, '—', 'partner2 placeholder for DB')
})

console.log('\nWedding import tests finished.')
