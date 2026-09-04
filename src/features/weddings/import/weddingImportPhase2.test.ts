/**
 * Wedding import Phase 2 freeze polish.
 * Run: npm run test:wedding-import-phase2
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { countReviewTones } from '@/features/weddings/import/importPresentation'
import type { WeddingImportReviewRow } from '@/features/weddings/import/types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
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

run('exit is a local quiet control, not PageHeader action', () => {
  const page = read('src/pages/WeddingImportPage.tsx')
  const css = read('src/pages/WeddingImportPage.module.css')
  assert(page.includes('← Śluby'), 'compact exit copy')
  assert(page.includes('className={styles.exit}'), 'local exit class')
  assert(page.includes('styles.pageTitle'), 'title lives in workspace')
  assert(!page.includes('title="Importuj śluby"'), 'no AppLayout title')
  assert(page.includes('width="wide"'), 'wide Modern container')
  assert(!page.includes('action={'), 'no AppLayout action')
  assert(css.includes('min-height: 44px'), '44px hit target')
  assert(css.includes('textAction.module.css'), 'shared text action')
})

run('zero-count issue filters are hidden except Wszystkie', () => {
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  assert(review.includes("item.id !== 'all' && count === 0"), 'hide zero filters')
  const mixed = [
    row({ id: 'a', status: 'ready' }),
    row({ id: 'b', status: 'warning' }),
  ]
  const counts = countReviewTones(mixed)
  assert(counts.error === 0, 'no errors')
  assert(counts.duplicate === 0, 'no duplicates')
})

run('duplicate override keeps duplicate status copy', () => {
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  assert(review.includes('Zostanie zaimportowany mimo duplikatu.'), 'override hint')
  assert(review.includes("row.status !== 'possible_duplicate'"), 'status stays duplicate')
})

run('sticky CTA yields to the editor', () => {
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  assert(review.includes('{!editingRowId ? ('), 'sticky hidden while editing')
  assert(review.includes('window.innerWidth >= 1024'), 'desktop review follows viewport width')
})

run('four-step architecture still frozen', () => {
  const stepper = read('src/features/weddings/import/WeddingImportStepper.tsx')
  assert(stepper.includes("'upload'") && stepper.includes("'mapping'"), 'steps')
  assert(stepper.includes("'review'") && stepper.includes("'done'"), 'review/done')
})

console.log('\nWedding import Phase 2 tests finished.')
