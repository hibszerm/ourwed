/**
 * Wedding import Phase 1 review UX acceptance.
 * Run: npm run test:wedding-import-phase1
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { revalidateReviewRow } from '@/features/weddings/import/buildReviewRows'
import {
  countReviewTones,
  describeColumnMappingBlock,
  filterReviewRows,
  formatImportAmount,
  humanizeImportIssue,
  importedResultHeadline,
  importWriteCtaLabel,
  mappedColumnsSummary,
  missingAmountNotice,
  selectedMissingAmountCount,
  selectedImportCount,
} from '@/features/weddings/import/importPresentation'
import type { WeddingImportReviewRow } from '@/features/weddings/import/types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
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

function row(patch: Partial<WeddingImportReviewRow>): WeddingImportReviewRow {
  return {
    id: 'row-2',
    sourceRowNumber: 2,
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

run('A. four-step architecture preserved', () => {
  const stepper = read('src/features/weddings/import/WeddingImportStepper.tsx')
  const page = read('src/pages/WeddingImportPage.tsx')
  assert(stepper.includes("'upload'") && stepper.includes("'mapping'"), 'upload/mapping')
  assert(stepper.includes("'review'") && stepper.includes("'done'"), 'review/done')
  assert(stepper.includes('Plik') && stepper.includes('Kolumny'), 'short labels')
  assert(stepper.includes('Sprawdzenie') && stepper.includes('Gotowe'), 'review/done labels')
  assert(page.includes('ImportUploadStep'), 'upload step')
  assert(page.includes('ImportMappingStep'), 'mapping step')
  assert(page.includes('ImportReviewStep'), 'review step')
  assert(page.includes('ImportResultStep'), 'result step')
})

run('B. no generic Dalej as primary workflow copy', () => {
  const page = read('src/pages/WeddingImportPage.tsx')
  const upload = read('src/features/weddings/import/components/ImportUploadStep.tsx')
  const mapping = read('src/features/weddings/import/components/ImportMappingStep.tsx')
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  for (const [name, src] of [
    ['page', page],
    ['upload', upload],
    ['mapping', mapping],
    ['review', review],
  ] as const) {
    assert(!src.includes('>Dalej<') && !src.includes("'Dalej'") && !src.includes('"Dalej"'), `${name} Dalej`)
  }
  assert(upload.includes('Dopasuj kolumny'), 'upload CTA')
  assert(mapping.includes('Sprawdź dane'), 'mapping CTA')
  assert(review.includes('importWriteCtaLabel'), 'review CTA')
})

run('C-E. mobile review exposes issues, duplicate override, error correction', () => {
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  assert(review.includes('styles.cards'), 'mobile cards')
  assert(review.includes('humanizeImportIssue'), 'issue copy')
  assert(review.includes('Importuj mimo to'), 'duplicate action')
  assert(review.includes('Popraw dane'), 'error correction')
  assert(review.includes('Pomiń'), 'skip duplicate')
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  assert(css.includes('max-width: 1023px'), 'mobile breakpoint')
  assert(css.includes('.cards'), 'card layout')
})

run('F-I. review counts, filters, selected count, missing price summary', () => {
  const rows = [
    row({ id: 'a', status: 'ready', selectedForImport: true, priceState: 'value' }),
    row({
      id: 'b',
      status: 'warning',
      selectedForImport: true,
      priceState: 'empty',
      contractValue: null,
      issues: [{ code: 'MISSING_CONTRACT_VALUE', severity: 'warning', message: 'x' }],
    }),
    row({
      id: 'c',
      status: 'possible_duplicate',
      selectedForImport: false,
      duplicateDecision: 'skip',
    }),
    row({
      id: 'd',
      status: 'invalid',
      selectedForImport: false,
      priceState: 'invalid',
      contractValue: null,
    }),
  ]
  const counts = countReviewTones(rows)
  assertEq(counts.ready, 1, 'ready')
  assertEq(counts.warning, 1, 'warning')
  assertEq(counts.duplicate, 1, 'duplicate')
  assertEq(counts.error, 1, 'error')
  assertEq(filterReviewRows(rows, 'error').length, 1, 'error filter')
  assertEq(selectedImportCount(rows), 2, 'selected')
  assertEq(selectedMissingAmountCount(rows), 1, 'missing amount selected')
  assert(
    missingAmountNotice(3).includes('0 zł'),
    'missing amount notice',
  )
})

run('J. hard-error rows cannot be selected in UI', () => {
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  assert(review.includes("disabled={row.status === 'invalid'}"), 'checkbox disabled')
  const page = read('src/pages/WeddingImportPage.tsx')
  assert(page.includes('isWritableImportRow'), 'write guard')
})

run('K. duplicate override persists during review', () => {
  const page = read('src/pages/WeddingImportPage.tsx')
  assert(page.includes("duplicateDecision: decision"), 'override patch')
  assert(page.includes("selectedForImport: decision === 'import_anyway'"), 'select on override')
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  assert(review.includes('overridden'), 'override remains visible')
})

run('L-N. leave guard and change-file confirm', () => {
  const page = read('src/pages/WeddingImportPage.tsx')
  assert(page.includes('useBlocker(hasMeaningfulWork)'), 'in-app leave')
  assert(page.includes("addEventListener('beforeunload'"), 'beforeunload')
  assert(page.includes('Przerwać import?'), 'leave copy')
  assert(page.includes('Zmienić plik?'), 'change file copy')
  assert(page.includes('hasMeaningfulWork = Boolean(workbook) && step !== \'done\''), 'no guard without file / after done')
  assert(page.includes('setExitPrompt(true)'), 'explicit exit prompt')
})

run('O-P. result retry and no location.reload', () => {
  const page = read('src/pages/WeddingImportPage.tsx')
  const result = read('src/features/weddings/import/components/ImportResultStep.tsx')
  assert(!page.includes('location.reload'), 'no reload')
  assert(page.includes('resetImportWizard'), 'reset another file')
  assert(result.includes('Spróbuj ponownie'), 'retry CTA')
  assert(page.includes('onRetryFailures={() => void runImport()}'), 'retry uses same import')
  assert(page.includes('importedRowIds'), 'session skip set')
})

run('Q. mapping is stacked, not a mobile spreadsheet table', () => {
  const mapping = read('src/features/weddings/import/components/ImportMappingStep.tsx')
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  assert(!mapping.includes('<table'), 'no mapping table')
  assert(mapping.includes('mappingPanel'), 'stacked mapping')
  assert(css.includes('.mappingItem'), 'mapping items')
})

run('R. accessible labels and statuses', () => {
  const stepper = read('src/features/weddings/import/WeddingImportStepper.tsx')
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  const mapping = read('src/features/weddings/import/components/ImportMappingStep.tsx')
  assert(stepper.includes("aria-current={status === 'current' ? 'step' : undefined}"), 'stepper current')
  assert(review.includes('aria-pressed={filter === item.id}'), 'filter pressed')
  assert(review.includes('aria-label={`Importuj ${row.coupleDisplayName'), 'checkbox identity')
  assert(mapping.includes('aria-label={`Importuj kolumnę'), 'mapping select label')
})

run('import amount display keeps grosze', () => {
  assertEq(formatImportAmount(10500), '10 500 zł', 'thousands')
  assertEq(formatImportAmount(10.5), '10,50 zł', '10.50 not rounded to 11')
  assertEq(formatImportAmount(0), '0 zł', 'explicit zero')
})

run('repairing a hard-error row selects it for import', () => {
  const invalid = revalidateReviewRow(
    row({
      id: 'fix-me',
      status: 'invalid',
      selectedForImport: false,
      priceState: 'invalid',
      contractValue: null,
    }),
    [],
    [],
  )
  assertEq(invalid.status, 'invalid', 'still invalid without amount')
  assertEq(invalid.selectedForImport, false, 'hard error stays unselected')
  const repaired = revalidateReviewRow(
    { ...invalid, contractValue: 10500, priceState: 'value' },
    [],
    [],
  )
  assertEq(repaired.status, 'ready', 'becomes ready')
  assertEq(repaired.selectedForImport, true, 'selected after repair')
})

run('human issue copy and result headline', () => {
  assertEq(
    humanizeImportIssue({
      code: 'INVALID_CONTRACT_VALUE',
      severity: 'error',
      message: 'raw',
    }),
    'Nie udało się odczytać kwoty. Popraw wartość przed importem.',
    'invalid amount',
  )
  assertEq(
    humanizeImportIssue({
      code: 'DUPLICATE_IN_FILE',
      severity: 'warning',
      message: 'raw',
    }),
    'Ten rekord powtarza się w tym pliku.',
    'file dupe',
  )
  assert(
    importedResultHeadline(9, 12).includes('9 z 12'),
    'partial headline',
  )
})

run('review write CTA uses Polish plural, not generic Dalej', () => {
  assertEq(importWriteCtaLabel(1), 'Importuj 1 ślub', 'singular')
  assertEq(importWriteCtaLabel(2), 'Importuj 2 śluby', 'few')
  assertEq(importWriteCtaLabel(33), 'Importuj 33 śluby', '33 few')
  assertEq(importWriteCtaLabel(5), 'Importuj 5 ślubów', 'many')
  assertEq(
    mappedColumnsSummary(3, 7),
    '3 z 7 kolumn zostanie zaimportowanych',
    'mapping summary',
  )
})

run('mapping CTA explains missing date vs couple', () => {
  assertEq(
    describeColumnMappingBlock([
      { sourceColumnId: 'c0', sourceHeader: 'Para', targetField: 'coupleDisplayName' },
    ]),
    'Przypisz kolumnę z datą ślubu, aby przejść dalej.',
    'date',
  )
  assertEq(
    describeColumnMappingBlock([
      { sourceColumnId: 'c0', sourceHeader: 'Data', targetField: 'weddingDate' },
    ]),
    'Przypisz kolumnę z nazwą pary.',
    'couple',
  )
})

run('trust copy and exit label', () => {
  const upload = read('src/features/weddings/import/components/ImportUploadStep.tsx')
  const page = read('src/pages/WeddingImportPage.tsx')
  assert(upload.includes('Nic nie zostanie zapisane bez Twojego potwierdzenia.'), 'trust')
  assert(page.includes('← Śluby'), 'exit')
  assert(!page.includes('Wróć do ślubów'), 'no heavy header exit')
  assert(page.includes('Importuj śluby'), 'established title')
  assert(page.includes('Przenieś swój sezon'), 'first-run title')
  assert(page.includes('Co możesz zaimportować'), 'capability list')
  assert(page.includes('Bezpieczny import'), 'trust section')
  assert(
    page.includes('Import nie wysyła żadnych wiadomości do Twoich klientów.'),
    'first-run no-client-comms trust',
  )
  assert(page.includes('existingWeddings.length === 0'), 'first-run discriminator')
  assert(page.includes('supportColumn'), 'desktop support column')
  assert(
    !page.includes('{isFirstRunImport ? ('),
    'support column not gated by wedding count',
  )
  assert(page.includes('hideClientCommsTrust={false}'), 'trust always visible')
  assert(!page.includes('Lokalizacja'), 'no false location claim')
  assert(!page.includes('workflow'), 'no workflow claim')
})

console.log('\nWedding import Phase 1 tests finished.')
