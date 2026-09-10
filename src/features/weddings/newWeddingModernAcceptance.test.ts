/**
 * New Wedding Modern/mobile presentation — does not change domain behavior.
 * Run: npm run test:new-wedding-modern
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildNewWeddingCreatePayload } from './buildNewWeddingCreatePayload'

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

function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`${m}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const page = read('src/pages/NewWeddingPage.tsx')
const css = read('src/pages/NewWeddingPage.module.css')
const payloadSrc = read('src/features/weddings/buildNewWeddingCreatePayload.ts')
const inputCss = read('src/components/ui/Input.module.css')

{
  assertIncludes(page, "label: 'Para'", '4-step Para')
  assertIncludes(page, "label: 'Pakiet'", '4-step Pakiet')
  assertIncludes(page, "label: 'Miejsca'", '4-step Miejsca')
  assertIncludes(page, "label: 'Podsumowanie'", '4-step Podsumowanie')
  assertIncludes(page, 'QUICK_STEPS', 'quick 2-step path')
  assertIncludes(page, "label: 'Para'", 'quick Para')
  assertIncludes(page, "register('partner1')", 'partner1')
  assertIncludes(page, "register('partner2')", 'partner2')
  assertIncludes(page, "register('date')", 'date')
  assertIncludes(page, "register('packageId')", 'packageId')
  assertIncludes(page, "register('price', { valueAsNumber: true })", 'price valueAsNumber')
  assertIncludes(page, "register('depositPaid')", 'depositPaid')
  assertIncludes(page, "register('depositAmount', { valueAsNumber: true })", 'deposit amount')
  assertIncludes(page, "register('depositPaymentDate')", 'deposit date')
  assertIncludes(page, 'name="bridePreparation"', 'bride preparation place')
  assertIncludes(page, 'name="groomPreparation"', 'groom preparation place')
  assertIncludes(page, 'name="ceremony"', 'ceremony place')
  assertIncludes(page, 'name="reception"', 'reception place')
  assertIncludes(page, "register('notes')", 'notes')
  assertIncludes(page, 'completeLater: preferQuickCreate', 'checkbox default from ?quick=1')
  assertIncludes(page, "searchParams.get('quick') === '1'", 'first-run quick deep-link')
  assertIncludes(page, 'Panna młoda', 'bride role')
  assertIncludes(page, 'Pan młody', 'groom role')
  assertIncludes(page, 'Imię i nazwisko', 'full name label')
  assertIncludes(page, 'Anna Kowalska', 'bride placeholder')
  assertIncludes(page, 'Michał Nowak', 'groom placeholder')
  assertIncludes(page, 'Dodatkowe dane podam później', 'quick-create copy')
  console.log('PASS  A — four-step fields preserved + identity copy')
}

{
  assertIncludes(page, 'dirtyFields.price', 'dirty price')
  assertIncludes(page, 'priceAutoFilledOnce', 'autofill once')
  assertIncludes(
    page,
    'if (!priceIsDirty || !priceAutoFilledOnce)',
    'autofill gate',
  )
  assertIncludes(page, 'fromCatalog != null && fromCatalog > 0', 'catalog deposit')
  assertIncludes(page, 'Zaliczka już wpłacona?', 'deposit toggle copy')
  assertIncludes(page, "setValue('depositPaid', false)", 'Nie')
  assertIncludes(page, "setValue('depositPaid', true)", 'Tak')
  assertNotIncludes(page, 'price * 0.3', 'no 30%')
  assertNotIncludes(page, '* 0.3', 'no * 0.3')
  assertIncludes(payloadSrc, 'depositAmount: data.depositAmount ?? data.depositAmountCatalog', 'payload deposit')
  assertIncludes(page, 'e.preventDefault()', 'no auto-submit')
  assertIncludes(page, 'Utwórz zlecenie', 'explicit create')
  assertIncludes(page, 'if (data.completeLater) return', 'quick skips package validation')
  assertIncludes(page, "message: 'Wybierz pakiet'", 'full path still requires package')
  console.log('PASS  B — commercial behavior frozen')
}

{
  assertIncludes(page, "from '@/components/ui/Input'", 'shared Input kit')
  assertIncludes(page, 'AddressField', 'AddressField kept')
  assertIncludes(page, 'subscribeVisualViewport', 'keyboard uses existing viewport helper')
  assertIncludes(page, 'setFocus', 'focus first invalid')
  assertIncludes(page, 'autoComplete="name"', 'full-name autocomplete')
  assertIncludes(page, 'inputMode="decimal"', 'numeric keyboard')
  assertNotIncludes(page, 'IconChevronRight', 'no wizard chevron chrome')
  assertNotIncludes(css, '.stepDot', 'no numbered dots')
  assertNotIncludes(css, 'successPulse', 'no success pulse')
  assertNotIncludes(css, 'slideInForward', 'no slide-in card')
  assertNotIncludes(css, 'min-height: 380px', 'no empty card min-height')
  assertNotIncludes(page, 'Krok 1 z 4', 'no duplicated krok kicker')
  console.log('PASS  C — Modern presentation language')
}

{
  assertIncludes(css, 'position: sticky', 'mobile sticky footer')
  assertIncludes(css, 'safe-area-inset-bottom', 'safe area')
  assertIncludes(css, "data-keyboard-open='true'] .footer", 'keyboard hides sticky overlay')
  assertIncludes(css, 'min-height: var(--touch-target)', 'toggle 44px')
  assertIncludes(css, 'max-width: 42rem', 'readable desktop measure')
  assertIncludes(css, '@media (max-width: 767px)', '767 mobile bp')
  assertNotIncludes(css, '\n.input {', 'no local 14px input class')
  console.log('PASS  D — mobile CTA / iOS architecture')
}

{
  const svc = read('src/features/sessions/components/SessionForm.tsx')
  assert(svc.includes('SessionForm'), 'session form exists')
  const sessionPage = read('src/pages/NewSessionPage.tsx')
  assertIncludes(sessionPage, 'SessionForm', 'New Session still uses SessionForm')
  console.log('PASS  E — New Session untouched (spot-check)')
}

{
  const stale = {
    partner1: 'Anna Kowalska',
    partner2: 'Michał Nowak',
    date: '2027-06-12',
    completeLater: true,
    packageId: '7c1eb46a-06ad-41d7-9b63-28124e8c0499',
    packageName: 'Video Standard',
    price: 10500,
    depositPaid: true,
    depositAmount: 1000,
    depositAmountCatalog: 1000,
    depositPaymentDate: '2026-08-20',
    currency: 'PLN',
    accentColor: '#000',
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Pałac',
    notes: 'stale note',
    partner1Phone: '500111222',
    partner2Phone: '501222333',
    email: 'para@example.com',
    partner1Address: 'ul. Kwiatowa 8',
    partner1PostalCode: '00-001',
    partner1City: 'Warszawa',
    extras: [{ extraServiceId: 'ex-1', name: 'Dron', priceSnapshot: 900 }],
    contractAddress: {
      formattedAddress: 'ul. Kwiatowa 8, 00-001 Warszawa',
      placeId: 'ChIJ-stale',
    },
    bridePreparation: { formattedAddress: 'A', placeId: 'p1' },
    ceremony: { formattedAddress: 'Kościół', placeId: 'p2' },
  }
  const quick = buildNewWeddingCreatePayload(
    stale as Parameters<typeof buildNewWeddingCreatePayload>[0],
  )
  assertEq(quick.partner1, 'Anna Kowalska', 'quick bride')
  assertEq(quick.partner2, 'Michał Nowak', 'quick groom')
  assertEq(quick.date, '2027-06-12', 'quick date')
  assertEq(quick.packageId, null, 'quick packageId null')
  assertEq(quick.packageName, '', 'quick packageName empty')
  assertEq(quick.price, 0, 'quick price 0')
  assertEq(quick.depositPaid, false, 'quick depositPaid false')
  assertEq(quick.depositAmount, undefined, 'quick no deposit amount')
  assertEq(quick.depositPaymentDate, undefined, 'quick no deposit date')
  assertEq(quick.ceremonyLocation, undefined, 'quick no ceremony')
  assertEq(quick.receptionLocation, undefined, 'quick no reception')
  assertEq(quick.notes, undefined, 'quick no notes')
  assertEq(quick.currency, undefined, 'quick no currency leak')
  assertEq(quick.phone, undefined, 'quick no phone')
  assertEq(quick.email, undefined, 'quick no email')
  assertEq(quick.partner2Phone, undefined, 'quick no groom phone')
  assertEq(quick.partner1Address, undefined, 'quick no address')
  assertEq(quick.partner1PostalCode, undefined, 'quick no postal')
  assertEq(quick.partner1City, undefined, 'quick no city')
  assertEq(
    JSON.stringify(quick).includes('ChIJ-stale'),
    false,
    'quick AddressField metadata cannot leak',
  )
  console.log('PASS  F — stale full-path state cannot leak into quick create')
}

{
  const full = buildNewWeddingCreatePayload({
    partner1: 'Anna Kowalska',
    partner2: 'Michał Nowak',
    date: '2027-06-12',
    completeLater: false,
    packageId: 'pkg-1',
    packageName: 'Video Standard',
    price: 10500,
    depositPaid: true,
    depositAmount: 1000,
    depositAmountCatalog: 800,
    depositPaymentDate: '2026-08-20',
    currency: 'PLN',
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Pałac',
    notes: 'ok',
  })
  assertEq(full.packageId, 'pkg-1', 'full package kept')
  assertEq(full.packageName, 'Video Standard', 'full package name')
  assertEq(full.price, 10500, 'full price kept')
  assertEq(full.depositPaid, true, 'full deposit kept')
  assertEq(full.depositAmount, 1000, 'full deposit amount')
  assertEq(full.ceremonyLocation, 'Kościół', 'full ceremony')
  assertEq(full.notes, 'ok', 'full notes')
  console.log('PASS  G — full-path payload still uses form commercial values')
}

{
  assertIncludes(page, 'buildNewWeddingCreatePayload', 'page uses sanitizer')
  assertNotIncludes(page, 'persistWeddingContractAnswerFields', 'no form-answer persist')
  assertNotIncludes(page, 'createFormInstance', 'no form instance')
  assertNotIncludes(payloadSrc, 'persistWeddingContractAnswerFields', 'payload no questionnaire')
  assertIncludes(page, 'Pozostałe dane uzupełnisz później.', 'quiet confirmation copy')
  assertIncludes(page, '{step + 1} / {pathSteps.length}', 'progress uses selected path length')
  console.log('PASS  H — questionnaire not submitted on create; quick UX copy')
}

{
  assertIncludes(inputCss, ".control[type='date']", 'date control selector')
  assertIncludes(inputCss, 'min-width: 0', 'shrink min-width')
  assertIncludes(inputCss, 'max-width: 100%', 'shrink max-width')
  assertIncludes(inputCss, 'box-sizing: border-box', 'box-sizing')
  assertIncludes(inputCss, '::-webkit-datetime-edit', 'webkit datetime edit')
  assertIncludes(inputCss, '::-webkit-date-and-time-value', 'webkit date value')
  assertIncludes(inputCss, '::-webkit-calendar-picker-indicator', 'webkit calendar indicator')
  assertIncludes(inputCss, '-webkit-appearance: none', 'webkit appearance none')
  assertNotIncludes(page, 'custom date picker', 'no custom picker comment')
  assertIncludes(page, 'type="date"', 'native date kept')
  console.log('PASS  I — Safari date shrink-safe CSS')
}

{
  assertIncludes(page, 'key={step}', 'body remounts on step change only')
  assertNotIncludes(
    page,
    'key={`${completeLater',
    'completeLater must not remount Step 1',
  )
  assertNotIncludes(page, 'autoFocus', 'partner1 has no autoFocus')
  const clamp = page.slice(
    page.indexOf('if (completeLater && step > 1)'),
    page.indexOf('if (completeLater && step > 1)') + 80,
  )
  assertIncludes(clamp, 'setStep(1)', 'clamp step when switching path late')
  assertNotIncludes(clamp, 'setFocus', 'toggle clamp does not setFocus')
  assertNotIncludes(clamp, 'trigger(', 'toggle clamp does not trigger validation')

  const goNext = page.slice(page.indexOf('async function goNext()'), page.indexOf('function goBack()'))
  assertIncludes(goNext, 'trigger(name)', 'Dalej still validates')
  assertIncludes(goNext, 'focusFirstInvalid(names)', 'Dalej still focuses first invalid')
  assertIncludes(page, 'setFocus(first)', 'validation still uses setFocus')
  assertIncludes(page, '{step + 1} / {pathSteps.length}', 'progress still path-aware')
  console.log('PASS  J — checkbox toggle does not steal focus; Dalej validation focus kept')
}

console.log('OK  newWeddingModernAcceptance')
