/**
 * Delivery due-date domain — D1 canonical calculator.
 * Run: npm run test:delivery-deadline-domain
 */

import { formatDeliveryTerm } from '@/lib/utils/commercial'
import {
  isValidDeliveryTermCount,
  resolveDeliveryDueDate,
} from '@/lib/utils/deliveryDueDate'
import { addLocalCalendarMonths } from '@/lib/utils/localCalendarDate'

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

const ISO = /^\d{4}-\d{2}-\d{2}$/

run('A. months only', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: 5,
      deliveryDays: null,
    }),
    '2027-01-17',
    '5 months',
  )
})

run('B. days only', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: null,
      deliveryDays: 1,
    }),
    '2026-08-18',
    '+1 day',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryDays: 30,
    }),
    '2026-09-16',
    '+30 calendar days',
  )
})

run('C. both → months win (not additive)', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: 5,
      deliveryDays: 10,
    }),
    '2027-01-17',
    'months win',
  )
  assert(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: 5,
      deliveryDays: 10,
    }) !== '2027-01-27',
    'not months+days',
  )
  assert(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: 5,
      deliveryDays: 10,
    }) !== '2026-08-27',
    'not days-only',
  )
})

run('D. invalid months → days fallback', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: -1,
      deliveryDays: 30,
    }),
    '2026-09-16',
    'negative months',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: Number.NaN,
      deliveryDays: 30,
    }),
    '2026-09-16',
    'NaN months',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: Number.POSITIVE_INFINITY,
      deliveryDays: 30,
    }),
    '2026-09-16',
    'Infinity months',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: 0,
      deliveryDays: 10,
    }),
    '2026-08-27',
    'zero months falls to days',
  )
})

run('E. invalid both → null', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: null,
      deliveryDays: null,
    }),
    null,
    'both null',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: 0,
      deliveryDays: null,
    }),
    null,
    'zero months',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: -1,
      deliveryDays: 0,
    }),
    null,
    'invalid both',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: Number.NaN,
      deliveryDays: Number.NEGATIVE_INFINITY,
    }),
    null,
    'NaN + -Inf',
  )
})

run('F. invalid / missing wedding date → null', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: null,
      deliveryMonths: 5,
    }),
    null,
    'null date',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '',
      deliveryMonths: 5,
    }),
    null,
    'empty',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: 'not-a-date',
      deliveryMonths: 5,
    }),
    null,
    'garbage',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-02-31',
      deliveryMonths: 1,
    }),
    null,
    'impossible calendar day',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-13-01',
      deliveryDays: 1,
    }),
    null,
    'invalid month',
  )
})

run('G. month-end clamp', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-01-31',
      deliveryMonths: 1,
    }),
    '2026-02-28',
    '31 Jan + 1',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2028-01-31',
      deliveryMonths: 1,
    }),
    '2028-02-29',
    '31 Jan leap + 1',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-31',
      deliveryMonths: 1,
    }),
    '2026-09-30',
    '31 Aug + 1',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-01-30',
      deliveryMonths: 1,
    }),
    '2026-02-28',
    '30 Jan + 1',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-01-15',
      deliveryMonths: 1,
    }),
    '2026-02-15',
    '15 Jan + 1',
  )
})

run('H. leap year', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2028-02-29',
      deliveryMonths: 12,
    }),
    '2029-02-28',
    '29 Feb + 12 months clamps (2029 not leap)',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2027-02-28',
      deliveryMonths: 12,
    }),
    '2028-02-28',
    '28 Feb + 12 does not expand to leap day',
  )
  assertEq(
    addLocalCalendarMonths('2024-01-31', 1),
    '2024-02-29',
    'shared helper leap clamp',
  )
})

run('I. year boundary', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-12-31',
      deliveryMonths: 1,
    }),
    '2027-01-31',
    '31 Dec + 1 month',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-12-31',
      deliveryDays: 1,
    }),
    '2027-01-01',
    '31 Dec + 1 day',
  )
})

run('J. calendar days include weekends', () => {
  // 2026-08-21 is Friday
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-21',
      deliveryDays: 1,
    }),
    '2026-08-22',
    'Friday + 1 = Saturday',
  )
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-22',
      deliveryDays: 1,
    }),
    '2026-08-23',
    'Saturday + 1 = Sunday',
  )
})

run('K. no mutation of inputs', () => {
  const input = Object.freeze({
    weddingDate: '2026-08-17',
    deliveryMonths: 5,
    deliveryDays: 10,
  })
  assertEq(resolveDeliveryDueDate(input), '2027-01-17', 'frozen input')
  assertEq(input.weddingDate, '2026-08-17', 'date unchanged')
  assertEq(input.deliveryMonths, 5, 'months unchanged')
  assertEq(input.deliveryDays, 10, 'days unchanged')
})

run('L. output YYYY-MM-DD or null', () => {
  const due = resolveDeliveryDueDate({
    weddingDate: '2026-08-17',
    deliveryMonths: 5,
  })
  assert(due != null && ISO.test(due), 'iso shape')
  assert(due === '2027-01-17', 'exact')
})

run('M. ISO timestamp prefix is date-only (no TZ invent)', () => {
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17T23:30:00.000Z',
      deliveryMonths: 5,
    }),
    '2027-01-17',
    'uses YYYY-MM-DD prefix, ignores clock',
  )
})

run('N. formatDeliveryTerm compatibility — same field preference', () => {
  const months = 5
  const days = 10
  assertEq(formatDeliveryTerm(months, days), '5 miesięcy', 'prose months')
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: months,
      deliveryDays: days,
    }),
    '2027-01-17',
    'date uses months',
  )
  assertEq(formatDeliveryTerm(null, 30), '30 dni', 'prose days')
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: null,
      deliveryDays: 30,
    }),
    '2026-09-16',
    'date uses days',
  )
  assertEq(formatDeliveryTerm(0, 10), '10 dni', 'zero months prose falls to days')
  assertEq(formatDeliveryTerm(-1, 10), '10 dni', 'negative months prose')
  assertEq(formatDeliveryTerm(Number.NaN, 10), '10 dni', 'NaN months prose')
  assert(
    isValidDeliveryTermCount(5) &&
      !isValidDeliveryTermCount(0) &&
      !isValidDeliveryTermCount(-1) &&
      !isValidDeliveryTermCount(Number.NaN),
    'count validity matches prose gate',
  )
})

run('O. decimal terms round like formatDeliveryTerm', () => {
  assertEq(formatDeliveryTerm(1.4, null), '1 miesiąc', '1.4 months prose')
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryMonths: 1.4,
    }),
    '2026-09-17',
    '1.4 months → 1 month',
  )
  assertEq(formatDeliveryTerm(null, 1.6), '2 dni', '1.6 days prose')
  assertEq(
    resolveDeliveryDueDate({
      weddingDate: '2026-08-17',
      deliveryDays: 1.6,
    }),
    '2026-08-19',
    '1.6 days → 2 days',
  )
})

run('P. helper does not throw', () => {
  resolveDeliveryDueDate({
    weddingDate: undefined,
    deliveryMonths: Number.NaN,
    deliveryDays: Number.POSITIVE_INFINITY,
  })
})

if (!process.exitCode) {
  console.log('\nDelivery due-date domain: all checks passed.')
}
