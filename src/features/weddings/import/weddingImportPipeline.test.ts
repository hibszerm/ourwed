/**
 * Wedding import pipeline regression tests (page-equivalent flow).
 * Run: npm run test:wedding-import-pipeline
 */

import * as XLSX from 'xlsx'
import {
  buildReviewRows,
  revalidateReviewRow,
} from '@/features/weddings/import/buildReviewRows'
import {
  applyHeaderRowSelection,
  detectAndApplyHeaderRow,
} from '@/features/weddings/import/importPipeline'
import { parseImportWorkbook } from '@/features/weddings/import/parseSpreadsheet'
import { reviewDateInputValue } from '@/features/weddings/import/reviewDateField'
import type { ParsedWorkbookSheet } from '@/features/weddings/import/types'

const FROZEN_TODAY = '2026-07-28'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function buildFixtureWorkbookBuffer(): Buffer {
  const wb = XLSX.utils.book_new()
  const ws: XLSX.WorkSheet = {}
  const set = (addr: string, v: unknown, w?: string) => {
    ws[addr] = w
      ? { t: v instanceof Date ? 'd' : typeof v === 'number' ? 'n' : 's', v, w }
      : { t: v instanceof Date ? 'd' : typeof v === 'number' ? 'n' : 's', v }
  }
  set('A1', 'Lista slubow 2026')
  set('A3', 'Data')
  set('B3', 'Nazwisko')
  set('C3', 'wartosc umowy')
  set('A4', new Date(2026, 3, 11), '11.04.2026')
  set('B4', 'Chiara Czestochowa')
  set('C4', 8550)
  set('A5', new Date(2026, 3, 12), '12.04.2026')
  set('B5', 'Jakub Wiecha')
  set('C5', 7550)
  set('A6', new Date(2026, 4, 16), '16.05.2026')
  set('B6', 'Monika Węgrzyn')
  set('C6', 7900)
  set('A7', new Date(2026, 5, 3), '03.06.2026')
  set('B7', 'Dominika Oświęcimska')
  set('C7', 5000)
  set('A8', new Date(2026, 6, 3), '03.07.2026')
  set('B8', 'Malwina Siekaniec')
  set('C8', 7100)
  ws['!ref'] = 'A1:C8'
  XLSX.utils.book_append_sheet(wb, ws, 'Sezon 2026')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

class FakeFile {
  name: string
  private buffer: Buffer

  constructor(name: string, buffer: Buffer) {
    this.name = name
    this.buffer = buffer
  }

  get size() {
    return this.buffer.length
  }

  async arrayBuffer() {
    return this.buffer
  }
}

async function parseFixtureSheet(): Promise<{
  sheet: ParsedWorkbookSheet
  applied: ReturnType<typeof detectAndApplyHeaderRow>
}> {
  const parsed = await parseImportWorkbook(
    new FakeFile('fixture.xlsx', buildFixtureWorkbookBuffer()) as unknown as File,
  )
  const sheet = parsed.sheets[0]!
  const applied = detectAndApplyHeaderRow({ sheet, savedMappings: null })
  return { sheet, applied }
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

async function main() {
  await run('detects header on Excel row 3 and data on row 4+', async () => {
    const { applied } = await parseFixtureSheet()
    assertEq(applied.confirmedHeaderRowIndexZeroBased, 2, 'header index zero-based')
    assertEq(applied.headerRowNumberOneBased, 3, 'header row number')
    assertEq(applied.rawRows[0]?.sourceRowNumber, 4, 'first data excel row')
  })

  await run('full pipeline produces five ready wedding rows', async () => {
    const { sheet, applied } = await parseFixtureSheet()
    const review = buildReviewRows({
      rows: applied.rawRows,
      mappings: applied.mappings,
      existingWeddings: [],
      catalog: [],
      sheetName: sheet.name,
      date1904: sheet.date1904,
      confirmedHeaderRowIndexZeroBased: applied.confirmedHeaderRowIndexZeroBased,
    })

    assertEq(review.length, 5, 'row count')
    assert(review.every((row) => row.coupleDisplayName !== 'Nazwisko'), 'no header names')
    assert(review.every((row) => row.weddingDate !== FROZEN_TODAY), 'not today')
    assert(review.every((row) => row.status === 'ready'), 'all ready')

    assertEq(review[0]!.sourceRowNumber, 4, 'first row number')
    assertEq(review[0]!.weddingDate, '2026-04-11', 'first date')
    assertEq(review[0]!.coupleDisplayName, 'Chiara Czestochowa', 'first name')
    assertEq(review[0]!.contractValue, 8550, 'first price')
    assertEq(review[2]!.weddingDate, '2026-05-16', 'may date')
    assertEq(review[4]!.weddingDate, '2026-07-03', 'jul date')
  })

  await run('off-by-one header selection marks header row and excludes it', async () => {
    const { sheet, applied } = await parseFixtureSheet()
    const wrongHeader = applyHeaderRowSelection({
      sheet,
      headerRowIndexZeroBased: applied.confirmedHeaderRowIndexZeroBased - 1,
      savedMappings: applied.mappings,
    })
    const review = buildReviewRows({
      rows: wrongHeader.rawRows,
      mappings: applied.mappings,
      existingWeddings: [],
      catalog: [],
      sheetName: sheet.name,
    })
    const headerRow = review.find((row) => row.coupleDisplayName === 'Nazwisko')
    assert(Boolean(headerRow), 'header-like row present')
    assert(
      headerRow!.issues.some((issue) => issue.code === 'IMPORT_HEADER_ROW_DETECTED_AS_DATA'),
      'header issue code',
    )
    assertEq(headerRow!.selectedForImport, false, 'header excluded')
  })

  await run('review date input stays blank for null and never accepts display text', async () => {
    assertEq(reviewDateInputValue(null), '', 'null blank')
    assertEq(reviewDateInputValue(undefined), '', 'undefined blank')
    assertEq(reviewDateInputValue('28.07.2026'), '', 'polish display rejected')
    assertEq(reviewDateInputValue('2026-07-28'), '2026-07-28', 'iso accepted')

    const valid = revalidateReviewRow(
      {
        id: 'row-1',
        sourceRowNumber: 4,
        weddingDate: '2026-05-16',
        coupleDisplayName: 'Test',
        partner1Name: 'Test',
        partner2Name: '',
        contractValue: 1000,
        status: 'ready',
        issues: [],
        duplicateCandidates: [],
        selectedForImport: true,
      },
      [],
      [],
    )
    assertEq(reviewDateInputValue(valid.weddingDate), '2026-05-16', 'valid stays valid')

    const invalid = revalidateReviewRow(
      {
        ...valid,
        weddingDate: null,
        weddingDateSourceDisplay: '16.05.2026',
        status: 'invalid',
      },
      [],
      [],
    )
    assertEq(reviewDateInputValue(invalid.weddingDate), '', 'invalid stays blank')
    assert(
      invalid.issues.some((issue) => issue.field === 'weddingDate'),
      'date issue visible',
    )
    assertEq(invalid.weddingDate, null, 'model stays null')
  })

  await run('revalidation after editing another field preserves null date', async () => {
    const row = revalidateReviewRow(
      {
        id: 'row-2',
        sourceRowNumber: 5,
        weddingDate: null,
        weddingDateSourceDisplay: '4/11/26',
        coupleDisplayName: 'Anna',
        partner1Name: 'Anna',
        partner2Name: '',
        contractValue: 5000,
        status: 'invalid',
        issues: [],
        duplicateCandidates: [],
        selectedForImport: false,
      },
      [],
      [],
    )
    const edited = revalidateReviewRow(
      { ...row, coupleDisplayName: 'Anna Kowalska', partner1Name: 'Anna Kowalska' },
      [],
      [],
    )
    assertEq(edited.weddingDate, null, 'date still null')
    assertEq(reviewDateInputValue(edited.weddingDate), '', 'input still blank')
  })

  console.log('\nWedding import pipeline tests finished.')
}

void main()
