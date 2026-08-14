/**
 * Mobile wedding editor sheets + final payment deadline UX.
 *
 * - Edytuj zlecenie (Modal + compact date)
 * - Edytuj pakiet (drawer scroll ownership)
 * - One coherent final-payment deadline control
 *
 * Run: npm run test:wedding-editor-sheets
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  resolveFinalPaymentDueDate,
  type FinalPaymentTerms,
} from '@/lib/utils/finalPaymentTerms'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

const identity = read(
  'src/features/weddings/detail/v2/WeddingIdentityEditDialog.tsx',
)
const drawerCss = read(
  'src/features/weddings/detail/v2/WeddingEditDrawerV2.module.css',
)
const fieldsCss = read(
  'src/features/weddings/detail/editing/WeddingEditorFields.module.css',
)
const packageFields = read(
  'src/features/weddings/detail/editing/fields/PackageFields.tsx',
)
const formCss = read('src/features/weddings/actions/actionForm.module.css')
const modalCss = read('src/components/ui/Modal.module.css')
const surface = read(
  'src/features/weddings/detail/v2/WeddingWorkspaceEditSurface.tsx',
)

const drawerMobile = drawerCss.slice(
  drawerCss.lastIndexOf('@media (max-width: 767px)'),
)
const modalDesktop = modalCss.slice(
  0,
  modalCss.lastIndexOf('@media (max-width: 767px)'),
)

{
  assertIncludes(identity, "from '@/components/ui/Modal'", '1: identity Modal')
  assertIncludes(identity, 'compactMobileForm', '1: compact form class')
  assertIncludes(identity, 'type="date"', '1: native date')
  assertNotIncludes(identity, 'hideFooter', '1: uses Modal footer')
  assertIncludes(identity, 'form="wedding-identity-form"', '1: footer submit')
  assertIncludes(formCss, 'compactMobileForm', '1: shared compact styles')
  assertIncludes(formCss, 'height: 48px', '1: compact date height')
  assertIncludes(modalDesktop, 'max-width: 480px', '1: desktop modal intact')
  console.log('PASS  1–5  Edit Wedding mobile sheet + compact date')
}

{
  assertIncludes(drawerCss, 'overflow-x: clip', '6: drawer clips X')
  assertIncludes(drawerCss, 'overflow-y: hidden', '6: panel not scroll canvas')
  const bodyBlock = drawerCss.slice(drawerCss.indexOf('.body {'))
  assertIncludes(bodyBlock, 'overflow-y: auto', '6: body vertical scroll')
  assertIncludes(bodyBlock, 'overflow-x: clip', '6: body no X scroll')
  assertIncludes(bodyBlock, 'min-width: 0', '6: body min-width')
  const footerBlock = drawerCss.slice(drawerCss.indexOf('.footer {'))
  assertIncludes(footerBlock, 'flex-shrink: 0', '6: footer outside body')
  assertNotIncludes(footerBlock, 'position: sticky', '6: no sticky footer hack')
  assertIncludes(drawerMobile, '100dvh', '6: dvh cap')
  assertIncludes(drawerMobile, 'safe-area-inset-bottom', '6: safe area')
  assertNotIncludes(drawerMobile, '100vw', '6: no 100vw width leak')
  assertIncludes(surface, 'PackageFields', '6: package uses drawer surface')
  console.log('PASS  6–11  Edit Package scroll ownership + width')
}

{
  assertIncludes(fieldsCss, 'min-width: 0', 'extras/fields min-width')
  assertIncludes(fieldsCss, '.listItem', 'extras cards')
  assertNotIncludes(drawerMobile, '100vw', 'drawer mobile no 100vw')
  const fieldsMobile = fieldsCss.slice(
    fieldsCss.lastIndexOf('@media (max-width: 767px)'),
  )
  assertIncludes(fieldsMobile, 'grid-template-columns: 1fr', 'fieldRow stacks')
  console.log('PASS  extras mobile-safe stacking')
}

{
  assertIncludes(packageFields, 'data-testid="final-payment-deadline"', '12: deadline block')
  assertIncludes(packageFields, 'Termin płatności końcowej', '12: primary label')
  assertIncludes(
    packageFields,
    "!wedding.finalPaymentTerms?.mode",
    '13: date only without mode',
  )
  assertIncludes(
    packageFields,
    'resolveFinalPaymentDueDate',
    '14: derived due on mode change',
  )
  // wedding_day must not render the duplicate editable date in the mode branch
  const deadlineSrc = packageFields.slice(
    packageFields.indexOf('final-payment-deadline'),
  )
  assert(
    !deadlineSrc.includes("disabled={wedding.finalPaymentTerms?.mode === 'after_delivery'}"),
    '14: removed always-visible duplicate date',
  )
  assertIncludes(packageFields, 'Uzupełnij z katalogu', '18: catalog autofill kept')
  assertIncludes(packageFields, 'fillWeddingTermsFromCatalogPackage', '18: catalog path')

  const weddingDay: FinalPaymentTerms = { mode: 'wedding_day' }
  const due = resolveFinalPaymentDueDate({
    terms: weddingDay,
    weddingDate: '2026-11-30',
  })
  assert(due === '2026-11-30', '14: wedding_day derives due date')
  console.log('PASS  12–18  payment deadline semantics')
}

{
  assertIncludes(
    packageFields,
    'finalPaymentTerms: null',
    '13: clearing mode does not invent new modes',
  )
  assertNotIncludes(
    packageFields,
    "mode: 'custom_date'",
    '13: no invented custom mode',
  )
  console.log('PASS  existing modes only; snapshot fields preserved in editor')
}

console.log('\nAll wedding editor sheets acceptance checks passed.')
