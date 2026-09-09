/**
 * A1 + A2 commercial integrity acceptance.
 * Manual CV rebasing + preserve financial agreement on package change.
 *
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/utils/commercialIntegrityA1A2Acceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyCommercialPackageSnapshot,
  fillWeddingTermsFromCatalogPackage,
} from '@/lib/utils/commercial'
import {
  rebaseEffectivePackageBase,
  recomposeContractValueForExtrasEdit,
  computeWeddingContractValue,
  sumExtraPriceSnapshots,
} from '@/lib/forms/weddingExtraPricing'
import { createWeddingEditDraft } from '@/features/weddings/edit/persistWeddingEditDraft'
import { requiresAgreedDepositConfirmOnPackageDefaults } from '@/lib/finance/hasPaidDepositPayment'
import { getEffectiveTravelFeeAmount } from '@/lib/utils/travelFeeCommercial'
import { buildReferenceStudioPackage, buildReferenceWedding } from '@/lib/dev/referenceWedding'
import type { WeddingExtraService } from '@/types/package'
import type { Payment, Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
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

function extra(
  priceSnapshot: number,
  quantity = 1,
  id = `e-${priceSnapshot}-${quantity}`,
): WeddingExtraService {
  return {
    id,
    weddingId: 'w',
    extraServiceId: `svc-${id}`,
    name: id,
    nameSnapshot: id,
    priceSnapshot,
    quantity,
    createdAt: '2026-01-01',
  }
}

/** Simulate PackageFields / FinanceFields manual CV edit + later extras delta. */
function afterManualCv(input: {
  wedding: Wedding
  extras: WeddingExtraService[]
  enteredCv: number
}): { wedding: Wedding; packageBasePrice: number; extras: WeddingExtraService[] } {
  const extrasTotal = sumExtraPriceSnapshots(input.extras)
  const travel = getEffectiveTravelFeeAmount(input.wedding)
  const packageBasePrice = rebaseEffectivePackageBase({
    contractValue: input.enteredCv,
    extrasTotal,
    effectiveTravel: travel,
  })
  return {
    wedding: { ...input.wedding, price: input.enteredCv },
    packageBasePrice,
    extras: input.extras,
  }
}

function applyExtrasEdit(input: {
  wedding: Wedding
  extrasBefore: WeddingExtraService[]
  extrasAfter: WeddingExtraService[]
  packageBasePrice: number
}): { wedding: Wedding; extras: WeddingExtraService[]; packageBasePrice: number } {
  const price = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: input.wedding.price,
    extrasBefore: input.extrasBefore,
    extrasAfter: input.extrasAfter,
    effectiveTravelFee: getEffectiveTravelFeeAmount(input.wedding),
    packageBasePrice: input.packageBasePrice,
  })
  return {
    wedding: { ...input.wedding, price },
    extras: input.extrasAfter,
    packageBasePrice: input.packageBasePrice,
  }
}

run('A1-1 manual CV 15000 + extra 900 → 15900', () => {
  const wedding = buildReferenceWedding({
    price: 12000,
    travelFeeStatus: 'unresolved',
    travelFeeAmount: 0,
  })
  let state = afterManualCv({ wedding, extras: [], enteredCv: 15000 })
  assertEq(state.packageBasePrice, 15000, 'base after manual')
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: state.extras,
    extrasAfter: [extra(900, 1, 'vhs')],
    packageBasePrice: state.packageBasePrice,
  })
  assertEq(state.wedding.price, 15900, 'A1-1')
})

run('A1-2 remove extra → 15000', () => {
  const wedding = buildReferenceWedding({
    price: 12000,
    travelFeeStatus: 'unresolved',
    travelFeeAmount: 0,
  })
  let state = afterManualCv({ wedding, extras: [], enteredCv: 15000 })
  const withExtra = [extra(900, 1, 'vhs')]
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: [],
    extrasAfter: withExtra,
    packageBasePrice: state.packageBasePrice,
  })
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: withExtra,
    extrasAfter: [],
    packageBasePrice: state.packageBasePrice,
  })
  assertEq(state.wedding.price, 15000, 'A1-2')
})

