/**
 * Wedding import mobile review polish.
 * Run: npm run test:wedding-import-mobile
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

run('mobile review is a compact list, not boxed cards or a spreadsheet', () => {
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  assert(review.includes('styles.cards'), 'mobile list remains')
  assert(review.includes('styles.cardMeta'), 'date and amount share a meta line')
  assert(review.includes('{dateLabel(row)} · {amountLabel(row)}'), 'connected meta copy')
  assert(review.includes('styles.rowAction'), 'quiet row actions')
  assert(review.includes('compact'), 'compact duplicate actions on mobile')
  assert(!review.includes('<table') || review.includes('desktop'), 'table still desktop-gated')
  assert(css.includes('.card {'), 'record surface')
  assert(css.includes('box-shadow: none'), 'no per-record shadow')
  assert(css.includes('border-radius: 0'), 'no per-record radius')
  assert(css.includes('padding: 0.9rem 0'), 'compact record padding')
})

run('mobile edit is a quiet text action, desktop table still uses Button', () => {
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  assert(review.includes('className={styles.rowAction}'), 'mobile text action')
  assert(review.includes("data-priority={row.status === 'invalid' ? 'error' : undefined}"), 'error edit stays obvious')
  assert(review.includes('variant="ghost"'), 'desktop table edit remains ghost Button')
  assert(css.includes('min-height: 44px'), 'row action hit target')
  assert(css.includes('textAction.module.css'), 'shared text-action hit box')
})

run('mobile selection, issues, duplicates, and sticky behavior stay complete', () => {
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  assert(review.includes("disabled={row.status === 'invalid'}"), 'hard-error checkbox disabled')
  assert(review.includes('humanizeImportIssue'), 'issues visible')
  assert(review.includes('Importuj mimo to'), 'duplicate override')
  assert(review.includes('Pomiń'), 'duplicate skip')
  assert(review.includes('Popraw dane'), 'repair action')
  assert(review.includes('Zostanie zaimportowany mimo duplikatu.'), 'override hint remains')
  assert(review.includes('{!editingRowId ? ('), 'sticky hides while editing')
  assert(review.includes('missingAmountNotice'), '0 PLN notice')
})

run('mobile sticky bar is compact below the table breakpoint only', () => {
  const css = read('src/features/weddings/import/components/importWorkspace.module.css')
  assert(css.includes('@media (max-width: 1023px)'), 'mobile review breakpoint')
  assert(css.includes('grid-template-columns: minmax(5.5rem, 0.38fr) minmax(0, 0.62fr)'), 'compact action row')
  assert(css.includes('padding: 0.55rem 0 calc(0.55rem + env(safe-area-inset-bottom))'), 'tighter sticky padding')
  assert(css.includes('padding-bottom: 7.25rem'), 'list clears sticky bar')
  assert(css.includes('@media (min-width: 1024px)'), 'desktop table rules remain')
})

run('four-step architecture and desktop table remain frozen', () => {
  const stepper = read('src/features/weddings/import/WeddingImportStepper.tsx')
  const review = read('src/features/weddings/import/components/ImportReviewStep.tsx')
  assert(stepper.includes("'upload'") && stepper.includes("'mapping'"), 'upload/mapping')
  assert(stepper.includes("'review'") && stepper.includes("'done'"), 'review/done')
  assert(review.includes('window.innerWidth >= 1024'), 'desktop table gate')
  assert(review.includes('<table className={styles.table}>'), 'desktop table')
})

console.log('\nWedding import mobile review tests finished.')
