/**
 * Finance Center — pure mixed-assignment domain acceptance.
 * Run: npm run test:finance-center
 */

import {
  buildFinanceSeasonModel,
  buildFinanceSessionAssignment,
  buildFinanceWeddingAssignment,
  resolveDefaultSeasonYear,
  resolveFinanceDepositStatus,
  resolveFinancePaymentStatus,
  type FinanceSessionScalarRow,
  type FinanceWeddingScalarRow,
} from '@/lib/finance/financeSeasonAggregate'
import {
  filterFinanceAssignments,
  sortFinanceAssignments,
} from '@/lib/finance/financeSeasonFilters'
import type { SessionPayment } from '@/types/sessionPayment'
import type { Payment } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(actual: unknown, expected: unknown, message: string) {
  assert(
    actual === expected,
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  )
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

function weddingPayment(
  amount: number,
  paid: boolean,
  type: Payment['type'] = 'installment',
  paidAt = '2026-08-01',
): Payment {
  return {
    id: `wp-${amount}-${type}-${paid}`,
    label: type,
    amount,
    type,
    paid,
    paidAt: paid ? paidAt : undefined,
  }
}

function sessionPayment(
  amount: number,
  paid: boolean,
  type: SessionPayment['type'] = 'installment',
  paidAt = '2026-08-01',
): SessionPayment {
  return {
    id: `sp-${amount}-${type}-${paid}`,
    sessionId: 'session',
    label: type,
    amount,
    type,
    paid,
    paidAt: paid ? paidAt : undefined,
    createdAt: '2026-08-01T10:00:00Z',
  }
}

function weddingRow(
  partial: Partial<FinanceWeddingScalarRow> & {
    id: string
    wedding_date: string
  },
): FinanceWeddingScalarRow {
  return {
    status: 'active',
    bride_name: 'Anna',
    groom_name: 'Michał',
    display_name: null,
    contract_value: 7000,
    deposit_amount: 1000,
    currency: 'PLN',
    ...partial,
  }
}

function sessionRow(
  partial: Partial<FinanceSessionScalarRow> & {
    id: string
    session_date: string
  },
): FinanceSessionScalarRow {
  return {
    session_type: 'engagement',
    custom_name: null,
    primary_first_name: 'Anna',
    primary_last_name: 'Nowak',
    secondary_first_name: null,
    secondary_last_name: null,
    custom_session_type: null,
    total_price: 1500,
    deposit_amount: 500,
    linked_wedding_id: null,
    ...partial,
  }
}

run('wedding assignment exposes mixed architecture fields', () => {
  const assignment = buildFinanceWeddingAssignment(
    weddingRow({
      id: 'w1',
      wedding_date: '2027-07-17',
      display_name: 'Anna + Michał',
      status: 'archived',
    }),
    [weddingPayment(1000, true, 'deposit')],
  )
  assertEq(assignment.id, 'w1', 'id')
  assertEq(assignment.kind, 'wedding', 'kind')
  assertEq(assignment.date, '2027-07-17', 'date')
  assertEq(assignment.displayName, 'Anna + Michał', 'display name')
  assertEq(assignment.weddingStatus, 'archived', 'wedding status')
  assertEq(assignment.totalPaid, 1000, 'paid')
  assertEq(assignment.remaining, 6000, 'remaining')
})

run('wedding ledger statuses and overpayment remain correct', () => {
  assertEq(resolveFinancePaymentStatus(7000, 1000), 'partial', 'partial')
  assertEq(resolveFinancePaymentStatus(7000, 7000), 'paid', 'paid')
  assertEq(resolveFinancePaymentStatus(7000, 0), 'unpaid', 'unpaid')
  assertEq(resolveFinancePaymentStatus(0, 100), 'value_unset', 'unset')

  const assignment = buildFinanceWeddingAssignment(
    weddingRow({ id: 'w1', wedding_date: '2027-07-17' }),
    [weddingPayment(8000, true, 'final')],
  )
  assertEq(assignment.remaining, 0, 'remaining is clamped')
  assertEq(assignment.overpayment, 1000, 'overpayment')
})

run('wedding contract value is authoritative', () => {
  const assignment = buildFinanceWeddingAssignment(
    weddingRow({
      id: 'w1',
      wedding_date: '2027-07-17',
      contract_value: 7500,
    }),
    [],
  )
  assertEq(assignment.contractValue, 7500, 'contract value')
  assertEq(assignment.remaining, 7500, 'no extras or travel re-added')
})

run('mixed wedding and session totals share one season model', () => {
  const model = buildFinanceSeasonModel(
    2027,
    [
      weddingRow({
        id: 'wedding',
        wedding_date: '2027-06-14',
        contract_value: 7000,
        deposit_amount: 1000,
      }),
    ],
    new Map([
      ['wedding', [weddingPayment(1000, true, 'deposit')]],
    ]),
    [
      sessionRow({
        id: 'session',
        session_date: '2027-07-10',
        total_price: 1500,
        deposit_amount: 500,
      }),
    ],
    new Map([
      ['session', [sessionPayment(500, true, 'deposit')]],
    ]),
  )

  assertEq(model.assignments.length, 2, 'assignment count')
  assertEq(model.kpis.assignmentCount, 2, 'KPI assignment count')
  assertEq(model.kpis.weddingCount, 1, 'KPI wedding count')
  assertEq(model.kpis.sessionCount, 1, 'KPI session count')
  assertEq(model.kpis.contractValue, 8500, 'mixed contract value')
  assertEq(model.kpis.totalPaid, 1500, 'mixed paid')
  assertEq(model.kpis.remaining, 7000, 'mixed remaining')
  assertEq(model.kpis.depositsReceived, 1500, 'mixed deposits')
})

run('session month is session_date, never payment_date', () => {
  const model = buildFinanceSeasonModel(
    2027,
    [],
    new Map(),
    [sessionRow({ id: 'session', session_date: '2027-07-10' })],
    new Map([
      [
        'session',
        [sessionPayment(500, true, 'deposit', '2026-08-15')],
      ],
    ]),
  )
  assertEq(model.months[6].assignmentCount, 1, 'July assignment')
  assertEq(model.months[6].weddingCount, 1, 'deprecated alias')
  assertEq(model.months[6].totalPaid, 500, 'payment attributed to July')
  assertEq(model.months[7].assignmentCount, 0, 'August empty')
  assertEq(model.months[7].totalPaid, 0, 'not payment-date cash flow')
})

run('linked wedding and session remain two assignments', () => {
  const weddingId = 'linked-wedding'
  const model = buildFinanceSeasonModel(
    2027,
    [weddingRow({ id: weddingId, wedding_date: '2027-06-14' })],
    new Map(),
    [
      sessionRow({
        id: 'linked-session',
        session_date: '2027-06-01',
        linked_wedding_id: weddingId,
      }),
    ],
  )
  assertEq(model.assignments.length, 2, 'linked rows do not collapse')
  assertEq(model.months[5].assignmentCount, 2, 'both count in June')
  assertEq(model.kpis.weddingCount, 1, 'one wedding')
  assertEq(model.kpis.sessionCount, 1, 'one session')
})

run('kind filters select weddings, sessions, or all', () => {
  const model = buildFinanceSeasonModel(
    2027,
    [weddingRow({ id: 'w', wedding_date: '2027-05-01' })],
    new Map(),
    [sessionRow({ id: 's', session_date: '2027-05-02' })],
  )
  const options = { paymentFilter: 'all' as const, month: null }
  const all = filterFinanceAssignments(model.assignments, {
    ...options,
    kindFilter: 'all',
  })
  const weddings = filterFinanceAssignments(model.assignments, {
    ...options,
    kindFilter: 'wedding',
  })
  const sessions = filterFinanceAssignments(model.assignments, {
    ...options,
    kindFilter: 'session',
  })
  assertEq(all.length, 2, 'all')
  assertEq(weddings.length, 1, 'weddings')
  assertEq(weddings[0].id, 'w', 'wedding id')
  assertEq(sessions.length, 1, 'sessions')
  assertEq(sessions[0].id, 's', 'session id')
})

run('missing deposit applies to wedding and session', () => {
  const model = buildFinanceSeasonModel(
    2027,
    [
      weddingRow({
        id: 'w',
        wedding_date: '2027-05-01',
        deposit_amount: 1000,
      }),
    ],
    new Map(),
    [
      sessionRow({
        id: 's',
        session_date: '2027-05-02',
        deposit_amount: 500,
      }),
    ],
  )
  const missing = filterFinanceAssignments(model.assignments, {
    paymentFilter: 'missing_deposit',
    kindFilter: 'all',
    month: null,
  })
  assertEq(missing.length, 2, 'both missing')
  assert(missing.every((a) => a.depositStatus === 'missing'), 'missing status')
  assertEq(model.kpis.missingDepositCount, 2, 'missing KPI')
  assertEq(resolveFinanceDepositStatus(0, 0), 'none', 'no agreed deposit')
})

run('historical session deposit ledger reduces remaining', () => {
  const assignment = buildFinanceSessionAssignment(
    sessionRow({
      id: 'historical',
      session_date: '2027-05-02',
      total_price: 1500,
      deposit_amount: 500,
    }),
    [sessionPayment(500, true, 'deposit')],
  )
  assertEq(assignment.agreedDeposit, 500, 'agreed deposit')
  assertEq(assignment.depositPaid, 500, 'backfilled payment')
  assertEq(assignment.remaining, 1000, 'historical remaining')
})

run('new session agreed deposit is not paid money', () => {
  const assignment = buildFinanceSessionAssignment(
    sessionRow({
      id: 'new',
      session_date: '2027-05-02',
      total_price: 1500,
      deposit_amount: 500,
    }),
    [],
  )
  assertEq(assignment.agreedDeposit, 500, 'agreed deposit')
  assertEq(assignment.depositPaid, 0, 'no ledger payment')
  assertEq(assignment.remaining, 1500, 'new session remaining')
  assertEq(assignment.depositStatus, 'missing', 'deposit missing')
})

run('remaining sums per-assignment clamps and average skips zero', () => {
  const model = buildFinanceSeasonModel(
    2027,
    [
      weddingRow({
        id: 'overpaid',
        wedding_date: '2027-05-01',
        contract_value: 1000,
      }),
      weddingRow({
        id: 'unset',
        wedding_date: '2027-06-01',
        contract_value: 0,
      }),
    ],
    new Map([
      ['overpaid', [weddingPayment(1500, true)]],
    ]),
    [sessionRow({ id: 'session', session_date: '2027-07-01' })],
  )
  assertEq(model.kpis.remaining, 1500, 'sum of clamped remaining')
  assertEq(model.kpis.averageContractValue, 1250, 'zero excluded from average')
})

run('sorting and default season behavior remain stable', () => {
  const model = buildFinanceSeasonModel(
    2027,
    [
      weddingRow({
        id: 'small',
        wedding_date: '2027-05-01',
        contract_value: 1000,
      }),
      weddingRow({
        id: 'large',
        wedding_date: '2027-06-01',
        contract_value: 5000,
      }),
    ],
    new Map(),
  )
  const sorted = sortFinanceAssignments(
    model.assignments,
    'remaining',
    'desc',
  )
  assertEq(sorted[0].id, 'large', 'sort by remaining')
  assertEq(resolveDefaultSeasonYear([2025, 2026, 2027], 2026), 2026, 'current')
  assertEq(resolveDefaultSeasonYear([2025, 2028], 2026), 2025, 'nearest')
  assertEq(resolveDefaultSeasonYear([], 2026), 2026, 'empty fallback')
})

if (!process.exitCode) {
  console.log('\nAll mixed finance domain tests passed.')
}