run('A1-3 manual CV below nominal stays 13000', () => {
  const extras = [extra(2000, 1, 'bundle')]
  const wedding = buildReferenceWedding({
    price: 15000,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  // Catalog base 12k + extras 2k + travel 1k = 15k nominal
  const state = afterManualCv({ wedding, extras, enteredCv: 13000 })
  assertEq(state.wedding.price, 13000, 'CV stays')
  assertEq(state.packageBasePrice, 10000, 'effective base')
  assertEq(
    computeWeddingContractValue({
      packageBasePrice: state.packageBasePrice,
      extras,
      effectiveTravelFee: 1000,
    }),
    13000,
    'composition holds',
  )
})

run('A1-4 after below-nominal +900 → 13900', () => {
  const extras = [extra(2000, 1, 'bundle')]
  const wedding = buildReferenceWedding({
    price: 15000,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  let state = afterManualCv({ wedding, extras, enteredCv: 13000 })
  const next = [...extras, extra(900, 1, 'vhs')]
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: extras,
    extrasAfter: next,
    packageBasePrice: state.packageBasePrice,
  })
  assertEq(state.wedding.price, 13900, 'A1-4')
})

run('A1-5 remove +900 → 13000', () => {
  const extras = [extra(2000, 1, 'bundle')]
  const wedding = buildReferenceWedding({
    price: 15000,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  let state = afterManualCv({ wedding, extras, enteredCv: 13000 })
  const withVhs = [...extras, extra(900, 1, 'vhs')]
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: extras,
    extrasAfter: withVhs,
    packageBasePrice: state.packageBasePrice,
  })
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: withVhs,
    extrasAfter: extras,
    packageBasePrice: state.packageBasePrice,
  })
  assertEq(state.wedding.price, 13000, 'A1-5')
})

run('A1-6 charged travel preserved (delta only +900)', () => {
  const extras = [extra(2000, 1, 'bundle')]
  const wedding = buildReferenceWedding({
    price: 13000,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  let state = afterManualCv({ wedding, extras, enteredCv: 13000 })
  const next = [...extras, extra(900, 1, 'vhs')]
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: extras,
    extrasAfter: next,
    packageBasePrice: state.packageBasePrice,
  })
  assertEq(state.wedding.price, 13900, 'not +100 travel regression')
  assertEq(getEffectiveTravelFeeAmount(state.wedding), 1000, 'travel still charged')
})

run('A1-7 included travel treated as 0 in rebase', () => {
  const extras = [extra(2000, 1, 'x')]
  const wedding = buildReferenceWedding({
    price: 14000,
    travelFeeStatus: 'included',
    travelFeeAmount: 1000, // metadata may exist; commercially 0
  })
  assertEq(getEffectiveTravelFeeAmount(wedding), 0, 'effective travel')
  const state = afterManualCv({ wedding, extras, enteredCv: 13000 })
  assertEq(state.packageBasePrice, 11000, 'does not subtract included amount')
})

run('A1-8 unresolved travel treated as 0 in rebase', () => {
  const extras = [extra(2000, 1, 'x')]
  const wedding = buildReferenceWedding({
    price: 14000,
    travelFeeStatus: 'unresolved',
    travelFeeAmount: 800,
  })
  assertEq(getEffectiveTravelFeeAmount(wedding), 0, 'effective travel')
  const state = afterManualCv({ wedding, extras, enteredCv: 13000 })
  assertEq(state.packageBasePrice, 11000, 'does not subtract unresolved amount')
})

run('A1-9 sequential extras mutations', () => {
  const vhs = extra(900, 1, 'vhs')
  const drone = extra(500, 1, 'drone')
  const wedding = buildReferenceWedding({
    price: 15000,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  let state = afterManualCv({
    wedding,
    extras: [vhs, drone],
    enteredCv: 13000,
  })
  assertEq(state.packageBasePrice, 10600, 'base 13000-900-500-1000')
  // Increase VHS qty → +900
  const vhs2 = { ...vhs, quantity: 2 }
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: [vhs, drone],
    extrasAfter: [vhs2, drone],
    packageBasePrice: state.packageBasePrice,
  })
  assertEq(state.wedding.price, 13900, 'after VHS qty')
  // Remove drone −500
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: [vhs2, drone],
    extrasAfter: [vhs2],
    packageBasePrice: state.packageBasePrice,
  })
  assertEq(state.wedding.price, 13400, 'after remove drone')
})

