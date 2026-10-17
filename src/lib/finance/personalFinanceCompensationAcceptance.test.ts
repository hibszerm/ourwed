import assert from 'node:assert/strict'
import {
  buildFinanceMonthBuckets,
  buildFinanceSeasonKpis,
  resolvePersonalFinanceStatus,
} from './financeSeasonAggregate'
import type { FinanceAssignment } from './financeSeasonTypes'

function assignment(input: Partial<FinanceAssignment> & Pick<FinanceAssignment, 'id'>): FinanceAssignment {
  return {
    id: input.id,
    kind: 'wedding',
    date: '2027-06-01',
    displayName: input.id,
    contractValue: 0,
    personalValue: null,
    personalValueKnown: false,
    personalValueSource: 'unknown',
    personalReceived: 0,
    personalBalance: null,
    agreedDeposit: 0,
    depositPaid: 0,
    totalPaid: 0,
    remaining: 0,
    overpayment: 0,
    currency: 'PLN',
    paymentStatus: 'value_unset',
    depositStatus: 'none',
    deepLink: '/sluby/test',
    ...input,
  }
}

const rows = [
  assignment({ id: 'owner-net', contractValue: 10_000, personalValue: 5_000, personalValueKnown: true, personalValueSource: 'owner_net', personalReceived: 2_000, personalBalance: 3_000 }),
  assignment({ id: 'official', collaborative: true, contractValue: 0, personalValue: 5_000, personalValueKnown: true, personalValueSource: 'official_compensation', personalReceived: 3_000, personalBalance: 2_000 }),
  assignment({ id: 'fallback', collaborative: true, personalValue: 2_000, personalValueKnown: true, personalValueSource: 'private_fallback', personalReceived: 0, personalBalance: 2_000 }),
  assignment({ id: 'unknown', collaborative: true, contractValue: 0, personalValue: null, personalValueKnown: false, personalValueSource: 'unknown' }),
  assignment({ id: 'known-zero', collaborative: true, contractValue: 0, personalValue: 0, personalValueKnown: true, personalValueSource: 'official_compensation', personalBalance: 0 }),
  assignment({ id: 'loss', personalValue: -200, personalValueKnown: true, personalValueSource: 'owner_net', personalBalance: -200 }),
]

const kpis = buildFinanceSeasonKpis(rows)
assert.equal(kpis.personalValue, 11_800, 'known personal values include explicit zero and preserve negative loss')
assert.equal(kpis.personalValueKnownCount, 5, 'unknown is excluded from known count while zero is included')
assert.equal(kpis.averagePersonalValue, 2_360, 'average uses known personal values only')
assert.equal(rows[0]?.contractValue, 10_000, 'owner contract remains full client value')
assert.equal(rows[1]?.contractValue, 0, 'collaborator row carries no client contract value')
assert.equal(rows[1]?.personalValue, 5_000, 'collaborator personal value uses official allocation')
assert.equal(rows[2]?.personalValue, 2_000, 'Comp0 fallback remains the collaborator value')
assert.equal(rows[3]?.personalValue, null, 'unknown is not converted to zero or contract value')
assert.equal(rows[4]?.personalValue, 0, 'explicit zero remains a known value')
assert.equal(rows[5]?.personalValue, -200, 'negative owner economics are not clamped')

const month = buildFinanceMonthBuckets(rows)[5]
assert.equal(month?.personalValue, 11_800, 'monthly personal value is actor-specific')
assert.equal(month?.personalValueKnownCount, 5, 'monthly average input excludes unknown')
assert.equal(month?.personalBalance, 6_800, 'monthly balance preserves positive, zero and negative amounts')

assert.equal(resolvePersonalFinanceStatus(true, 2_000, 3_000), 'partial', 'partial receipts derive partial settlement')
assert.equal(resolvePersonalFinanceStatus(true, 0, 5_000), 'paid', 'zero balance derives settled status')
assert.equal(resolvePersonalFinanceStatus(true, -2_000, 7_000), 'paid', 'over-receipt is settled with a negative pass-through balance')
assert.equal(resolvePersonalFinanceStatus(false, null, 0), 'value_unset', 'unknown never becomes unpaid zero')
assert.equal(resolvePersonalFinanceStatus(true, 0, 0), 'paid', 'explicit zero is a known settled value')

console.log('Personal Finance compensation acceptance: PASS (18 assertions)')
