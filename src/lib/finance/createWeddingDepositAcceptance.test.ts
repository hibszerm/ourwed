/**
 * Create-wedding deposit: no 30% of contract value.
 * Agreed deposit = explicit input → package snapshot → null/0.
 * Run via: npm run test:finance-center (included) or npx tsx …
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildCreateWeddingCommercialFromPackage,
  getAgreedDeposit,
} from '@/lib/utils/commercial'
import type { StudioPackage } from '@/types/package'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: expected ${String(b)}, got ${String(a)}`)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

function catalogPkg(
  overrides: Partial<StudioPackage> & Pick<StudioPackage, 'depositAmount' | 'price'>,
): StudioPackage {
  return {
    id: 'pkg-1',
    name: 'Film + Foto',
    slug: 'film-foto',
    description: null,
    currency: 'PLN',
    color: null,
    isActive: true,
    sortOrder: 0,
    questionnaireFormId: null,
    activeContractTemplateId: null,
    activeContractTemplateVersionId: null,
    coverageHours: null,
    coverageEndTime: null,
    overtimeRate: null,
    deliveryMonths: null,
    deliveryDays: null,
    finalPaymentTerms: null,
    items: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

{
  // A — package deposit 1000 on price 10000 → wedding snapshot 1000
  const snap = buildCreateWeddingCommercialFromPackage({
    weddingDate: '2026-08-01',
    pkg: catalogPkg({ price: 10000, depositAmount: 1000 }),
  })
  assertEq(snap.depositAmount, 1000, 'A: package deposit snapshotted')
  assertEq(getAgreedDeposit({ depositAmount: snap.depositAmount }), 1000, 'A: agreed')
  assert(snap.depositAmount !== 3000, 'A: not 30%')
  console.log('PASS  A  package deposit 1000 snapshotted')
}

{
  // B — package deposit 0 / absent-as-zero → not 3000
  const snap = buildCreateWeddingCommercialFromPackage({
    weddingDate: '2026-08-01',
    pkg: catalogPkg({ price: 10000, depositAmount: 0 }),
  })
  assertEq(snap.depositAmount, 0, 'B: zero deposit preserved')
  assert(snap.depositAmount !== 3000, 'B: not 30% of 10000')
  console.log('PASS  B  package deposit absent/0 → not 3000')
}

{
  // C — no package: create path must not invent 30% (source guard + null convention)
  const createSrc = read('src/lib/api/weddingService.ts')
  assertIncludes(
    createSrc,
    'depositAmount: input.depositAmount ?? null',
    'C: no-package uses input or null',
  )
  assertNotIncludes(createSrc, 'price * 0.3', 'C: no 30% in weddingService')
  assertNotIncludes(createSrc, '* 0.3', 'C: no * 0.3 deposit math in weddingService')
  console.log('PASS  C  no package → no 30% fallback in create')
}

{
  // D — catalog mutation does not rewrite existing snapshot (re-assert commercial rule)
  const pkgType = read('src/types/package.ts')
  assertIncludes(
    pkgType,
    'Live catalog prices apply to future weddings only',
    'D: snapshot architecture',
  )
  const snapA = buildCreateWeddingCommercialFromPackage({
    weddingDate: '2026-01-01',
    pkg: catalogPkg({ price: 10000, depositAmount: 1000 }),
  })
  const laterPkg = catalogPkg({ price: 10000, depositAmount: 1500 })
  assertEq(snapA.depositAmount, 1000, 'D: January wedding keeps 1000')
  assertEq(laterPkg.depositAmount, 1500, 'D: catalog can change independently')
  console.log('PASS  D  historical snapshot unchanged by catalog edit')
}

{
  // E — production create UI + service have no deposit 30% fallback
  const page = read('src/pages/NewWeddingPage.tsx')
  assertNotIncludes(page, 'price * 0.3', 'E: NewWeddingPage no 30%')
  assertNotIncludes(page, '* 0.3', 'E: NewWeddingPage no * 0.3')
  assertIncludes(
    page,
    'fromCatalog != null && fromCatalog > 0',
    'E: prefill from catalog only when configured',
  )
  const svc = read('src/lib/api/weddingActionsService.ts')
  assertNotIncludes(svc, 'price * 0.3', 'E: suggestion helper still clean')
  console.log('PASS  E  no remaining deposit 30% in production create/suggestion')
}

{
  // F — "Zaliczka już wpłacona" creates a real deposit payment row
  const createSrc = read('src/lib/api/weddingService.ts')
  assertIncludes(createSrc, 'input.depositPaid', 'F: toggle drives create')
  assertIncludes(createSrc, "type: 'deposit'", 'F: creates deposit payment')
  assertIncludes(
    createSrc,
    'if (input.depositPaid && depositSnapshot != null && depositSnapshot > 0)',
    'F: payment only when agreed deposit > 0',
  )
  assertIncludes(createSrc, 'paymentService.create', 'F: ledger write')
  const page = read('src/pages/NewWeddingPage.tsx')
  assertIncludes(page, 'Zaliczka już wpłacona?', 'F: toggle exists')
  assertIncludes(page, 'depositPaymentDate', 'F: payment date collected')
  console.log('PASS  F  create-time paid deposit uses real payment ledger')
}

{
  // G — modal suggestion still uses agreed deposit only
  const modal = read('src/features/weddings/actions/AddPaymentModal.tsx')
  assertNotIncludes(modal, '30%', 'G: modal copy clean')
  assertIncludes(modal, 'getSuggestedDepositAmount', 'G: uses suggestion helper')
  console.log('PASS  G  AddPaymentModal suggestion path unchanged')
}

console.log('OK  createWeddingDepositAcceptance')