run('A1-10 save/reload draft reconstruction', () => {
  const extras = [extra(2000, 1, 'bundle')]
  const wedding = buildReferenceWedding({
    price: 13000,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  const afterEdit = afterManualCv({ wedding, extras, enteredCv: 13000 })
  const draft = createWeddingEditDraft({
    wedding: afterEdit.wedding,
    contacts: [],
    extras,
    tasks: [],
  })
  assertEq(draft.packageBasePrice, 10000, 'reload base')
  const next = applyExtrasEdit({
    wedding: draft.wedding,
    extrasBefore: extras,
    extrasAfter: [...extras, extra(900, 1, 'vhs')],
    packageBasePrice: draft.packageBasePrice,
  })
  assertEq(next.wedding.price, 13900, 'after reload +extra')
})

run('A1-11 FinanceFields direct CV edit rebases base (source)', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/fields/FinanceFields.tsx',
    ),
    'utf8',
  )
  assert(src.includes('rebaseEffectivePackageBase'), 'FinanceFields rebase')
  assert(src.includes('applyManualContractValue'), 'FinanceFields helper')
  assert(src.includes('onChangePackageBasePrice'), 'FinanceFields callback')
})

run('A1-12 PackageFields direct CV edit rebases base (source)', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/fields/PackageFields.tsx',
    ),
    'utf8',
  )
  assert(src.includes('rebaseEffectivePackageBase'), 'PackageFields rebase')
  assert(src.includes('applyManualContractValue'), 'PackageFields helper')
  assert(src.includes('requiresAgreedDepositConfirmOnPackageDefaults'), 'paid deposit gate')
  assert(src.includes('Zmiana zaliczki'), 'deposit confirm copy')
  assert(src.includes('preserveDeposit: true'), 'fill catalog preserve deposit')
})

run('A1-13 WeddingDetailPackage parity if reachable (source)', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailPackage.tsx',
    ),
    'utf8',
  )
  assert(src.includes('rebaseEffectivePackageBase'), 'DetailPackage rebase')
  assert(src.includes('applyManualContractValue'), 'DetailPackage CV')
  assert(src.includes('preserveDeposit: true'), 'DetailPackage fill preserve')
  assert(src.includes('preserveDeposit: preserveFinancialAgreement'), 'preserve deposit on package change')
})

