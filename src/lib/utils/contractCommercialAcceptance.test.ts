/**
 * Contract commercial variables — acceptance tests.
 * Run: npm run test:contract-commercial
 */

import { amountToWordsPl } from './amountToWordsPl'
import { formatContractPln } from './currency'
import {
  buildContractCommercialResolved,
  buildIncludedServices,
  buildIncludedServicesText,
  packageNameWithoutPrefix,
} from './contractCommercialVariables'
import type { Payment, Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
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

function payment(amount: number, paid: boolean): Payment {
  return {
    id: `p-${amount}-${paid}`,
    label: 'installment',
    amount,
    type: 'installment',
    paid,
    paidAt: paid ? '2026-01-01' : undefined,
  }
}

function weddingStub(input: {
  price: number
  depositAmount?: number
  payments: Payment[]
  packageName?: string
  packageItems?: Wedding['packageItems']
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
    packageName: input.packageName ?? 'Pakiet Video Mini',
    packageId: 'pkg-1',
    price: input.price,
    depositAmount: input.depositAmount,
    currency: 'PLN',
    packageItems: input.packageItems ?? [],
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
    accentColor: '#000',
    createdAt: '2026-01-01',
    checklist: [],
    schedule: [],
  }
}

// —— Part 1: PLN formatting ——
run('formatContractPln examples', () => {
  assertEq(formatContractPln(9500), '9 500 zł', '9500')
  assertEq(formatContractPln(1000), '1 000 zł', '1000')
  assertEq(formatContractPln(8500), '8 500 zł', '8500')
  assertEq(formatContractPln(0), '0 zł', '0')
})

// —— Part 2: amount to words ——
const WORDS_CASES: Array<[number, string]> = [
  [0, 'zero złotych'],
  [1, 'jeden złoty'],
  [2, 'dwa złote'],
  [5, 'pięć złotych'],
  [21, 'dwadzieścia jeden złotych'],
  [22, 'dwadzieścia dwa złote'],
  [1000, 'jeden tysiąc złotych'],
  [1500, 'jeden tysiąc pięćset złotych'],
  [8500, 'osiem tysięcy pięćset złotych'],
  [9500, 'dziewięć tysięcy pięćset złotych'],
]

for (const [n, expected] of WORDS_CASES) {
  run(`amountToWordsPl(${n})`, () => {
    assertEq(amountToWordsPl(n), expected, String(n))
  })
}

// —— Part 4: package name without prefix ——
run('packageNameWithoutPrefix', () => {
  assertEq(
    packageNameWithoutPrefix('Pakiet Video Mini'),
    'Video Mini',
    'Pakiet Video Mini',
  )
  assertEq(
    packageNameWithoutPrefix('pakiet Foto Premium'),
    'Foto Premium',
    'pakiet Foto Premium',
  )
  assertEq(packageNameWithoutPrefix('Video Mini'), 'Video Mini', 'no prefix')
  assertEq(
    packageNameWithoutPrefix('Super Pakiet Video'),
    'Super Pakiet Video',
    'middle Pakiet kept',
  )
})

// —— Part 5: included services ——
run('included services from snapshot only', () => {
  const items = [
    {
      sourceItemId: 'a',
      title: 'teledysk ślubny o długości 1–2 minut',
      description: null,
      sortOrder: 0,
    },
    {
      sourceItemId: 'b',
      title: 'film ślubny o długości około 15 minut',
      description: null,
      sortOrder: 1,
    },
    {
      sourceItemId: 'c',
      title: 'przekazanie filmów w wersji elektronicznej',
      description: null,
      sortOrder: 2,
    },
    {
      sourceItemId: 'empty',
      title: '   ',
      description: null,
      sortOrder: 3,
    },
  ]
  const structured = buildIncludedServices(items)
  assertEq(structured.length, 3, 'omit empty')
  assertEq(structured[0]?.label, 'teledysk ślubny o długości 1–2 minut', 'order')
  const text = buildIncludedServicesText(items)
  assert(
    text.startsWith('- teledysk ślubny o długości 1–2 minut;'),
    'bullet first line',
  )
  assert(text.endsWith('.'), 'last line ends with period')
})

run('empty packageItems → empty / missing text', () => {
  const wedding = weddingStub({
    price: 9500,
    depositAmount: 1000,
    payments: [payment(1000, true)],
    packageItems: [],
  })
  const resolved = buildContractCommercialResolved(wedding)
  assertEq(resolved.includedServices.length, 0, 'includedServices')
  assert(
    resolved.values.included_services_text == null,
    'included_services_text missing',
  )
})

// —— Part 7: acceptance wedding A ——
run('wedding A: 9500 / 1000 / paid 1000', () => {
  const wedding = weddingStub({
    price: 9500,
    depositAmount: 1000,
    payments: [payment(1000, true)],
    packageName: 'Pakiet Video Mini',
  })
  const { values } = buildContractCommercialResolved(wedding)

  assertEq(values.contract_value_formatted, '9 500 zł', 'contract formatted')
  assertEq(
    values.contract_value_words,
    'dziewięć tysięcy pięćset złotych',
    'contract words',
  )
  assertEq(values.agreed_deposit_formatted, '1 000 zł', 'deposit formatted')
  assertEq(
    values.agreed_deposit_words,
    'jeden tysiąc złotych',
    'deposit words',
  )
  assertEq(
    values.remaining_after_deposit_formatted,
    '8 500 zł',
    'remaining after deposit formatted',
  )
  assertEq(
    values.remaining_after_deposit_words,
    'osiem tysięcy pięćset złotych',
    'remaining after deposit words',
  )
  assertEq(
    values.remaining_to_pay_formatted,
    '8 500 zł',
    'remaining to pay formatted',
  )
  assertEq(values.remaining_after_deposit, '8500', 'remaining after deposit raw')
  assertEq(values.remaining_to_pay, '8500', 'remaining to pay raw')
  assertEq(values.package_name, 'Pakiet Video Mini', 'exact name')
  assertEq(
    values.package_name_without_prefix,
    'Video Mini',
    'name without prefix',
  )
  // Legacy aliases
  assertEq(values.package_price, '9 500 zł', 'legacy package_price')
  assertEq(values.deposit_amount, '1 000 zł', 'legacy deposit_amount')
  assertEq(
    values.remaining_payment,
    '8 500 zł',
    'legacy remaining_payment = after deposit',
  )
})

// —— Part 7: acceptance wedding B ——
run('wedding B: paid 3000 → remainingToPay ≠ remainingAfterDeposit', () => {
  const wedding = weddingStub({
    price: 9500,
    depositAmount: 1000,
    payments: [payment(3000, true)],
  })
  const { values } = buildContractCommercialResolved(wedding)
  assertEq(values.remaining_after_deposit, '8500', 'after deposit')
  assertEq(values.remaining_to_pay, '6500', 'to pay')
  assertEq(
    values.remaining_payment,
    '8 500 zł',
    'legacy remaining_payment still after-deposit formatted',
  )
  assertEq(values.remaining_to_pay_formatted, '6 500 zł', 'to pay formatted')
})

// —— Part 6: missing deposit ——
run('missing depositAmount → no agreed deposit / after-deposit keys', () => {
  const wedding = weddingStub({
    price: 9500,
    payments: [],
  })
  const { values } = buildContractCommercialResolved(wedding)
  assert(values.agreed_deposit == null, 'no agreed_deposit')
  assert(values.agreed_deposit_formatted == null, 'no agreed formatted')
  assert(values.remaining_after_deposit == null, 'no remaining after deposit')
  assert(values.remaining_payment == null, 'no legacy remaining_payment')
  assertEq(values.contract_value_formatted, '9 500 zł', 'contract still present')
  assertEq(values.remaining_to_pay, '9500', 'remaining to pay still present')
})

if (!process.exitCode) {
  console.log('\nAll contract commercial tests passed.')
}
