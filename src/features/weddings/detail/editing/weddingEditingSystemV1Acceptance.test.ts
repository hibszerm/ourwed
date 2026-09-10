/**
 * Wedding & Session Editing System V1 — presentation routing.
 * Domain formulas stay untouched; this locks centered shell usage.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { resolveWeddingEditOverlayPresentation } from '@/features/weddings/detail/editing/weddingEditorTypes'

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

const CENTERED_SECTIONS = [
  'contacts',
  'couple',
  'wedding',
  'locations',
  'package',
  'finances',
  'tasks',
  'notes',
] as const

run('1. all wedding editor sections resolve centered', () => {
  for (const section of CENTERED_SECTIONS) {
    assert.equal(
      resolveWeddingEditOverlayPresentation(section),
      'centered',
      section,
    )
  }
  assert.equal(
    resolveWeddingEditOverlayPresentation('package', {
      allowCenteredPackage: false,
    }),
    'centered',
    'package ignores legacy opt-in flag',
  )
})

run('2. Modern + Classic wire resolver without package-only gate', () => {
  const modern = read(
    'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
  )
  const classic = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
  assert.ok(modern.includes('resolveWeddingEditOverlayPresentation'))
  assert.ok(classic.includes('resolveWeddingEditOverlayPresentation'))
  assert.ok(!modern.includes('allowCenteredPackage'))
  assert.ok(!classic.includes('allowCenteredPackage'))
})

run('3. PackageFields keeps commercial helpers + grouped IA', () => {
  const pkg = read(
    'src/features/weddings/detail/editing/fields/PackageFields.tsx',
  )
  assert.ok(pkg.includes('recomposeContractValueForExtrasEdit'))
  assert.ok(pkg.includes('applyCommercialPackageSnapshot'))
  assert.ok(pkg.includes('rebaseEffectivePackageBase'))
  assert.ok(pkg.includes('getEffectiveTravelFeeAmount'))
  assert.ok(pkg.includes('editGroupTitle'))
  assert.ok(pkg.includes('Wartość i zaliczka'))
  assert.ok(pkg.includes('Czas realizacji'))
  assert.ok(pkg.includes('Rozliczenie'))
  assert.ok(pkg.includes('Dodatki'))
})

run('4. FinanceFields sections keep CV rebase + payments', () => {
  const fin = read(
    'src/features/weddings/detail/editing/fields/FinanceFields.tsx',
  )
  assert.ok(fin.includes('rebaseEffectivePackageBase'))
  assert.ok(fin.includes('Umowa handlowa'))
  assert.ok(fin.includes('Wpłaty'))
  assert.ok(fin.includes('finalPaymentDueDate'))
})

run('5. specialized modals use centered mobile family', () => {
  const travel = read(
    'src/features/weddings/detail/travel-fee/TravelFeeResolveModal.tsx',
  )
  const payment = read('src/features/weddings/actions/AddPaymentModal.tsx')
  const note = read('src/features/weddings/actions/AddNoteModal.tsx')
  const identity = read(
    'src/features/weddings/detail/v2/WeddingIdentityEditDialog.tsx',
  )
  const delivery = read(
    'src/features/weddings/detail/v2/DeliveryDeadlineModal.tsx',
  )
  for (const [name, src] of [
    ['travel', travel],
    ['payment', payment],
    ['note', note],
    ['identity', identity],
    ['delivery', delivery],
  ] as const) {
    assert.ok(
      src.includes('mobilePresentation="center"'),
      `${name} mobile center`,
    )
    assert.ok(src.includes('showClose'), `${name} showClose`)
  }
  assert.ok(travel.includes('size="lg"'), 'travel size')
  assert.ok(!travel.includes('applyCommercialPackageSnapshot'), 'travel not package')
})

run('6. session edit uses centered modal over detail', () => {
  const page = read('src/pages/EditSessionPage.tsx')
  const modal = read(
    'src/features/sessions/components/SessionEditModal.tsx',
  )
  const header = read(
    'src/features/sessions/modern-detail/ModernSessionDetailHeader.tsx',
  )
  const form = read('src/features/sessions/components/SessionForm.tsx')
  assert.ok(page.includes('SessionEditModal'))
  assert.ok(page.includes('SessionDetailRoutePage'))
  assert.ok(modal.includes('presentation="centered"'))
  assert.ok(modal.includes('WeddingEditDrawerV2'))
  assert.ok(header.includes('/sesje/${sessionId}/edytuj'))
  assert.ok(form.includes('hideActions'))
  assert.ok(form.includes('session-edit-form'))
})

console.log('weddingEditingSystemV1Acceptance: all passed')