run('A1-14 negative effective base allowed', () => {
  const extras = [extra(2000, 1, 'bundle')]
  const wedding = buildReferenceWedding({
    price: 15000,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  const state = afterManualCv({ wedding, extras, enteredCv: 2500 })
  assertEq(state.wedding.price, 2500, 'CV stays')
  assertEq(state.packageBasePrice, -500, 'negative effective base')
})

run('A1-15 future extra delta from negative base', () => {
  const extras = [extra(2000, 1, 'bundle')]
  const wedding = buildReferenceWedding({
    price: 15000,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  let state = afterManualCv({ wedding, extras, enteredCv: 2500 })
  const withVhs = [...extras, extra(900, 1, 'vhs')]
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: extras,
    extrasAfter: withVhs,
    packageBasePrice: state.packageBasePrice,
  })
  assertEq(state.wedding.price, 3400, 'A1-15 +900')
  state = applyExtrasEdit({
    wedding: state.wedding,
    extrasBefore: withVhs,
    extrasAfter: extras,
    packageBasePrice: state.packageBasePrice,
  })
  assertEq(state.wedding.price, 2500, 'A1-15 remove')
})

run('A1-16 reload reconstructs negative base', () => {
  const extras = [extra(2000, 1, 'bundle')]
  const wedding = buildReferenceWedding({
    price: 2500,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  const draft = createWeddingEditDraft({
    wedding,
    contacts: [],
    extras,
    tasks: [],
  })
  assertEq(draft.packageBasePrice, -500, 'reload negative base')
  const next = applyExtrasEdit({
    wedding: draft.wedding,
    extrasBefore: extras,
    extrasAfter: [...extras, extra(900, 1, 'vhs')],
    packageBasePrice: draft.packageBasePrice,
  })
  assertEq(next.wedding.price, 3400, 'not 3900 from zero clamp')
})

run('A1-17 catalog package price unchanged by manual CV rebase', () => {
  const pkg = buildReferenceStudioPackage()
  const frozenCatalogPrice = pkg.price
  const extras = [extra(2000, 1, 'bundle')]
  const wedding = buildReferenceWedding({
    price: 15000,
    travelFeeStatus: 'charged',
    travelFeeAmount: 1000,
  })
  afterManualCv({ wedding, extras, enteredCv: 2500 })
  assertEq(pkg.price, frozenCatalogPrice, 'StudioPackage.price untouched')
  assertEq(
    buildReferenceStudioPackage().price,
    frozenCatalogPrice,
    'catalog builder still at catalog price',
  )
})

run('A1 rebaseEffectivePackageBase has no zero clamp (source)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/forms/weddingExtraPricing.ts'),
    'utf8',
  )
  const fnStart = src.indexOf('export function rebaseEffectivePackageBase')
  const fnEnd = src.indexOf('export function resolvePackageBasePrice')
  const body = src.slice(fnStart, fnEnd)
  assert(
    body.includes('return cv - extras - travel'),
    'rebase returns raw difference',
  )
  assert(!body.includes('Math.max(0, cv'), 'no zero clamp on rebase result')
})

run('A2-1 PRESERVE keeps CV and deposit', () => {
  const pkg = {
    ...buildReferenceStudioPackage(),
    price: 14000,
    depositAmount: 1000,
  }
  const wedding = buildReferenceWedding({
    price: 12000,
    depositAmount: 2500,
  })
  const snap = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 0,
    preserveContractValue: true,
  })
  assertEq(snap.price, 12000, 'CV')
  assertEq(snap.depositAmount, 2500, 'deposit')
})

run('A2-2 APPLY DEFAULTS no paid deposit', () => {
  const pkg = {
    ...buildReferenceStudioPackage(),
    price: 14000,
    depositAmount: 1000,
  }
  const wedding = buildReferenceWedding({
    price: 13000,
    depositAmount: 2500,
    payments: [],
  })
  const snap = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 2000,
    effectiveTravelFee: 1000,
    preserveContractValue: false,
    preserveDeposit: false,
  })
  assertEq(snap.price, 17000, 'CV recomposed')
  assertEq(snap.depositAmount, 1000, 'catalog deposit')
})

run('A2-3 PRESERVE with paid deposit — deposit stays, no rewrite', () => {
  const payments: Payment[] = [
    {
      id: 'p1',
      label: 'Zadatek',
      amount: 2500,
      type: 'deposit',
      paid: true,
      dueDate: '2026-01-01',
    },
  ]
  const pkg = {
    ...buildReferenceStudioPackage(),
    price: 14000,
    depositAmount: 1000,
  }
  const wedding = buildReferenceWedding({
    price: 13000,
    depositAmount: 2500,
    payments,
  })
  const snap = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 2000,
    effectiveTravelFee: 1000,
    preserveContractValue: true,
  })
  assertEq(snap.depositAmount, 2500, 'deposit preserved')
  assertEq(snap.price, 13000, 'CV preserved')
  assertEq(wedding.payments?.[0]?.amount, 2500, 'ledger untouched')
})

