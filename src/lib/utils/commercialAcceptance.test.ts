/**
 * Commercial Truth Model — finance helper acceptance tests.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/utils/commercialAcceptance.test.ts
 */

import {
  getAgreedDeposit,
  getContractValue,
  getWeddingCommercialSummary,
} from './commercial'
import {
  getDepositPaid,
  getRemainingAfterDeposit,
  getRemainingToPay,
  getTotalPaid,
} from './finance'
import type { Payment, Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

function payment(
  amount: number,
  paid: boolean,
  type: Payment['type'] = 'installment',
): Payment {
  return {
    id: `p-${amount}-${type}-${paid}`,
    label: type,
    amount,
    type,
    paid,
    paidAt: paid ? '2026-01-01' : undefined,
  }
}

function weddingStub(input: {
  price: number
  depositAmount: number
  payments: Payment[]
}): Wedding {
  return {
    id: 'w1',
    couple: {
      partner1: 'A',
      partner2: 'B',
      email: '',
      phone: '',
      venue: '',
      city: '',
    },
    date: '2026-10-10',
    status: 'active',
    workflowStage: 'deposit',
    packageName: 'Pakiet Video Mini',
    packageId: null,
    price: input.price,
    depositAmount: input.depositAmount,
    currency: 'PLN',
    packageItems: [
      {
        sourceItemId: 'i1',
        title: 'Film weselny',
        description: null,
        sortOrder: 0,
      },
    ],
    payments: input.payments,
    finances: [],
    questionnaires: {
      contractData: { status: 'not_sent' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#0a0a0a',
    createdAt: '2026-01-01',
    checklist: [],
    schedule: [],
  }
}

run('9500 / 1000 / 0 paid → remainingAfterDeposit 8500, remainingToPay 9500', () => {
  const payments: Payment[] = []
  assert(getRemainingAfterDeposit(9500, 1000) === 8500, 'after deposit')
  assert(getRemainingToPay(9500, payments) === 9500, 'to pay')
  assert(getTotalPaid(payments) === 0, 'total paid')

  const summary = getWeddingCommercialSummary(
    weddingStub({ price: 9500, depositAmount: 1000, payments }),
  )
  assert(summary.contractValue === 9500, 'contractValue')
  assert(summary.agreedDeposit === 1000, 'agreedDeposit')
  assert(summary.remainingAfterDeposit === 8500, 'summary after deposit')
  assert(summary.remainingToPay === 9500, 'summary to pay')
})

run('9500 / 1000 / 3000 paid → remainingAfterDeposit 8500, remainingToPay 6500', () => {
  const payments = [
    payment(1000, true, 'deposit'),
    payment(2000, true, 'installment'),
  ]
  assert(getTotalPaid(payments) === 3000, 'total paid')
  assert(getDepositPaid(payments) === 1000, 'deposit paid')
  assert(getRemainingAfterDeposit(9500, 1000) === 8500, 'after deposit')
  assert(getRemainingToPay(9500, payments) === 6500, 'to pay')

  const summary = getWeddingCommercialSummary(
    weddingStub({ price: 9500, depositAmount: 1000, payments }),
  )
  assert(summary.remainingAfterDeposit === 8500, 'summary after deposit')
  assert(summary.remainingToPay === 6500, 'summary to pay')
  assert(summary.totalPaid === 3000, 'summary total paid')
})

run('9500 / 9500 paid → remainingToPay 0', () => {
  const payments = [payment(9500, true, 'final')]
  assert(getRemainingToPay(9500, payments) === 0, 'to pay zero')
  assert(getTotalPaid(payments) === 9500, 'fully paid')
  const summary = getWeddingCommercialSummary(
    weddingStub({ price: 9500, depositAmount: 1000, payments }),
  )
  assert(summary.remainingToPay === 0, 'summary to pay zero')
  // agreed deposit math is independent of ledger
  assert(summary.remainingAfterDeposit === 8500, 'after deposit unchanged')
})

run('vocabulary accessors map price/depositAmount', () => {
  const w = weddingStub({ price: 9500, depositAmount: 1000, payments: [] })
  assert(getContractValue(w) === 9500, 'getContractValue')
  assert(getAgreedDeposit(w) === 1000, 'getAgreedDeposit')
})

if (!process.exitCode) {
  console.log('\nAll commercial acceptance tests passed.')
}
