/**
 * Payment UX unification — CTA sequencing + mobile Finance card deposit line.
 * Run via: npm run test:finance-center (included) or npx tsx …
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hasPaidDepositPayment } from '@/lib/finance/hasPaidDepositPayment'

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
  assert(!hasPaidDepositPayment([]), 'empty unpaid')
  assert(
    !hasPaidDepositPayment([{ type: 'deposit', paid: false }]),
    'unpaid deposit does not count',
  )
  assert(
    hasPaidDepositPayment([{ type: 'deposit', paid: true }]),
    'paid deposit counts',
  )
  assert(
    !hasPaidDepositPayment([{ type: 'installment', paid: true }]),
    'installment is not deposit',
  )
  assert(
    hasPaidDepositPayment([
      { type: 'installment', paid: true },
      { type: 'deposit', paid: true },
    ]),
    'paid deposit among others',
  )
  console.log('PASS  hasPaidDepositPayment matrix')
}

{
  const finance = read(
    'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
  )
  assertIncludes(finance, 'hasPaidDepositPayment', 'uses paid-deposit condition')
  assertIncludes(finance, 'Dodaj zadatek', 'deposit CTA label')
  assertIncludes(finance, 'Dodaj wpłatę', 'payment CTA label')
  assertIncludes(
    finance,
    'hasPaidDepositPayment(payments) ? (',
    'single contextual CTA branch',
  )
  // Both labels exist in ternary — but must not render both buttons unconditionally
  const dualBlock =
    finance.includes('finance-add-payment') &&
    finance.includes('finance-add-deposit') &&
    !finance.includes('hasPaidDepositPayment(payments)')
  assert(!dualBlock, 'no unconditional dual CTAs')
  console.log('PASS  wedding finance CTA contextual')
}

{
  const sessionPage = read('src/pages/SessionDetailPage.tsx')
  assertIncludes(sessionPage, 'hasPaidDepositPayment', 'session uses paid deposit')
  assertIncludes(sessionPage, 'Dodaj zaliczkę', 'session first CTA')
  assertIncludes(sessionPage, 'Dodaj wpłatę', 'session subsequent CTA')
  assertIncludes(sessionPage, "defaultType={", 'modal default type from CTA')
  assertIncludes(sessionPage, "'deposit'", 'can default to deposit')
  assertIncludes(sessionPage, "'installment'", 'can default to installment after deposit')
  assertIncludes(sessionPage, 'addAsDeposit', 'CTA drives deposit preference')
  console.log('PASS  session finance CTA contextual')
}

{
  const modal = read('src/features/sessions/actions/SessionPaymentModal.tsx')
  assertIncludes(modal, 'defaultType', 'session modal accepts defaultType')
  assertIncludes(modal, 'Dodaj zaliczkę', 'deposit modal title')
  assertIncludes(modal, 'suggestedAmount', 'prefills agreed deposit amount')
  console.log('PASS  session payment modal defaults')
}

{
  const cards = read('src/features/finance/FinanceWeddingList.tsx')
  assertNotIncludes(cards, 'Otrzymana zaliczka', 'no received-deposit card line')
  assertNotIncludes(cards, 'cardDeposit', 'no cardDeposit render')
  assertNotIncludes(
    cards,
    'a.agreedDeposit > 0 || a.depositPaid > 0',
    'no agreedDeposit-driven deposit line',
  )
  assertIncludes(cards, 'Wartość', 'value metric')
  assertIncludes(cards, 'Wpłacono', 'paid metric')
  assertIncludes(cards, 'Pozostało', 'remaining metric')
  assertIncludes(cards, 'data-finance-card-kind', 'type badge preserved')
  console.log('PASS  mobile finance card deposit cleanup')
}

{
  const kpi = read('src/features/finance/FinanceKpiStrip.tsx')
  assertIncludes(kpi, 'Otrzymane zaliczki', 'aggregate KPI retained')
  const table = read('src/features/finance/FinanceWeddingList.tsx')
  assertIncludes(table, 'Zaliczka', 'desktop Zaliczka column')
  console.log('PASS  finance terminology')
}

console.log('\nAll payment UX unification guards passed.')
