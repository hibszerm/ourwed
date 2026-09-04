/**
 * Phase 3 — Full Create UI wired into Modern New Wedding.
 * Run: npm run test:new-wedding-full-create
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildNewWeddingCreatePayload } from './buildNewWeddingCreatePayload'
import { buildFullWeddingCreateInput } from './buildFullWeddingCreateInput'
import {
  formatContractAddressEditorial,
  mergeContractAddressForStorage,
} from './contractAddressFromField'
import { computeWeddingContractValue } from '@/lib/forms/weddingExtraPricing'

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
const builderSrc = read('src/features/weddings/buildFullWeddingCreateInput.ts')
const orchSrc = read('src/features/weddings/createFullWedding.ts')

const ceremonyPlace = {
  formattedAddress: 'Kościół Mariacki, Kraków',
  placeId: 'google:abc',
  name: 'Kościół Mariacki',
  latitude: 50.0614,
  longitude: 19.9373,
}

function fullForm(overrides: Record<string, unknown> = {}) {
  return {
    partner1: 'Anna Kowalska',
    partner2: 'Michał Nowak',
    date: '2027-06-12',
    partner1Phone: '500111222',
    partner2Phone: '501222333',
    email: 'para@example.com',
    contractAddress: 'ul. Kwiatowa 8',
    partner1PostalCode: '00-001',
    partner1City: 'Warszawa',
    packageId: 'pkg-1',
    packageName: 'Video Standard',
    price: 10500,
    depositPaid: false,
    extras: [] as Array<{ extraServiceId: string; name: string; priceSnapshot: number }>,
    ...overrides,
  }
}

{
  assertIncludes(page, 'QUICK_STEPS', 'A — quick 2-step')
  assertIncludes(page, 'FULL_STEPS', 'H — full 4-step')
  assertIncludes(page, "label: 'Miejsca'", 'H — step 3 Miejsca')
  assertEq(page.includes("label: 'Lokalizacja'"), false, 'H — old Lokalizacja label gone')
  assertIncludes(page, 'QUICK_STEP_0_FIELDS', 'B — quick step 0 field list')
  assertIncludes(page, "completeLater ? QUICK_STEP_0_FIELDS : FULL_STEP_0_FIELDS", 'B/M — path-aware step 1')
  assertIncludes(page, 'key={step}', 'C — remount on step only')
  assertNotIncludes(page, 'autoFocus', 'C — no autoFocus')
  assertIncludes(page, 'if (data.completeLater) return', 'D — quick skips package required')
  assertIncludes(page, "message: 'Wybierz pakiet'", 'P — package required on full')
  assertIncludes(page, 'useCreateWedding', 'E/AK — simple create hook')
  assertIncludes(page, 'useCreateFullWedding', 'AL — full hook')
  assertIncludes(
    page,
    '? await createWedding.mutateAsync(buildNewWeddingCreatePayload(data))',
    'E/F/AK — Quick Create simple mutation',
  )
  assertIncludes(
    page,
    'await createFullWedding.mutateAsync(',
    'AL — Full Create orchestration mutation',
  )
  assertIncludes(page, 'Do not route Quick through createFullWedding', 'F — explicit comment')
  console.log('PASS  A–F / H / AK–AL — Quick vs Full branching')
}

{
  const stale = {
    partner1: 'Anna Kowalska',
    partner2: 'Michał Nowak',
    date: '2027-06-12',
    completeLater: true,
    packageId: 'pkg-1',
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
    contractAddress: {
      formattedAddress: 'ul. Kwiatowa 8, 00-001 Warszawa',
      placeId: 'ChIJ-stale-contract',
      latitude: 52.2,
      longitude: 21.0,
    },
    partner1PostalCode: '00-001',
    partner1City: 'Warszawa',
    extras: [{ extraServiceId: 'ex-1', name: 'Dron', priceSnapshot: 900 }],
    bridePreparation: ceremonyPlace,
    ceremony: ceremonyPlace,
  }
  const quick = buildNewWeddingCreatePayload(
    stale as Parameters<typeof buildNewWeddingCreatePayload>[0],
  )
  assertEq(quick.partner1, 'Anna Kowalska', 'G bride')
  assertEq(quick.partner2, 'Michał Nowak', 'G groom')
  assertEq(quick.date, '2027-06-12', 'G date')
  assertEq(quick.packageId, null, 'G no package')
  assertEq(quick.price, 0, 'G no price')
  assertEq(quick.depositPaid, false, 'G no deposit')
  assertEq(quick.phone, undefined, 'G no bride phone')
  assertEq(quick.email, undefined, 'G no email')
  assertEq(quick.partner2Phone, undefined, 'G no groom phone')
  assertEq(quick.partner1Address, undefined, 'G no address')
  assertEq(quick.partner1PostalCode, undefined, 'G no postal')
  assertEq(quick.partner1City, undefined, 'G no city')
  assertEq(quick.ceremonyLocation, undefined, 'G no ceremony')
  assertEq(quick.notes, undefined, 'G no notes')
  assertEq(
    Object.prototype.hasOwnProperty.call(quick, 'extras'),
    false,
    'G extras must not leak',
  )
  console.log('PASS  G — expanded stale Full state sanitized on Quick Create')
}

{
  assertIncludes(page, "register('partner1Phone')", 'I — bride phone')
  assertIncludes(page, "register('partner2Phone')", 'J — groom phone')
  assertIncludes(page, "register('email')", 'K — email')
  assertIncludes(page, 'name="contractAddress"', 'L — AddressField contract address')
  assertIncludes(page, "register('partner1PostalCode')", 'L — postal')
  assertIncludes(page, "register('partner1City')", 'L — city')
  assertIncludes(page, 'Adres do umowy', 'L — contract address copy')
  assertNotIncludes(page, "register('partner1Address')", 'L — street is no longer a raw Input')
  assertNotIncludes(page, 'korespondencja', 'K — email is not correspondence')
  assertIncludes(page, 'type="tel"', 'N — tel')
  assertIncludes(page, 'inputMode="tel"', 'N — tel inputMode')
  assertIncludes(page, 'type="email"', 'N — email')
  assertIncludes(page, 'inputMode="email"', 'N — email inputMode')
  assertIncludes(page, "from '@/components/ui/Input'", 'N — shared Input')
  assertIncludes(page, 'type="date"', 'O — native date')
  assertIncludes(page, 'FULL_STEP_0_FIELDS', 'M — full required names')
  assertIncludes(page, "'partner1Phone'", 'M — full requires bride phone')
  assertIncludes(page, 'conceal', 'C — hide extra fields without remount')
  console.log('PASS  I–O — Full Step 1 fields + mobile controls')
}

{
  assertIncludes(page, 'dirtyFields.price', 'R — dirty price')
  assertIncludes(page, 'priceAutoFilledOnce', 'Q — autofill once')
  assertIncludes(page, 'if (!priceIsDirty || !priceAutoFilledOnce)', 'Q — autofill gate')
  assertIncludes(page, 'Zaliczka już wpłacona?', 'S — deposit copy')
  assertIncludes(page, "setValue('depositPaid', false)", 'S — Nie')
  assertIncludes(page, "setValue('depositPaid', true)", 'S — Tak')
  assertIncludes(
    page,
    'Tak rejestruje otrzymaną wpłatę przy utworzeniu zlecenia.',
    'T — actual payment semantics',
  )
  assertNotIncludes(page, 'price * 0.3', 'T — no 30%')
  assertIncludes(page, "queryKey: ['studio-extra-services', userId, 'active']", 'U — extras catalog')
  assertIncludes(page, 'extraServiceService.list({ activeOnly: true })', 'U — active extras')
  assertIncludes(page, 'Możesz pominąć ten krok.', 'V — zero extras allowed')
  assertIncludes(page, 'availableExtras', 'W — add from remaining catalog')
  assertIncludes(
    page,
    'selectedExtras.some((extra) => extra.extraServiceId === service.id)',
    'X — duplicate extra prevented',
  )
  assertIncludes(page, 'function removeExtra', 'Y — extra removable')
  assertIncludes(page, 'Usuń', 'Y — remove copy')
  assertIncludes(page, 'computeWeddingContractValue', '13 — preview uses helper')
  assertNotIncludes(page, 'values.price +', '13 — no ad-hoc price + extras')
  console.log('PASS  P–Y — package, extras, deposit')
}

{
  assertIncludes(page, 'Przygotowania panny młodej', 'Z — bride prep')
  assertIncludes(page, 'Przygotowania pana młodego', 'Z — groom prep')
  assertIncludes(page, 'Ceremonia', 'Z — ceremony')
  assertIncludes(page, 'Przyjęcie', 'Z — reception')
  assertIncludes(page, 'placeholder="Opcjonalnie"', 'AA — places optional')
  assertIncludes(page, 'if (index === 2) return []', 'AA — step 3 not required')
  assertIncludes(page, 'value={field.value || \'\'}', 'AB — AddressField keeps object value')
  assertNotIncludes(page, 'JSON.stringify', 'AB — not collapsed to JSON string')
  assertNotIncludes(page, 'ceremonyLocation', 'AD/17 — no venue scalar as source of truth')
  assertNotIncludes(page, 'geocode', 'AC — no geocode from page')
  assertNotIncludes(page, 'computeRoute', 'AC — no route from page')
  assertNotIncludes(page, 'googleRoutes', 'AC — no routes provider from page')
  console.log('PASS  Z–AD — four optional places + GeoPlace state')
}

{
  assertIncludes(page, 'Telefon panny', 'AE — bride phone summary')
  assertIncludes(page, 'Telefon pana', 'AE — groom phone summary')
  assertIncludes(page, 'Email', 'AE — email summary')
  assertIncludes(page, 'formatContractAddressEditorial', 'AE — address summary')
  assertIncludes(page, 'Usługi', 'AF — extras summary')
  assertIncludes(page, 'Przygotowania panny młodej', 'AG — four locations represented')
  assertNotIncludes(page, 'Gotowe do umowy', 'AH — no fake readiness')
  assertNotIncludes(page, 'Dane kompletne', 'AH — no complete badge')
  assertNotIncludes(page, 'Contract ready', 'AH — no contract ready')
  assertIncludes(page, 'Utwórz zlecenie', 'AI — explicit create')
  assertIncludes(page, 'e.preventDefault()', 'AJ — no auto-submit')
  assertIncludes(page, 'if (!isLastStep) return', 'AJ — create gated to last step')
  console.log('PASS  AE–AJ — Full Step 4 summary')
}

{
  const dirty = buildFullWeddingCreateInput(
    fullForm({
      price: 11000,
      extras: [{ extraServiceId: 'ex-drone', name: 'Dron', priceSnapshot: 900 }],
      bridePreparation: ceremonyPlace,
      groomPreparation: '',
      ceremony: ceremonyPlace,
      reception: { formattedAddress: 'Pałac', placeId: 'google:rec' },
    }),
    { priceIsDirty: true },
  )
  assertEq(dirty.wedding.partner1, 'Anna Kowalska', 'AM — bride')
  assertEq(dirty.wedding.phone, '500111222', 'AM — bride phone')
  assertEq(dirty.wedding.partner2Phone, '501222333', 'AM — groom phone')
  assertEq(dirty.wedding.email, 'para@example.com', 'AM — email')
  assertEq(dirty.wedding.partner1Address, 'ul. Kwiatowa 8', 'AM — address')
  assertEq(dirty.wedding.partner1PostalCode, '00-001', 'AM — postal')
  assertEq(dirty.wedding.partner1City, 'Warszawa', 'AM — city')
  assertEq(dirty.explicitPackagePrice, 11000, 'AP — explicitPackagePrice')
  assertEq(dirty.wedding.creationOptions?.preserveImportedPrice, true, 'AP — dirty preserves price')
  assertEq(dirty.extras?.[0]?.extraServiceId, 'ex-drone', 'AO — extra id')
  assertEq(dirty.extras?.[0]?.priceSnapshot, 900, 'AO — extra snapshot')
  assertEq(dirty.extras?.[0]?.quantity, 1, 'AO — quantity 1')
  assertEq(
    (dirty.places?.ceremony as { placeId?: string }).placeId,
    'google:abc',
    'AN/AB — GeoPlace placeId retained',
  )
  assertEq(
    (dirty.places?.ceremony as { latitude?: number }).latitude,
    50.0614,
    'AN — lat retained',
  )
  assertEq(dirty.places?.groomPreparation, undefined, 'AN — empty place omitted')
  assertEq(
    Object.prototype.hasOwnProperty.call(dirty.wedding, 'ceremonyLocation'),
    false,
    '17 — no ceremonyLocation on Full Create wedding',
  )

  const clean = buildFullWeddingCreateInput(fullForm({ price: 10500 }), {
    priceIsDirty: false,
  })
  assertEq(clean.explicitPackagePrice, 10500, 'AP — catalog price still passed')
  assertEq(clean.wedding.creationOptions, undefined, 'AP — not dirty, no preserve flag')

  const preview = computeWeddingContractValue({
    packageBasePrice: 11000,
    extras: [{ priceSnapshot: 900, quantity: 1 }],
    effectiveTravelFee: 0,
  })
  assertEq(preview, 11900, '14 — 11000 + 900 preview via helper')
  console.log('PASS  AM–AP — Full Create payload + manual price')
}

{
  assertNotIncludes(page, 'persistWeddingContractAnswerFields', 'AQ — no persist')
  assertNotIncludes(page, 'createFormInstance', 'AQ — no form_instance')
  assertNotIncludes(builderSrc, 'persistWeddingContractAnswerFields', 'AQ — builder no persist')
  assertNotIncludes(orchSrc, 'persistWeddingContractAnswerFields', 'AQ — orch no persist')
  console.log('PASS  AQ — questionnaire lifecycle untouched')
}

{
  assertIncludes(page, 'isFullCreatePartialError', 'AR — typed partial error')
  assertIncludes(
    page,
    'Zlecenie zostało utworzone, ale nie udało się zapisać wszystkich danych.',
    'AS — wedding exists copy',
  )
  assertIncludes(page, 'Nie udało się utworzyć ślubu.', 'AR — base create failure separate')
  assertIncludes(page, 'err.weddingId', 'AT — weddingId retained')
  assertNotIncludes(page, 'weddingService.delete', 'AU — no delete')
  const catchBlock = page.slice(
    page.indexOf('if (isFullCreatePartialError(err))'),
    page.indexOf("getUserFacingErrorMessage(err, 'Nie udało się utworzyć ślubu.')"),
  )
  assertNotIncludes(catchBlock, 'createFullWedding.mutateAsync', 'AV — no automatic retry')
  assertNotIncludes(catchBlock, 'createWedding.mutateAsync', 'AV — no retry simple create')
  assertIncludes(catchBlock, 'navigate(`/sluby/${err.weddingId}`)', 'AT — open created wedding')
  console.log('PASS  AR–AV — partial failure UX')
}

{
  assertIncludes(css, 'position: sticky', '27 — sticky footer')
  assertIncludes(css, 'safe-area-inset-bottom', '27 — safe area')
  assertIncludes(css, "data-keyboard-open='true'] .footer", '27 — keyboard unstick')
  assertIncludes(css, 'min-height: var(--touch-target)', '27 — 44px')
  assertIncludes(css, 'max-width: 42rem', '30 — desktop column')
  assertNotIncludes(css, 'stepDot', '2 — no dots')
  console.log('PASS  mobile footer / desktop column')
}

{
  const google = {
    formattedAddress: 'Testowa 12, 40-001 Katowice, Poland',
    placeId: 'ChIJ-secret',
    provider: 'google' as const,
    street: 'Testowa',
    buildingNumber: '12',
    postalCode: '40-001',
    city: 'Katowice',
    latitude: 50.2649,
    longitude: 19.0238,
  }
  const mapped = mergeContractAddressForStorage(google)
  assertEq(mapped.partner1Address, 'Testowa 12', 'I — street line without postal')
  assertEq(mapped.partner1PostalCode, '40-001', 'I — postal from NormalizedAddress')
  assertEq(mapped.partner1City, 'Katowice', 'I — city from NormalizedAddress')
  assertEq(
    Object.prototype.hasOwnProperty.call(mapped, 'placeId'),
    false,
    'I — placeId not stored on party columns',
  )

  const created = buildFullWeddingCreateInput(
    fullForm({ contractAddress: google, partner1PostalCode: '', partner1City: '' }),
    { priceIsDirty: false },
  )
  assertEq(created.wedding.partner1Address, 'Testowa 12', 'I — stored street')
  assertEq(created.wedding.partner1PostalCode, '40-001', 'I — stored postal')
  assertEq(created.wedding.partner1City, 'Katowice', 'I — stored city')
  assertEq(
    JSON.stringify(created.wedding).includes('ChIJ-secret'),
    false,
    'I — Google placeId does not leak into wedding create payload',
  )
  assertEq(
    JSON.stringify(created.wedding).includes('50.2649'),
    false,
    'I — coordinates do not leak into party payload',
  )

  const editorial = formatContractAddressEditorial(google)
  assertEq(editorial.includes('40-001'), true, 'L — editorial includes postal')
  assertEq(editorial.includes('Katowice'), true, 'L — editorial includes city')
  assertEq(editorial.includes('ChIJ'), false, 'L — no placeId in Step 4')
  assertEq(editorial.includes('50.2649'), false, 'L — no lat in Step 4')
  console.log('PASS  I/L — Google NormalizedAddress maps to contract party columns')
}

{
  const manual = buildFullWeddingCreateInput(
    fullForm({
      contractAddress: 'Testowa 12',
      partner1PostalCode: '40-001',
      partner1City: 'Katowice',
    }),
    { priceIsDirty: false },
  )
  assertEq(manual.wedding.partner1Address, 'Testowa 12', 'J — manual street')
  assertEq(manual.wedding.partner1PostalCode, '40-001', 'J — fallback postal')
  assertEq(manual.wedding.partner1City, 'Katowice', 'J — fallback city')
  assertEq(
    JSON.stringify(manual.wedding).includes('placeId'),
    false,
    'J — manual path does not require GeoPlace',
  )
  console.log('PASS  J — manual AddressField fallback remains creatable')
}

{
  const addressField = read('src/features/forms/AddressField.tsx')
  const addressCount = page.split('<AddressField\n').length - 1
  assertEq(addressCount, 5, 'M/N — four places + one contract AddressField')
  assertIncludes(page, 'name="bridePreparation"', 'M — bride place unchanged')
  assertIncludes(page, 'name="groomPreparation"', 'M — groom place unchanged')
  assertIncludes(page, 'name="ceremony"', 'M — ceremony place unchanged')
  assertIncludes(page, 'name="reception"', 'M — reception place unchanged')
  assertIncludes(addressField, 'MobileFieldDialog', 'N — shared mobile dialog')
  assertIncludes(addressField, 'Użyj wpisanego adresu', 'J — manual fallback preserved')
  assertNotIncludes(page, 'createDefaultAddressAutocompleteProvider', 'A — no provider from page')
  assertNotIncludes(page, 'places-proxy', 'A — no Google proxy from page')
  assertNotIncludes(page, 'mapGooglePlaceToNormalized', 'A — no geocode mapping from page')
  assertNotIncludes(builderSrc, "role: 'contract'", 'storage — no wedding_places contract role')
  console.log('PASS  M/N — shared AddressField architecture, places unchanged')
}

console.log('OK  newWeddingFullCreateUiAcceptance')
