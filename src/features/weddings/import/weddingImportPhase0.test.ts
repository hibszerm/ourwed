/**
 * Wedding import Phase 0 correctness tests.
 * Round-trips go through parseImportWorkbook, not only utilities.
 * Run: npm run test:wedding-import-phase0
 */

import * as XLSXNamespace from 'xlsx'
import type { WorkBook, WorkSheet } from 'xlsx'

const XLSX =
  (XLSXNamespace as { default?: typeof XLSXNamespace }).default ?? XLSXNamespace
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildReviewRows,
  reviewRowToCreateInput,
} from '@/features/weddings/import/buildReviewRows'
import { detectAndApplyHeaderRow } from '@/features/weddings/import/importPipeline'
import {
  MAX_IMPORT_FILE_BYTES,
  parseImportWorkbook,
  validateImportFile,
} from '@/features/weddings/import/parseSpreadsheet'
import {
  parseImportDate,
} from '@/features/weddings/import/parseDates'
import { parseImportMoney } from '@/features/weddings/import/parseMoney'
import { detectDuplicateCandidates } from '@/features/weddings/import/detectDuplicates'
import { matchPackageByName } from '@/features/weddings/import/packageMatch'
import {
  executeWeddingImport,
  isWritableImportRow,
} from '@/features/weddings/import/weddingImportService'
import type {
  ParsedWorkbookSheet,
  WeddingImportReviewRow,
} from '@/features/weddings/import/types'
import type { Wedding } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`PASS  ${name}`),
    (err) => {
      console.error(`FAIL  ${name}`)
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    },
  )
}

class FakeFile {
  name: string
  private buffer: Uint8Array

  constructor(name: string, contents: string | Uint8Array) {
    this.name = name
    this.buffer =
      typeof contents === 'string' ? new TextEncoder().encode(contents) : contents
  }

  get size() {
    return this.buffer.byteLength
  }

  async arrayBuffer() {
    return this.buffer.buffer.slice(
      this.buffer.byteOffset,
      this.buffer.byteOffset + this.buffer.byteLength,
    )
  }
}

function asFile(file: FakeFile): File {
  return file as unknown as File
}

function excelSerialFor(year: number, month: number, day: number): number {
  for (let serial = 1; serial < 80000; serial += 1) {
    const parts = XLSX.SSF.parse_date_code(serial)
    if (parts && parts.y === year && parts.m === month && parts.d === day) {
      return serial
    }
  }
  throw new Error(`No Excel serial for ${year}-${month}-${day}`)
}

function xlsxFile(
  name: string,
  build: (wb: WorkBook) => void,
): FakeFile {
  const wb = XLSX.utils.book_new()
  build(wb)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new FakeFile(name, new Uint8Array(buf))
}

async function reviewFromWorkbook(
  file: FakeFile,
  sheetName?: string,
  existingWeddings: Wedding[] = [],
  catalog: { id: string; name: string }[] = [],
) {
  const parsed = await parseImportWorkbook(asFile(file))
  const sheet: ParsedWorkbookSheet =
    (sheetName ? parsed.sheets.find((s) => s.name === sheetName) : parsed.sheets[0]) ??
    parsed.sheets[0]!
  const applied = detectAndApplyHeaderRow({ sheet, savedMappings: null })
  const rows = buildReviewRows({
    rows: applied.rawRows,
    mappings: applied.mappings,
    existingWeddings,
    catalog,
    sheetName: sheet.name,
    date1904: sheet.date1904,
    confirmedHeaderRowIndexZeroBased: applied.confirmedHeaderRowIndexZeroBased,
  })
  return { parsed, sheet, applied, rows }
}

function stubWedding(input: {
  id: string
  date: string
  partner1: string
  partner2: string
  email?: string
  phone?: string
  price?: number
}): Wedding {
  return {
    id: input.id,
    date: input.date,
    price: input.price ?? 0,
    couple: {
      partner1: input.partner1,
      partner2: input.partner2,
      email: input.email ?? '',
      phone: input.phone ?? '',
      venue: '',
      city: '',
    },
  } as Wedding
}

function readyRow(
  patch: Partial<WeddingImportReviewRow> & Pick<WeddingImportReviewRow, 'id' | 'sourceRowNumber'>,
): WeddingImportReviewRow {
  return {
    weddingDate: '2027-06-12',
    coupleDisplayName: 'Anna i Michał',
    partner1Name: 'Anna',
    partner2Name: 'Michał',
    contractValue: 10500,
    priceState: 'value',
    status: 'ready',
    issues: [],
    duplicateCandidates: [],
    selectedForImport: true,
    ...patch,
  }
}

