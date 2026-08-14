/**
 * Mobile payment modal sheet — viewport-safe width, single vertical scroll
 * owner, no horizontal pan, compact payment field rhythm.
 *
 * Covers AddPaymentModal + SessionPaymentModal (shared Modal + paymentSheet).
 *
 * Run: npm run test:mobile-payment-modal
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const css = read('src/components/ui/Modal.module.css')
const formCss = read('src/features/weddings/actions/actionForm.module.css')
const weddingModal = read('src/features/weddings/actions/AddPaymentModal.tsx')
const sessionModal = read(
  'src/features/sessions/actions/SessionPaymentModal.tsx',
)
const inputCss = read('src/components/ui/Input.module.css')

const mobileIdx = css.lastIndexOf('@media (max-width: 767px)')
assert(mobileIdx >= 0, 'mobile breakpoint present')
const desktop = css.slice(0, mobileIdx)
const mobile = css.slice(mobileIdx)

const formMobileIdx = formCss.lastIndexOf('@media (max-width: 767px)')
assert(formMobileIdx >= 0, 'payment form mobile block')
const formMobile = formCss.slice(formMobileIdx)

{
  assertIncludes(weddingModal, "from '@/components/ui/Modal'", '1: wedding uses Modal')
  assertIncludes(sessionModal, "from '@/components/ui/Modal'", '1: session uses Modal')
  assertIncludes(weddingModal, 'asDeposit', '1: deposit + payment share modal')
  assertIncludes(weddingModal, 'payment?: Payment', '1: edit shares modal')
  assertIncludes(weddingModal, 'formStyles.paymentSheet', '1: wedding paymentSheet')
  assertIncludes(sessionModal, 'formStyles.paymentSheet', '1: session paymentSheet')
  assertIncludes(weddingModal, 'type="date"', '1: native date input')
  assertNotIncludes(weddingModal, 'DatePickerField', '1: not DatePickerField')
  console.log('PASS  1  shared Modal + paymentSheet; native date')
}

{
  assertIncludes(mobile, 'overflow-x: clip', '2: mobile clips horizontal')
  assertIncludes(mobile, 'touch-action: pan-y', '2: vertical pan only')
  assertNotIncludes(desktop, 'touch-action: pan-y', '2: desktop untouched')
  console.log('PASS  2  no horizontal modal scroll (mobile-gated)')
}

{
  assertIncludes(mobile, 'width: 100%', '3: full viewport width')
  assertIncludes(mobile, 'max-width: 100%', '3: max-width capped')
  assertIncludes(mobile, 'min-width: 0', '3: flex min-width reset')
  console.log('PASS  3  viewport-safe panel width')
}

{
  const bodyBlock = mobile.slice(mobile.indexOf('.body {'))
  assertIncludes(bodyBlock, 'flex: 1 1 auto', '4: body flexes')
  assertIncludes(bodyBlock, 'overflow-y: auto', '4: body vertical scroll')
  assertIncludes(bodyBlock, 'overflow-x: clip', '4: body no x-scroll')
  assertIncludes(bodyBlock, 'min-height: 0', '4: body can shrink')
  assertIncludes(mobile, 'overflow-y: hidden', '4: panel not the scroll canvas')
  console.log('PASS  4  body owns vertical scroll')
}

{
  const footerBlock = mobile.slice(mobile.indexOf('.footer {'))
  assertIncludes(footerBlock, 'flex-shrink: 0', '5: footer outside scroll')
  assertNotIncludes(footerBlock, 'position: sticky', '5: no sticky scroll hack')
  assertIncludes(footerBlock, 'var(--safe-bottom)', '5: safe area')
  console.log('PASS  5  footer pinned + safe area')
}

{
  assertIncludes(mobile, '92dvh', '6: dynamic viewport')
  assertIncludes(mobile, 'min(92dvh, 92vh)', '6: dvh with vh fallback')
  assertIncludes(mobile, 'height: auto', '6: content-driven sheet height')
  console.log('PASS  6  content-driven height + dvh cap')
}

{
  assertIncludes(desktop, 'max-height: min(90vh, 720px)', '7: desktop panel height intact')
  assertIncludes(desktop, 'max-width: 480px', '7: desktop md width intact')
  assertNotIncludes(desktop, 'touch-action: pan-y', '7: no desktop touch lock')
  assertIncludes(inputCss, 'min-height: 112px', '7: Input textarea desktop default intact')
  assertNotIncludes(inputCss, 'paymentSheet', '7: Input not payment-scoped')
  assertNotIncludes(inputCss, "type='date'", '7: Input has no date-specific shrink')
  console.log('PASS  7  desktop modal / Input defaults preserved')
}

{
  assertIncludes(formMobile, "input[type='date']", '8: compact date control')
  assertIncludes(formMobile, '-webkit-appearance: none', '8: neutralize WebKit date chrome')
  assertIncludes(formMobile, 'height: 48px', '8: coherent control height')
  assertIncludes(formMobile, 'min-height: var(--touch-target)', '8: accessible touch min')
  assertIncludes(formMobile, 'max-height: 48px', '8: date cannot inflate')
  assertIncludes(formMobile, 'min-height: 5.25rem', '8: reduced textarea')
  assertIncludes(formMobile, 'max-width: 100%', '8: date width <= container')
  console.log('PASS  8  compact date + coherent fields + textarea')
}

{
  assertIncludes(mobile, 'padding-bottom: var(--space-3)', '9: tighter footer density')
  assertIncludes(mobile, 'padding-top: var(--space-3)', '9: tighter header')
  console.log('PASS  9  mobile vertical rhythm refined')
}

console.log('\nAll mobile payment modal acceptance checks passed.')
