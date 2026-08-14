/**
 * Deposit suggestion for "Dodaj zadatek" / session "Dodaj zaliczkę".
 * Agreed/snapshotted deposit only — never price * 0.3.
 * Run via: npm run test:finance-center (included)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAgreedDeposit } from '@/lib/utils/commercial'

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

{
  // A — agreed deposit 1000 on 11600 contract → suggest 1000, not 3480
  const suggested = getAgreedDeposit({ depositAmount: 1000 })
  assert(suggested === 1000, `A: expected 1000, got ${suggested}`)
  assert(suggested !== 3480, 'A: must not be 30% of 11600')
  assert(Math.round(11600 * 0.3) === 3480, 'sanity: 30% of 11600 is 3480')
  const svc = read('src/lib/api/weddingActionsService.ts')
  assertIncludes(
    svc,
    'getSuggestedDepositAmount(wedding: Pick<Wedding, \'depositAmount\'>): number',
    'A: suggestion helper signature',
  )
  assertIncludes(svc, 'return getAgreedDeposit(wedding)', 'A: suggestion = agreed deposit')
  assertNotIncludes(svc, 'price * 0.3', 'A: no 30% fallback in suggestion')
  console.log('PASS  A  agreed deposit suggests 1000 not 3480')
}

{
  // B — no agreed deposit → empty suggestion (0), not 3480
  assert(getAgreedDeposit({ depositAmount: undefined }) === 0, 'B: undefined → 0')
  console.log('PASS  B  no agreed deposit → empty suggestion')
}

{
  // C — package present but deposit absent / zero → empty
  assert(getAgreedDeposit({ depositAmount: 0 }) === 0, 'C: 0 → empty')
  assert(getAgreedDeposit({ depositAmount: null as never }) === 0, 'C: null → empty')
  console.log('PASS  C  package without deposit config → empty')
}

{
  // D — amount remains editable (UI does not lock); save uses form value
  const modal = read('src/features/weddings/actions/AddPaymentModal.tsx')
  assertIncludes(modal, 'onChange={(e) => setAmount(e.target.value)}', 'D: amount editable')
  assertNotIncludes(modal, 'readOnly', 'D: amount not readOnly')
  assertIncludes(
    modal,
    'amount: Math.round(parsed)',
    'D: saved amount from form parse (manual 800 ok)',
  )
  console.log('PASS  D  suggested amount remains editable')
}

{
  // E — saving creates deposit payment type; CTA flips via hasPaidDepositPayment
  const modal = read('src/features/weddings/actions/AddPaymentModal.tsx')
  assertIncludes(modal, "type: asDeposit ? 'deposit' : 'installment'", 'E: deposit type on save')
  const finance = read(
    'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
  )
  assertIncludes(
    finance,
    'hasPaidDepositPayment(payments) ? (',
    'E: CTA becomes Dodaj wpłatę after paid deposit',
  )
  console.log('PASS  E  save creates deposit payment; CTA sequencing')
}

{
  // F — suggestion reads wedding snapshot field, not live package
  const svc = read('src/lib/api/weddingActionsService.ts')
  assertIncludes(svc, 'getAgreedDeposit', 'F: uses snapshotted agreed deposit')
  assertNotIncludes(svc, 'packageService', 'F: suggestion does not live-fetch package')
  const commercial = read('src/lib/utils/commercial.ts')
  assertIncludes(
    commercial,
    'depositAmount: pkg.depositAmount',
    'F: package deposit snapshotted onto wedding',
  )
  const pkgType = read('src/types/package.ts')
  assertIncludes(
    pkgType,
    'Live catalog prices apply to future weddings only',
    'F: catalog → snapshot architecture',
  )
  console.log('PASS  F  historical wedding terms prefer snapshot')
}

{
  // G / H — session suggests agreed depositAmount; modal empties when ≤ 0
  const sessionPage = read('src/pages/SessionDetailPage.tsx')
  assertIncludes(sessionPage, 'suggestedAmount={', 'G: passes suggestion')
  assertIncludes(
    sessionPage,
    'addAsDeposit && !editedPayment',
    'G: suggestion only for first deposit CTA',
  )
  assertIncludes(sessionPage, 'session.depositAmount', 'G: agreed session deposit')
  const sessionModal = read('src/features/sessions/actions/SessionPaymentModal.tsx')
  assertIncludes(
    sessionModal,
    'suggestedAmount != null &&',
    'G: uses suggestedAmount when present',
  )
  assertIncludes(
    sessionModal,
    'suggestedAmount > 0',
    'H: zero/absent → empty amount',
  )
  assertIncludes(
    sessionModal,
    "defaultType === 'deposit' &&",
    'G: only for first deposit CTA',
  )
  assertNotIncludes(sessionModal, '* 0.3', 'H: no price*0.3')
  console.log('PASS  G/H  session agreed deposit suggestion / empty when absent')
}

{
  const modal = read('src/features/weddings/actions/AddPaymentModal.tsx')
  assertNotIncludes(modal, '30%', 'copy: no 30% mention')
  assertNotIncludes(modal, 'wartości umowy', 'copy: no contract-value % claim')
  assertIncludes(
    modal,
    'Zarejestruj otrzymany zadatek. Kwota została wstępnie uzupełniona na podstawie ustalonej kwoty zadatku.',
    'copy: with suggestion',
  )
  assertIncludes(modal, "'Zarejestruj otrzymany zadatek.'", 'copy: without suggestion')
  assertIncludes(
    modal,
    "asDeposit && suggested > 0 ? String(suggested) : ''",
    'empty amount when no suggestion',
  )
  console.log('PASS  modal copy + empty amount when no suggestion')
}

{
  // Package catalog stores fixed depositAmount (PLN), snapshotted to weddings.deposit_amount
  const pkgType = read('src/types/package.ts')
  assertIncludes(pkgType, 'depositAmount: number', 'package has depositAmount')
  assertIncludes(
    pkgType,
    'Live catalog prices apply to future weddings only',
    'packages are catalog; weddings snapshot',
  )
  const weddingType = read('src/types/wedding.ts')
  assertIncludes(weddingType, 'depositAmount?: number', 'wedding snapshotted deposit')
  assertIncludes(
    weddingType,
    'Persisted as weddings.deposit_amount',
    'wedding deposit is agreed, not paid',
  )
  console.log('PASS  package + wedding deposit data model')
}

console.log('OK  depositSuggestionAcceptance')