async function main() {
  await run('A. CSV DD.MM.YYYY round-trip via parseImportWorkbook', async () => {
    const { rows } = await reviewFromWorkbook(
      new FakeFile(
        'daty.csv',
        'Data;Para\n12.06.2027;Anna i Michał\n01.07.2027;Julia i Adam\n06.12.2027;Ola i Kamil\n19.06.2027;Ewa i Piotr\n',
      ),
    )
    assertEq(rows.length, 4, 'row count')
    assertEq(rows[0]!.weddingDate, '2027-06-12', '12.06.2027')
    assertEq(rows[1]!.weddingDate, '2027-07-01', '01.07.2027')
    assertEq(rows[2]!.weddingDate, '2027-12-06', '06.12.2027')
    assertEq(rows[3]!.weddingDate, '2027-06-19', '19.06.2027')
  })

  await run('B. CSV DD/MM/YYYY round-trip', async () => {
    const { rows } = await reviewFromWorkbook(
      new FakeFile(
        'slash.csv',
        'Data,Para\n12/06/2027,Anna i Michał\n01/07/2027,Julia i Adam\n',
      ),
    )
    assertEq(rows[0]!.weddingDate, '2027-06-12', '12/06/2027')
    assertEq(rows[1]!.weddingDate, '2027-07-01', '01/07/2027')
  })

  await run('C/D. true Excel date cell + serial', async () => {
    const serial = excelSerialFor(2027, 6, 12)
    const file = xlsxFile('dates.xlsx', (wb) => {
      const ws: WorkSheet = {}
      ws['A1'] = { t: 's', v: 'Data' }
      ws['B1'] = { t: 's', v: 'Para' }
      ws['A2'] = { t: 'd', v: new Date(2027, 5, 12) }
      ws['B2'] = { t: 's', v: 'Anna i Michał' }
      ws['A3'] = { t: 'n', v: serial, z: 'DD.MM.YYYY' }
      ws['B3'] = { t: 's', v: 'Julia i Adam' }
      ws['A4'] = { t: 's', v: '06.12.2027' }
      ws['B4'] = { t: 's', v: 'Ola i Kamil' }
      ws['!ref'] = 'A1:B4'
      XLSX.utils.book_append_sheet(wb, ws, 'Sezon 2027')
    })
    const { rows } = await reviewFromWorkbook(file)
    assertEq(rows[0]!.weddingDate, '2027-06-12', 'true Date cell')
    assertEq(rows[1]!.weddingDate, '2027-06-12', 'excel serial')
    assertEq(rows[2]!.weddingDate, '2027-12-06', 'string DD.MM.YYYY')
  })

  await run('E. Polish month-name date + sheet year', async () => {
    const { rows } = await reviewFromWorkbook(
      new FakeFile('miesiac.csv', 'Data;Para\n16-cze;Anna i Michał\n'),
    )
    assertEq(rows[0]!.weddingDate, null, 'year missing without sheet name')

    const file = xlsxFile('sezon.xlsx', (wb) => {
      const ws: WorkSheet = {}
      ws['A1'] = { t: 's', v: 'Data' }
      ws['B1'] = { t: 's', v: 'Para' }
      ws['A2'] = { t: 's', v: '16-cze' }
      ws['B2'] = { t: 's', v: 'Anna i Michał' }
      ws['!ref'] = 'A1:B2'
      XLSX.utils.book_append_sheet(wb, ws, 'Sezon 2027')
    })
    const { rows: seasonal } = await reviewFromWorkbook(file)
    assertEq(seasonal[0]!.weddingDate, '2027-06-16', 'sheet year 2027')
  })

  await run('F. invalid leap day stays invalid', async () => {
    const { rows } = await reviewFromWorkbook(
      new FakeFile(
        'leap.csv',
        'Data;Para\n31.02.2027;Anna i Michał\n29.02.2027;Julia i Adam\n29.02.2028;Ola i Kamil\n',
      ),
    )
    assertEq(rows[0]!.weddingDate, null, '31.02.2027')
    assert(rows[0]!.issues.some((i) => i.code === 'IMPORT_DATE_PARSE_FAILED'), 'invalid date code')
    assertEq(rows[1]!.weddingDate, null, '29.02.2027')
    assertEq(rows[2]!.weddingDate, '2028-02-29', '29.02.2028 leap')
  })

  await run('G. no UTC shift on date-only values', async () => {
    const local = new Date(2027, 5, 12, 0, 0, 0)
    const expectedLocal = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    assertEq(parseImportDate(local), expectedLocal, 'local midnight uses calendar components')
    const utcEvening = new Date(Date.UTC(2027, 5, 11, 22, 0, 0))
    const expectedEvening = `${utcEvening.getFullYear()}-${String(utcEvening.getMonth() + 1).padStart(2, '0')}-${String(utcEvening.getDate()).padStart(2, '0')}`
    assertEq(parseImportDate(utcEvening), expectedEvening, 'uses local calendar day, not UTC')
    const dateSrc = readFileSync(
      resolve('src/features/weddings/import/parseDates.ts'),
      'utf8',
    )
    assert(!dateSrc.includes('toISOString().slice(0, 10)'), 'no toISOString date-only conversion')
    assert(dateSrc.includes('date.getFullYear()'), 'local year')
    assertEq(
      parseImportDate({ raw: utcEvening, formatted: '12.06.2027' }),
      '2027-06-12',
      'dotted text wins over coerced Date',
    )
  })

  await run('H-N. Polish money rules', () => {
    assertEq(parseImportMoney('10500'), 10500, '10500')
    assertEq(parseImportMoney('10500.00'), 10500, '10500.00')
    assertEq(parseImportMoney('10500,00'), 10500, '10500,00')
    assertEq(parseImportMoney('10 500'), 10500, '10 500')
    assertEq(parseImportMoney('10 500 zł'), 10500, '10 500 zł')
    assertEq(parseImportMoney('10.500'), 10500, '10.500 thousands')
    assertEq(parseImportMoney('10.500,00'), 10500, '10.500,00')
    assertEq(parseImportMoney('10,500.00'), 10500, 'EN grouping')
    assertEq(parseImportMoney('5.000'), 5000, '5.000')
    assertEq(parseImportMoney('5,5'), 5.5, '5,5')
    assertEq(parseImportMoney('10.50'), 10.5, '10.50 decimal')
    assertEq(parseImportMoney('abc zł'), null, 'malformed')
    assertEq(parseImportMoney('0'), 0, 'explicit 0')
    assertEq(parseImportMoney('-100'), null, 'negative')
    assertEq(parseImportMoney('10000001'), null, 'over max')
  })

  await run('H-K via CSV workbook', async () => {
    const { rows } = await reviewFromWorkbook(
      new FakeFile(
        'kwoty.csv',
        'Data;Para;Cena\n12.06.2027;Anna i Michał;10.500\n01.07.2027;Julia i Adam;10.50\n06.12.2027;Ola i Kamil;10.500,00\n19.06.2027;Ewa i Piotr;10 500 zł\n',
      ),
    )
    assertEq(rows[0]!.contractValue, 10500, '10.500')
    assertEq(rows[1]!.contractValue, 10.5, '10.50')
    assertEq(rows[2]!.contractValue, 10500, '10.500,00')
    assertEq(rows[3]!.contractValue, 10500, '10 500 zł')
  })

  await run('O-S. within-file and DB duplicates', async () => {
    const { rows } = await reviewFromWorkbook(
      new FakeFile(
        'dupes.csv',
        [
          'Data;Para;E-mail;Telefon',
          '12.06.2027;Anna Kowalska i Michał Nowak;a@example.com;500600700',
          '19.06.2027;Anna Kowalska i Michał Nowak;b@example.com;111111111',
          '12.06.2027;Inna Para;c@example.com;222222222',
          '01.07.2027;Kasia i Tomek;shared@example.com;333333333',
          '02.07.2027;Ola i Kamil;shared@example.com;444444444',
          '03.07.2027;Ewa i Piotr;d@example.com;500600700',
          '12.06.2027;anna kowalska I MICHAŁ NOWAK;e@example.com;555555555',
        ].join('\n'),
      ),
    )
    const first = rows.find((r) => r.sourceRowNumber === 2)!
    const laterSameIdentity = rows.find((r) => r.sourceRowNumber === 8)!
    const sameNamesDifferentDate = rows.find((r) => r.sourceRowNumber === 3)!
    const sameDateDifferentCouple = rows.find((r) => r.sourceRowNumber === 4)!
    const emailSecond = rows.find((r) => r.sourceRowNumber === 6)!
    const phoneSecond = rows.find((r) => r.sourceRowNumber === 7)!

    assert(!first.issues.some((i) => i.code === 'DUPLICATE_IN_FILE'), 'first occurrence importable')
    assert(first.selectedForImport, 'first selected')
    assert(
      laterSameIdentity.issues.some((i) => i.code === 'DUPLICATE_IN_FILE'),
      'case/diacritic in-file duplicate',
    )
    assertEq(laterSameIdentity.selectedForImport, false, 'later unchecked')
    assert(
      !sameNamesDifferentDate.issues.some((i) => i.code === 'DUPLICATE_IN_FILE'),
      'same names different date is not identity duplicate',
    )
    assert(
      !sameDateDifferentCouple.issues.some((i) => i.code === 'DUPLICATE_IN_FILE'),
      'same date different couple is not a duplicate',
    )
    assert(emailSecond.issues.some((i) => i.code === 'DUPLICATE_IN_FILE'), 'same email')
    assert(phoneSecond.issues.some((i) => i.code === 'DUPLICATE_IN_FILE'), 'same phone')

    const existing = [
      stubWedding({
        id: 'db-1',
        date: '2027-06-12',
        partner1: 'Anna Kowalska',
        partner2: 'Michał Nowak',
      }),
    ]
    const { rows: mixed } = await reviewFromWorkbook(
      new FakeFile(
        'both.csv',
        'Data;Para\n12.06.2027;Anna Kowalska i Michał Nowak\n12.06.2027;anna kowalska I MICHAŁ NOWAK\n',
      ),
      undefined,
      existing,
    )
    assert(
      mixed[0]!.issues.some((i) => i.code === 'DUPLICATE_EXISTING_WEDDING'),
      'DB duplicate on first row',
    )
    assert(
      mixed[1]!.issues.some((i) => i.code === 'DUPLICATE_EXISTING_WEDDING'),
      'DB duplicate on later row',
    )
    assert(
      mixed[1]!.issues.some((i) => i.code === 'DUPLICATE_IN_FILE'),
      'in-file duplicate coexists',
    )
    assert(
      mixed[1]!.duplicateCandidates.some((c) => c.source === 'existing_wedding') &&
        mixed[1]!.duplicateCandidates.some((c) => c.source === 'in_file'),
      'both candidate sources',
    )
  })

  await run('T-W. price states and write guard', async () => {
    const unmapped = await reviewFromWorkbook(
      new FakeFile('noprice.csv', 'Data;Para\n12.06.2027;Anna i Michał\n'),
    )
    assertEq(unmapped.rows[0]!.priceState, 'unmapped', 'unmapped')
    assert(
      unmapped.rows[0]!.issues.some((i) => i.code === 'MISSING_CONTRACT_VALUE'),
      'unmapped warning',
    )
    assertEq(unmapped.rows[0]!.status, 'warning', 'warning not error')
    assertEq(reviewRowToCreateInput(unmapped.rows[0]!).price, 0, 'persists 0')

    const empty = await reviewFromWorkbook(
      new FakeFile('emptyprice.csv', 'Data;Para;Cena\n12.06.2027;Anna i Michał;\n'),
    )
    assertEq(empty.rows[0]!.priceState, 'empty', 'empty mapped')
    assert(empty.rows[0]!.issues.some((i) => i.code === 'MISSING_CONTRACT_VALUE'), 'empty warning')

    const invalid = await reviewFromWorkbook(
      new FakeFile('badprice.csv', 'Data;Para;Cena\n12.06.2027;Anna i Michał;abc zł\n'),
    )
    assertEq(invalid.rows[0]!.priceState, 'invalid', 'invalid')
    assert(invalid.rows[0]!.issues.some((i) => i.code === 'INVALID_CONTRACT_VALUE'), 'hard error')
    assertEq(invalid.rows[0]!.status, 'invalid', 'invalid status')
    assertEq(invalid.rows[0]!.selectedForImport, false, 'not selected')

    const zero = await reviewFromWorkbook(
      new FakeFile('zero.csv', 'Data;Para;Cena\n12.06.2027;Anna i Michał;0\n'),
    )
    assertEq(zero.rows[0]!.priceState, 'explicit_zero', 'explicit zero')
    assert(!zero.rows[0]!.issues.some((i) => i.field === 'contractValue'), 'zero is not a parse failure')

    let createCalls = 0
    const forcedInvalidDate = readyRow({
      id: 'row-bad-date',
      sourceRowNumber: 2,
      weddingDate: null,
      selectedForImport: true,
      status: 'ready',
      issues: [
        {
          code: 'IMPORT_DATE_PARSE_FAILED',
          field: 'weddingDate',
          severity: 'error',
          message: 'bad date',
        },
      ],
    })
    const forcedInvalidAmount = readyRow({
      id: 'row-bad-amount',
      sourceRowNumber: 3,
      contractValue: null,
      priceState: 'invalid',
      selectedForImport: true,
      status: 'ready',
      issues: [
        {
          code: 'INVALID_CONTRACT_VALUE',
          field: 'contractValue',
          severity: 'error',
          message: 'bad amount',
        },
      ],
    })
    assertEq(isWritableImportRow(forcedInvalidDate), false, 'invalid date not writable')
    assertEq(isWritableImportRow(forcedInvalidAmount), false, 'invalid amount not writable')

    await executeWeddingImport({
      importSessionId: 's1',
      rows: [forcedInvalidDate, forcedInvalidAmount],
      createWedding: async () => {
        createCalls += 1
        return { id: 'should-not-run' }
      },
    })
    assertEq(createCalls, 0, 'hard-error rows never call create')
  })

  await run('X-Y. partial success retry only remaining failures', async () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      readyRow({
        id: `row-${index + 2}`,
        sourceRowNumber: index + 2,
        coupleDisplayName: `Para ${index + 1}`,
        partner1Name: `Para ${index + 1}`,
      }),
    )
    const importedRowIds = new Set<string>()
    const created: string[] = []
    const createWedding = async (input: { partner1: string }) => {
      created.push(input.partner1)
      if (input.partner1 === 'Para 8' || input.partner1 === 'Para 9' || input.partner1 === 'Para 10') {
        throw new Error(`fail ${input.partner1}`)
      }
      return { id: `w-${input.partner1}` }
    }

    const first = await executeWeddingImport({
      importSessionId: 'retry',
      rows,
      importedRowIds,
      createWedding,
    })
    assertEq(first.importedCount, 7, '7 success')
    assertEq(first.failedCount, 3, '3 fail')
    for (const record of first.records) {
      if (record.status === 'imported') importedRowIds.add(record.reviewRowId)
    }
    created.length = 0
    const second = await executeWeddingImport({
      importSessionId: 'retry',
      rows,
      importedRowIds,
      createWedding,
    })
    assertEq(created.length, 3, 'retry only 3 create calls')
    assertEq(second.importedCount, 0, 'still failing')
    assertEq(second.failedCount, 3, 'same three fail')
  })

  await run('reload is duplicate-protected, not idempotent', async () => {
    const existing = [
      stubWedding({
        id: 'already',
        date: '2027-06-12',
        partner1: 'Anna',
        partner2: 'Michał',
      }),
    ]
    const { rows } = await reviewFromWorkbook(
      new FakeFile('reload.csv', 'Data;Para\n12.06.2027;Anna i Michał\n'),
      undefined,
      existing,
    )
    assert(
      rows[0]!.issues.some((i) => i.code === 'DUPLICATE_EXISTING_WEDDING'),
      're-upload matches DB',
    )
    assertEq(rows[0]!.selectedForImport, false, 'defaults to skipped')
  })

  await run('Z-AC. package matching and commercial import flags', async () => {
    const exact = matchPackageByName('Pakiet Premium', [
      { id: 'p1', name: 'Pakiet Premium' },
    ])
    assert(exact.exact && exact.packageId === 'p1', 'exact match preserved')
    const unmatched = matchPackageByName('Premium Gold', [
      { id: 'p1', name: 'Pakiet Premium' },
    ])
    assert(!unmatched.exact, 'no fuzzy')

    const { rows } = await reviewFromWorkbook(
      new FakeFile(
        'pakiet.csv',
        'Data;Para;Cena;Pakiet\n12.06.2027;Anna i Michał;12000;Pakiet Premium\n01.07.2027;Julia i Adam;8000;Nieistniejący\n',
      ),
      undefined,
      [],
      [{ id: 'p1', name: 'Pakiet Premium' }],
    )
    assertEq(rows[0]!.matchedPackageId, 'p1', 'exact package id')
    assertEq(rows[0]!.contractValue, 12000, 'spreadsheet price wins')
    const createInput = reviewRowToCreateInput(rows[0]!)
    assertEq(createInput.price, 12000, 'imported price')
    assertEq(createInput.creationOptions?.preserveImportedPrice, true, 'preserveImportedPrice')
    assertEq(createInput.depositPaid, false, 'no deposit payment from import')
    assertEq(rows[1]!.matchedPackageId, undefined, 'unmatched id null')
    assert(
      (rows[1]!.note ?? '').includes('Pakiet z importu: Nieistniejący'),
      'unmatched text in note',
    )
    assert(rows[1]!.issues.some((i) => i.code === 'PACKAGE_NOT_MATCHED'), 'unmatched warning')
  })

  await run('parser safety regressions', async () => {
    assertEq(
      validateImportFile({ name: 'a.xlsx', size: 0 } as File),
      'Wybrany plik jest pusty.',
      'empty file',
    )
    assert(
      validateImportFile({ name: 'a.xlsx', size: MAX_IMPORT_FILE_BYTES + 1 } as File)?.includes('10 MB') ===
        true,
      '10MB cap',
    )
    const bom = await reviewFromWorkbook(
      new FakeFile('bom.csv', '\uFEFFData;Para\n12.06.2027;Anna i Michał\n'),
    )
    assertEq(bom.rows[0]!.weddingDate, '2027-06-12', 'BOM stripped')

    const twoSheets = xlsxFile('sheets.xlsx', (wb) => {
      const first = XLSX.utils.aoa_to_sheet([
        ['Data', 'Para'],
        ['12.06.2027', 'Anna i Michał'],
      ])
      const second = XLSX.utils.aoa_to_sheet([
        ['Data', 'Para'],
        ['01.07.2027', 'Julia i Adam'],
      ])
      XLSX.utils.book_append_sheet(wb, first, 'Pierwszy')
      XLSX.utils.book_append_sheet(wb, second, 'Drugi')
    })
    const parsed = await parseImportWorkbook(asFile(twoSheets))
    assertEq(parsed.sheets[0]!.name, 'Pierwszy', 'first sheet default')
    const secondReview = await reviewFromWorkbook(twoSheets, 'Drugi')
    assertEq(secondReview.rows[0]!.weddingDate, '2027-07-01', 'sheet selection')

    const trailing = await reviewFromWorkbook(
      new FakeFile('trail.csv', 'Data;Para\n12.06.2027;Anna i Michał\n\n\n'),
    )
    assertEq(trailing.rows.length, 1, 'trailing empty rows removed')

    const formula = xlsxFile('formula.xlsx', (wb) => {
      const ws: WorkSheet = {}
      ws['A1'] = { t: 's', v: 'Data' }
      ws['B1'] = { t: 's', v: 'Para' }
      ws['C1'] = { t: 's', v: 'Cena' }
      ws['A2'] = { t: 's', v: '12.06.2027' }
      ws['B2'] = { t: 's', v: 'Anna i Michał' }
      ws['C2'] = { t: 'n', v: 10500, f: '=NOW()+999' }
      ws['!ref'] = 'A1:C2'
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    })
    const formulaReview = await reviewFromWorkbook(formula)
    assertEq(formulaReview.rows[0]!.contractValue, 10500, 'cached formula value, not executed')

    const unknown = await reviewFromWorkbook(
      new FakeFile(
        'extra.csv',
        'Data;Para;Lokalizacja;Cena\n12.06.2027;Anna i Michał;Kościół;10500\n',
      ),
    )
    assertEq(unknown.rows[0]!.weddingDate, '2027-06-12', 'known fields parsed')
    const locationMapping = unknown.applied.mappings.find((m) => m.sourceHeader === 'Lokalizacja')
    assert(locationMapping != null, 'unknown column present')
    assertEq(locationMapping!.targetField, 'ignore', 'unknown columns ignored unless mapped')
  })

  await run('wizard reset no longer reloads the app', () => {
    const page = readFileSync(resolve('src/pages/WeddingImportPage.tsx'), 'utf8')
    assert(!page.includes('location.reload'), 'no location.reload')
    assert(page.includes('resetImportWizard'), 'local wizard reset')
    assert(page.includes('isWritableImportRow'), 'write guard at page')
  })

  await run('DB duplicate helper still matches normalized identity', () => {
    const dupes = detectDuplicateCandidates({
      weddingDate: '2027-06-12',
      coupleDisplayName: 'anna kowalska i michal nowak',
      partner1Name: 'anna kowalska',
      partner2Name: 'michal nowak',
      contractValue: 8500,
      existingWeddings: [
        stubWedding({
          id: 'w1',
          date: '2027-06-12',
          partner1: 'Anna Kowalska',
          partner2: 'Michał Nowak',
          price: 8500,
        }),
      ],
    })
    assert(dupes.length > 0, 'normalized DB duplicate')
    assertEq(dupes[0]!.source, 'existing_wedding', 'source')
  })

  console.log('\nWedding import Phase 0 tests finished.')
}

void main()
