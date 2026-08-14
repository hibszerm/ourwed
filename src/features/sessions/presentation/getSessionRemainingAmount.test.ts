/**
 * Run: npm run test:session-finance
 */
import { buildSessionCommercialSummary } from '@/features/sessions/presentation/sessionFinance'
import type { SessionPayment } from '@/types/sessionPayment'

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

function payment(
  id: string,
  amount: number,
  type: SessionPayment['type'],
  paid = true,
): SessionPayment {
  return {
    id,
    sessionId: 'session-1',
    label: type,
    amount,
    type,
    paid,
    paidAt: paid ? '2026-08-14' : undefined,
    createdAt: '2026-08-14T10:00:00Z',
  }
}

const cases = [
  {
    id: 'A',
    summary: buildSessionCommercialSummary(0, 0, []),
    agreedDeposit: 0,
    expected: [0, 0, 0, 'value_unset'],
  },
  {
    id: 'B',
    summary: buildSessionCommercialSummary(1200, 0, []),
    agreedDeposit: 0,
    expected: [0, 0, 1200, 'unpaid'],
  },
  {
    id: 'C',
    summary: buildSessionCommercialSummary(1200, 300, []),
    agreedDeposit: 300,
    expected: [0, 0, 1200, 'unpaid'],
  },
  {
    id: 'D',
    summary: buildSessionCommercialSummary(1200, 300, [
      payment('d', 300, 'deposit', false),
    ]),
    agreedDeposit: 300,
    expected: [0, 0, 1200, 'unpaid'],
  },
  {
    id: 'E',
    summary: buildSessionCommercialSummary(1200, 300, [
      payment('e', 300, 'deposit'),
    ]),
    agreedDeposit: 300,
    expected: [300, 300, 900, 'partial'],
  },
  {
    id: 'F',
    summary: buildSessionCommercialSummary(1200, 300, [
      payment('f', 300, 'installment'),
    ]),
    agreedDeposit: 300,
    expected: [300, 0, 900, 'partial'],
  },
  {
    id: 'G',
    summary: buildSessionCommercialSummary(1200, 300, [
      payment('g1', 300, 'deposit'),
      payment('g2', 400, 'installment'),
    ]),
    agreedDeposit: 300,
    expected: [700, 300, 500, 'partial'],
  },
  {
    id: 'H',
    summary: buildSessionCommercialSummary(1200, 300, [
      payment('h1', 300, 'deposit'),
      payment('h2', 900, 'final'),
    ]),
    agreedDeposit: 300,
    expected: [1200, 300, 0, 'paid'],
  },
  {
    id: 'I',
    summary: buildSessionCommercialSummary(1200, 300, [
      payment('i1', 300, 'deposit'),
      payment('i2', 1000, 'final'),
    ]),
    agreedDeposit: 300,
    expected: [1300, 300, 0, 'paid'],
  },
] as const

for (const { id, summary, agreedDeposit, expected } of cases) {
  assertEq(summary.agreedDeposit, agreedDeposit, `${id} agreed deposit`)
  assertEq(summary.totalPaid, expected[0], `${id} total paid`)
  assertEq(summary.depositPaid, expected[1], `${id} deposit paid`)
  assertEq(summary.remaining, expected[2], `${id} remaining`)
  assertEq(summary.paymentStatus, expected[3], `${id} status`)
}

const historical = buildSessionCommercialSummary(1500, 500, [
  payment('historical-backfill', 500, 'deposit'),
])
assertEq(historical.agreedDeposit, 500, 'historical agreed deposit')
assertEq(historical.depositPaid, 500, 'historical backfilled deposit paid')
assertEq(historical.remaining, 1000, 'historical remaining')

const newSession = buildSessionCommercialSummary(1500, 500, [])
assertEq(newSession.agreedDeposit, 500, 'new session agreed deposit')
assertEq(newSession.depositPaid, 0, 'new session has no paid deposit')
assertEq(newSession.remaining, 1500, 'new session remaining')

console.log('PASS  session finance A–I + historical/new ledger semantics')
