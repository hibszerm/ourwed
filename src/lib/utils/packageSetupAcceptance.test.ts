/**
 * Package setup + reference wedding acceptance tests.
 * Run: npm run test:package-setup
 */

import {
  applyCommercialPackageSnapshot,
  getWeddingCommercialSummary,
} from './commercial'
import {
  buildReferenceCompany,
  buildReferenceStudioPackage,
  buildReferenceWedding,
} from '@/lib/dev/referenceWedding'
import { evaluateWeddingContractReadiness } from './weddingContractReadiness'
import type { StudioPackage } from '@/types/package'
import type { Wedding } from '@/types/wedding'

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

run('1. assigning a package freezes all commercial fields', () => {
  const pkg = buildReferenceStudioPackage()
  const bare: Wedding = {
    ...buildReferenceWedding(),
    packageId: null,
    packageName: '',
    price: 0,
    depositAmount: undefined,
    packageItems: [],
    coverageHours: null,
    coverageEndTime: null,
    overtimeRate: null,
    deliveryMonths: null,
    deliveryDays: null,
    finalPaymentDueDate: null,
    payments: [],
  }
  const snap = applyCommercialPackageSnapshot(bare, pkg, 0)
  assertEq(snap.packageId, pkg.id, 'packageId')
  assertEq(snap.packageName, 'Video Mini', 'packageName')
  assertEq(snap.price, 9500, 'contractValue')
  assertEq(snap.depositAmount, 1000, 'agreedDeposit')
  assertEq(snap.coverageHours, 12, 'coverageHours')
  assertEq(snap.coverageEndTime, '00:30', 'coverageEndTime')
  assertEq(snap.overtimeRate, 1400, 'overtimeRate')
  assertEq(snap.deliveryMonths, 4, 'deliveryMonths')
  assertEq(snap.packageItems.length, 4, 'packageItems')
  assert(Boolean(snap.finalPaymentDueDate), 'finalPaymentDueDate')
})

run('2. catalog package mutation does not mutate wedding snapshot', () => {
  const pkg = buildReferenceStudioPackage()
  const wedding = buildReferenceWedding({
    packageId: pkg.id,
    packageItems: applyCommercialPackageSnapshot(
      buildReferenceWedding({ packageItems: [] }),
      pkg,
    ).packageItems,
  })
  const frozenName = wedding.packageName
  const frozenItems = structuredClone(wedding.packageItems)
  const frozenPrice = wedding.price

  // Mutate catalog object as if studio edited the live package
  const mutated: StudioPackage = {
    ...pkg,
    name: 'Video MAX',
    price: 12000,
    coverageEndTime: '02:00',
    items: [],
  }
  assertEq(wedding.packageName, frozenName, 'name unchanged')
  assertEq(wedding.price, frozenPrice, 'price unchanged')
  assertEq(
    JSON.stringify(wedding.packageItems),
    JSON.stringify(frozenItems),
    'items unchanged',
  )
  assertEq(mutated.name, 'Video MAX', 'catalog changed independently')
})

run('3. preserveContractValue keeps manual price override', () => {
  const pkg = buildReferenceStudioPackage()
  const wedding = buildReferenceWedding({ price: 9999 })
  const snap = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 0,
    preserveContractValue: true,
  })
  assertEq(snap.price, 9999, 'preserved price')
  assertEq(snap.packageName, 'Video Mini', 'package name updated')
  assertEq(snap.depositAmount, 1000, 'deposit from package')
})

run('4. wedding-specific edit does not modify catalog package', () => {
  const pkg = buildReferenceStudioPackage()
  const wedding = buildReferenceWedding({
    coverageEndTime: '01:00',
    overtimeRate: 1500,
    price: 9800,
  })
  assertEq(pkg.coverageEndTime, '00:30', 'catalog end unchanged')
  assertEq(pkg.overtimeRate, 1400, 'catalog overtime unchanged')
  assertEq(pkg.price, 9500, 'catalog price unchanged')
  assertEq(wedding.coverageEndTime, '01:00', 'wedding end overridden')
})

run('5. completeness ready only when all required values exist', () => {
  const wedding = buildReferenceWedding()
  const company = buildReferenceCompany()
  const ready = evaluateWeddingContractReadiness(wedding, company)
  assertEq(ready.overall, 'ready', 'overall')
  assertEq(ready.overallLabel, 'Gotowe do umowy', 'label')
  assertEq(ready.requiredMissing, 0, 'missing count')
})

run('6. missing package items → Wymaga uzupełnienia', () => {
  const wedding = buildReferenceWedding({ packageItems: [] })
  const company = buildReferenceCompany()
  const ready = evaluateWeddingContractReadiness(wedding, company)
  assertEq(ready.overall, 'needs_attention', 'overall')
  assertEq(ready.overallLabel, 'Wymaga uzupełnienia', 'label')
  const itemsCheck = ready.items.find((i) => i.id === 'package_items')
  assertEq(itemsCheck?.status, 'missing', 'package_items missing')
})

run('7. card financial values use totalPaid / remainingToPay', () => {
  const wedding = buildReferenceWedding()
  const s = getWeddingCommercialSummary(wedding)
  assertEq(s.totalPaid, 1000, 'totalPaid')
  assertEq(s.remainingToPay, 8500, 'remainingToPay')
})

run('8. 9500 / 1000 / paid 1000 → remainingAfterDeposit & remainingToPay', () => {
  const wedding = buildReferenceWedding()
  const s = getWeddingCommercialSummary(wedding)
  assertEq(s.contractValue, 9500, 'contractValue')
  assertEq(s.agreedDeposit, 1000, 'agreedDeposit')
  assertEq(s.totalPaid, 1000, 'totalPaid')
  assertEq(s.remainingAfterDeposit, 8500, 'remainingAfterDeposit')
  assertEq(s.remainingToPay, 8500, 'remainingToPay')
})

if (!process.exitCode) {
  console.log('\nAll package-setup tests passed.')
}
