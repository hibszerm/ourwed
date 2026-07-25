/**
 * Reference wedding → contract commercial variables acceptance.
 * Run: npm run test:reference-contract-values
 */

import { buildReferenceWedding } from '@/lib/dev/referenceWedding'
import {
  buildContractCommercialResolved,
  formatContractDateLong,
  formatContractDateShort,
} from '@/lib/utils/contractCommercialVariables'
import { amountToWordsPl } from '@/lib/utils/amountToWordsPl'
import { SystemVariableRegistry } from '@/lib/variables/registry'

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

run('amountToWordsPl(1400)', () => {
  assertEq(
    amountToWordsPl(1400),
    'jeden tysiąc czterysta złotych',
    '1400 words',
  )
})

run('contract date formatters', () => {
  assertEq(formatContractDateShort('2026-07-10'), '10.07.2026', 'short')
  assertEq(
    formatContractDateLong('2026-07-10'),
    '10 lipca 2026 r.',
    'long',
  )
})

run('reference wedding resolves all commercial / delivery values', () => {
  const wedding = buildReferenceWedding()
  const { values, includedServices, missingCanonicalKeys } =
    buildContractCommercialResolved(wedding)

  assertEq(
    values.package_name_without_prefix,
    'Video Mini',
    'package_name_without_prefix',
  )
  assertEq(values.contract_value_formatted, '9 500 zł', 'contract formatted')
  assertEq(
    values.contract_value_words,
    'dziewięć tysięcy pięćset złotych',
    'contract words',
  )
  assertEq(values.agreed_deposit_formatted, '1 000 zł', 'deposit formatted')
  assertEq(
    values.remaining_after_deposit_formatted,
    '8 500 zł',
    'remaining after deposit',
  )
  assertEq(
    values.remaining_to_pay_formatted,
    '8 500 zł',
    'remaining to pay',
  )
  assertEq(values.coverage_hours, '12', 'coverage_hours')
  assertEq(values.coverage_end_time, '00:30', 'coverage_end_time')
  assertEq(values.overtime_rate, '1400', 'overtime_rate raw')
  assertEq(values.overtime_rate_formatted, '1 400 zł', 'overtime formatted')
  assertEq(
    values.overtime_rate_words,
    'jeden tysiąc czterysta złotych',
    'overtime words',
  )
  assertEq(values.delivery_term_text, '4 miesiące', 'delivery_term_text')
  assertEq(values.delivery_months, '4', 'delivery_months')
  assertEq(values.final_payment_due_date, '10.07.2026', 'final due short')
  assertEq(
    values.final_payment_due_date_long,
    '10 lipca 2026 r.',
    'final due long',
  )
  assertEq(values.package_items_count, '4', 'package_items_count')
  assertEq(includedServices.length, 4, 'includedServices length')

  const text = values.included_services_text ?? ''
  assert(text.includes('Teledysk ślubny'), 'item 1')
  assert(text.includes('Film ślubny'), 'item 2')
  assert(text.includes('Przekazanie filmów'), 'item 3')
  assert(text.includes('Jeden operator'), 'item 4')
  assert(
    text.indexOf('Teledysk') < text.indexOf('Film') &&
      text.indexOf('Film') < text.indexOf('Przekazanie') &&
      text.indexOf('Przekazanie') < text.indexOf('Jeden'),
    'items order',
  )

  assertEq(
    missingCanonicalKeys.length,
    0,
    `missing: ${missingCanonicalKeys.join(', ')}`,
  )
})

run('missing overtime / delivery → omit, do not invent zero', () => {
  const wedding = buildReferenceWedding({
    overtimeRate: null,
    deliveryMonths: null,
    deliveryDays: null,
    coverageHours: null,
    coverageEndTime: null,
    finalPaymentDueDate: null,
  })
  const { values } = buildContractCommercialResolved(wedding)
  assert(values.overtime_rate == null, 'no overtime_rate')
  assert(values.overtime_rate_formatted == null, 'no overtime formatted')
  assert(values.delivery_term_text == null, 'no delivery term')
  assert(values.coverage_hours == null, 'no coverage hours')
  assert(values.coverage_end_time == null, 'no coverage end')
  assert(values.final_payment_due_date == null, 'no final due')
  // Still has money from snapshot
  assertEq(values.contract_value_formatted, '9 500 zł', 'money still present')
})

run('disabled package items excluded from text and count', () => {
  const wedding = buildReferenceWedding({
    packageItems: [
      {
        sourceItemId: 'a',
        title: 'Enabled item',
        description: null,
        sortOrder: 0,
        enabled: true,
      },
      {
        sourceItemId: 'b',
        title: 'Disabled item',
        description: null,
        sortOrder: 1,
        enabled: false,
      },
    ],
  })
  const { values, includedServices } = buildContractCommercialResolved(wedding)
  assertEq(values.package_items_count, '1', 'count')
  assertEq(includedServices.length, 1, 'services')
  assert(
    values.included_services_text?.includes('Enabled item') === true,
    'enabled present',
  )
  assert(
    values.included_services_text?.includes('Disabled item') !== true,
    'disabled omitted',
  )
})

run('new registry keys are registered', () => {
  for (const id of [
    'coverage_hours',
    'coverage_end_time',
    'overtime_rate',
    'overtime_rate_formatted',
    'overtime_rate_words',
    'delivery_days',
    'delivery_months',
    'delivery_term_text',
    'final_payment_due_date',
    'final_payment_due_date_long',
    'package_items_count',
  ]) {
    assert(Boolean(SystemVariableRegistry.get(id)), `registry missing ${id}`)
  }
  // working_hours collapses to coverage_hours
  assertEq(
    SystemVariableRegistry.get('working_hours')?.id,
    'coverage_hours',
    'working_hours alias',
  )
})

if (!process.exitCode) {
  console.log('\nAll reference-contract-values tests passed.')
}