run('A2-4 APPLY DEFAULTS with paid deposit requires confirmation', () => {
  const payments: Payment[] = [
    {
      id: 'p1',
      label: 'Zadatek',
      amount: 2500,
      type: 'deposit',
      paid: true,
      dueDate: '2026-01-01',
    },
  ]
  assert(
    requiresAgreedDepositConfirmOnPackageDefaults({
      payments,
      currentAgreedDeposit: 2500,
      catalogDefaultDeposit: 1000,
    }),
    'confirm required',
  )
  assert(
    !requiresAgreedDepositConfirmOnPackageDefaults({
      payments: [],
      currentAgreedDeposit: 2500,
      catalogDefaultDeposit: 1000,
    }),
    'no confirm without paid deposit',
  )
  assert(
    !requiresAgreedDepositConfirmOnPackageDefaults({
      payments,
      currentAgreedDeposit: 1000,
      catalogDefaultDeposit: 1000,
    }),
    'no confirm when deposits match',
  )
})

run('A2-4b KEEP CURRENT DEPOSIT after confirm', () => {
  const pkg = {
    ...buildReferenceStudioPackage(),
    price: 14000,
    depositAmount: 1000,
  }
  const payments: Payment[] = [
    {
      id: 'p1',
      label: 'Zadatek',
      amount: 2500,
      type: 'deposit',
      paid: true,
      dueDate: '2026-01-01',
    },
  ]
  const wedding = buildReferenceWedding({
    price: 13000,
    depositAmount: 2500,
    payments,
  })
  const snap = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 2000,
    effectiveTravelFee: 1000,
    preserveContractValue: false,
    preserveDeposit: true,
  })
  assertEq(snap.price, 17000, 'CV defaults applied')
  assertEq(snap.depositAmount, 2500, 'deposit kept')
  assertEq(wedding.payments?.[0]?.amount, 2500, 'payment untouched')
})

run('A2-5 USE NEW PACKAGE DEPOSIT after confirm', () => {
  const pkg = {
    ...buildReferenceStudioPackage(),
    price: 14000,
    depositAmount: 1000,
  }
  const payments: Payment[] = [
    {
      id: 'p1',
      label: 'Zadatek',
      amount: 2500,
      type: 'deposit',
      paid: true,
      dueDate: '2026-01-01',
    },
  ]
  const wedding = buildReferenceWedding({
    price: 13000,
    depositAmount: 2500,
    payments,
  })
  const snap = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 2000,
    effectiveTravelFee: 1000,
    preserveContractValue: false,
    preserveDeposit: false,
  })
  assertEq(snap.depositAmount, 1000, 'catalog deposit')
  assertEq(snap.price, 17000, 'CV defaults')
  assertEq(wedding.payments?.[0]?.amount, 2500, 'ledger payment unchanged')
  assertEq(wedding.payments?.[0]?.paid, true, 'payment still paid')
})

run('A2-6 Uzupełnij z katalogu preserves finances', () => {
  const pkg = {
    ...buildReferenceStudioPackage(),
    price: 14000,
    depositAmount: 1000,
    name: 'Video MAX',
  }
  const wedding = buildReferenceWedding({
    price: 13000,
    depositAmount: 2500,
    packageId: pkg.id,
  })
  const filled = fillWeddingTermsFromCatalogPackage(wedding, pkg, {
    preserveContractValue: true,
    preserveDeposit: true,
    extrasTotal: 2000,
    effectiveTravelFee: 1000,
  })
  assertEq(filled.price, 13000, 'CV')
  assertEq(filled.depositAmount, 2500, 'deposit')
  assertEq(filled.packageName, 'Video MAX', 'metadata updated')
})

run('A2 preserve rebases effective package base', () => {
  const pkg = {
    ...buildReferenceStudioPackage(),
    price: 14000,
    depositAmount: 1000,
  }
  const wedding = buildReferenceWedding({
    price: 13000,
    depositAmount: 2500,
  })
  const extrasTotal = 2000
  const travel = 1000
  const snap = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal,
    effectiveTravelFee: travel,
    preserveContractValue: true,
  })
  const base = rebaseEffectivePackageBase({
    contractValue: snap.price,
    extrasTotal,
    effectiveTravel: travel,
  })
  assertEq(base, 10000, 'effective base after preserve')
})

if (!process.exitCode) {
  console.log('\nAll A1/A2 commercial integrity tests passed.')
}
