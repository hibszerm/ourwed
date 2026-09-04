/**
 * Wedding import mobile Upload / Mapping / Result polish.
 * Run: npm run test:wedding-import-mobile-flow
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  failedImportRecordsHeadline,
  importedResultHeadline,
  mappedColumnsSummary,
} from '@/features/weddings/import/importPresentation'

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

run('upload empty mobile composition prefers device picker copy', () => {
  const upload = read('src/features/weddings/import/components/ImportUploadStep.tsx')
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  assert(upload.includes('Wybierz plik z urządzenia'), 'mobile empty title')
  assert(upload.includes('Wybierz plik'), 'mobile pick CTA')
  assert(upload.includes('Przeciągnij plik tutaj'), 'desktop drag title remains')
  assert(upload.includes('Wybierz z komputera'), 'desktop pick CTA remains')
  assert(upload.includes('Excel (.xlsx, .xls) lub CSV (UTF-8) · maks. 10 MB'), 'formats')
  assert(upload.includes('styles.fromMobile'), 'mobile/desktop split')
  assert(css.includes('min-height: 0'), 'compact dropzone')
  assert(!css.includes('border-style: dashed'), 'no dashed SaaS dropzone')
})

run('selected-file mobile composition owns Dopasuj kolumny', () => {
  const upload = read('src/features/weddings/import/components/ImportUploadStep.tsx')
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  assert(upload.includes('styles.selectedFile'), 'selected file surface')
  assert(upload.includes('styles.uploadActions'), 'CTA belongs to selected file')
  assert(upload.includes('Dopasuj kolumny'), 'mapping CTA')
  assert(upload.includes('Zmień plik'), 'change file')
  assert(upload.includes('detectedRecordsLabel'), 'record count')
  assert(upload.includes('Wiersz z nagłówkami'), 'header row selector')
  assert(upload.includes('Wykryto automatycznie'), 'auto-detect helper')
  assert(!upload.includes('styles.sticky'), 'upload has no sticky footer')
  assert(css.includes('.uploadContinue'), 'full-width mobile continue')
  assert(css.includes('background: transparent'), 'selected file can sit on the page')
})

run('mapping contains no mobile table dependency', () => {
  const mapping = read('src/features/weddings/import/components/ImportMappingStep.tsx')
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  assert(!mapping.includes('<table'), 'no mapping table')
  assert(!mapping.includes('overflow-x'), 'no mapping horizontal scroll markup')
  assert(mapping.includes('styles.mappingPanel'), 'stacked mapping')
  assert(mapping.includes('styles.mappingItem'), 'compact mapping rows')
  assert(mapping.includes('data-ignored'), 'ignored columns are marked')
  assert(mapping.includes('Importuj jako'), 'destination label')
  assert(mapping.includes('Wymagane'), 'required meta')
  assert(mapping.includes('Wykryto'), 'detected meta')
  assert(css.includes('.mappingItem[data-ignored'), 'ignored visual treatment')
  assert(css.includes('grid-template-columns: minmax(0, 0.46fr) minmax(0, 0.54fr)'), 'desktop split remains')
})

run('mapping action hierarchy is Wstecz then Sprawdź dane', () => {
  const mapping = read('src/features/weddings/import/components/ImportMappingStep.tsx')
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  const back = mapping.indexOf('Wstecz')
  const next = mapping.indexOf('Sprawdź dane')
  assert(back >= 0 && next > back, 'Wstecz before Sprawdź dane')
  assert(mapping.includes('variant="secondary"'), 'back is secondary')
  assert(mapping.includes('variant="primary"'), 'continue is primary')
  assert(mapping.includes('styles.stepActions'), 'compact action row')
  assert(!mapping.includes('styles.sticky'), 'mapping is not sticky')
  assert(css.includes('.stepActions'), 'step action grid')
  assertEq(
    mappedColumnsSummary(6, 7),
    '6 z 7 kolumn zostanie zaimportowanych',
    'quiet mapping summary',
  )
})

run('result all-success copy is calm and truthful', () => {
  const result = read('src/features/weddings/import/components/ImportResultStep.tsx')
  assert(result.includes('Import zakończony'), 'result heading')
  assert(result.includes('importedResultHeadline'), 'headline helper')
  assert(result.includes('zaimportowano'), 'imported count')
  assert(result.includes('pominięto'), 'skipped count')
  assert(result.includes("polishPlural(result.failedCount, 'błąd', 'błędy', 'błędów')"), 'errors stay visible at zero')
  assert(!result.includes('metric'), 'no metric cards')
  assertEq(importedResultHeadline(33, 33), 'Zaimportowano 33 śluby.', 'all-success headline')
  assertEq(importedResultHeadline(1, 1), 'Zaimportowano 1 ślub.', 'singular')
})

run('result partial-failure copy stays human and retryable', () => {
  const result = read('src/features/weddings/import/components/ImportResultStep.tsx')
  assert(result.includes('failedImportRecordsHeadline'), 'failure headline helper')
  assert(result.includes('humanizeImportWriteError'), 'human write errors')
  assert(result.includes('Spróbuj ponownie'), 'retry CTA')
  assertEq(
    failedImportRecordsHeadline(2),
    'Nie udało się zaimportować 2 rekordów.',
    'two failures',
  )
  assertEq(
    failedImportRecordsHeadline(1),
    'Nie udało się zaimportować 1 rekordu.',
    'one failure',
  )
  assert(importedResultHeadline(31, 33).includes('31 z 33'), 'partial success headline')
})

run('import another file resets without location.reload', () => {
  const page = read('src/pages/WeddingImportPage.tsx')
  const result = read('src/features/weddings/import/components/ImportResultStep.tsx')
  assert(!page.includes('location.reload'), 'page has no reload')
  assert(!result.includes('location.reload'), 'result has no reload')
  assert(page.includes('onImportAnother={resetImportWizard}'), 'another file resets wizard')
  assert(page.includes("hasMeaningfulWork = Boolean(workbook) && step !== 'done'"), 'no leave guard after done')
})

run('result navigation is a real button, not nested interactive markup', () => {
  const result = read('src/features/weddings/import/components/ImportResultStep.tsx')
  assert(result.includes("navigate('/sluby')"), 'navigates to weddings')
  assert(result.includes('Przejdź do ślubów'), 'primary label')
  assert(result.includes('Importuj kolejny plik'), 'secondary label')
  assert(!result.includes('<Link'), 'no Link wrapper')
  assert(!result.includes('</Link>'), 'no nested Link')
  assert(result.includes('styles.resultActions'), 'result action stack')
})

run('no legacy full-width mobile utility CTA patterns reintroduced', () => {
  const upload = read('src/features/weddings/import/components/ImportUploadStep.tsx')
  const mapping = read('src/features/weddings/import/components/ImportMappingStep.tsx')
  const result = read('src/features/weddings/import/components/ImportResultStep.tsx')
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  for (const [name, src] of [
    ['upload', upload],
    ['mapping', mapping],
    ['result', result],
  ] as const) {
    assert(!src.includes('100vw'), `${name} no 100vw`)
    assert(!src.includes('position: fixed'), `${name} no fixed utility bar`)
    assert(!src.includes('styles.sticky'), `${name} does not reuse review sticky`)
  }
  assert(!css.includes('width: 100vw'), 'css no viewport-width CTA')
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  assert(review.includes('styles.cardMeta'), 'accepted review composition untouched')
  assert(review.includes('{dateLabel(row)} · {amountLabel(row)}'), 'review meta line untouched')
})

console.log('\nWedding import mobile flow tests finished.')
