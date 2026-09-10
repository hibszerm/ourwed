/**
 * Session edit parity — centered WeddingEditDrawerV2 shell over detail context.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`fail - ${name}`)
    throw err
  }
}

const root = resolve(process.cwd())
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

run('1. SessionEditModal uses centered WeddingEditDrawerV2', () => {
  const modal = read('src/features/sessions/components/SessionEditModal.tsx')
  assert.ok(modal.includes('WeddingEditDrawerV2'))
  assert.ok(modal.includes('presentation="centered"'))
  assert.ok(modal.includes('Edytuj sesję'))
  assert.ok(modal.includes('SessionForm'))
  assert.ok(modal.includes('hideActions'))
  assert.ok(modal.includes('onDirtyChange'))
  assert.ok(!modal.includes('SessionEditSurface'))
})

run('2. EditSessionPage mounts detail + modal (not route card)', () => {
  const page = read('src/pages/EditSessionPage.tsx')
  assert.ok(page.includes('SessionDetailRoutePage'))
  assert.ok(page.includes('SessionEditModal'))
  assert.ok(page.includes('replace: true'))
  assert.ok(!page.includes('session-edit-surface'))
  assert.ok(!page.includes('SessionEditSurface'))
})

run('3. SessionForm keeps fields + modal presentation hooks', () => {
  const form = read('src/features/sessions/components/SessionForm.tsx')
  for (const field of [
    'customName',
    'primaryPerson',
    'sessionType',
    'date',
    'startTime',
    'endTime',
    'location',
    'totalPrice',
    'depositAmount',
    'linkedWeddingId',
    'notes',
  ]) {
    assert.ok(form.includes(field), field)
  }
  assert.ok(form.includes('hideActions'))
  assert.ok(form.includes('presentation'))
  assert.ok(form.includes('LocationSearchField'))
  assert.ok(form.includes('type="time"'))
  assert.ok(form.includes('financeEditGrid'))
  assert.ok(form.includes('session-finance-summary'))
  assert.ok(form.includes('getSessionTotalPaid'))
  assert.ok(form.includes('getSessionRemainingAmount'))
  assert.ok(!form.includes('remainingBox'))
})

run('3b. SessionForm CSS: finance summary + local time WebKit fix', () => {
  const css = read('src/features/sessions/components/SessionForm.module.css')
  assert.ok(css.includes('.paymentSummary'))
  assert.ok(css.includes('.financeEditGrid'))
  assert.ok(css.includes("input[type='time']"))
  assert.ok(css.includes('::-webkit-date-and-time-value'))
  assert.ok(css.includes('min-width: 0'))
})

run('4. Entry points still resolve to /edytuj deep link', () => {
  const header = read(
    'src/features/sessions/modern-detail/ModernSessionDetailHeader.tsx',
  )
  const overview = read(
    'src/features/sessions/modern-detail/ModernSessionOverview.tsx',
  )
  const classic = read('src/pages/SessionDetailPage.tsx')
  assert.ok(header.includes('/sesje/${sessionId}/edytuj'))
  assert.ok(overview.includes('/sesje/${session.id}/edytuj'))
  assert.ok(classic.includes('/sesje/${session.id}/edytuj'))
})

run('5. Wedding editors not rewritten by this pass', () => {
  const types = read(
    'src/features/weddings/detail/editing/weddingEditorTypes.ts',
  )
  assert.ok(types.includes("return 'centered'"))
  const drawer = read(
    'src/features/weddings/detail/v2/WeddingEditDrawerV2.tsx',
  )
  assert.ok(drawer.includes("presentation = 'drawer'"))
})

console.log('sessionEditParityAcceptance: all passed')
