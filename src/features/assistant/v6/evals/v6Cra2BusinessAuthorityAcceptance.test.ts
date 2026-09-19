/**
 * CRA2 — Finance adapters remain delegated to canonical business authority.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Payment, Wedding } from '@/types/wedding'
import { WeddingReadContext } from '../adapters/WeddingReadContext'
import {
  getAgreedDeposit,
  getContractValue,
  getDepositPaid,
  getEffectiveTravelFeeAmount,
  getRemainingAfterDeposit,
  getRemainingToPay,
  getTotalPaid,
  hasPaidDepositPayment,
} from '../adapters/financeAuthority'
import { inspectConcept } from '../adapters/inspectAdapters'
import type { ConceptKey } from '../registry'

const payments: Payment[] = [
  {
    id: 'deposit',
    label: 'Zadatek',
    amount: 2_500,
    type: 'deposit',
    paid: true,
    paidAt: '2026-02-01',
  },
  {
    id: 'installment',
    label: 'Druga rata',
    amount: 1_500,
    type: 'installment',
    paid: true,
    paidAt: '2026-04-01',
  },
  {
    id: 'future',
    label: 'Płatność końcowa',
    amount: 8_000,
    type: 'final',
    paid: false,
    dueDate: '2027-06-01',
  },
]

const wedding = {
  id: 'cra2-authority',
  couple: {
    partner1: 'Anna',
    partner2: 'Jan',
    email: '',
    phone: '',
    venue: '',
    city: 'Kraków',
  },
  date: '2027-06-12',
  status: 'active',
  workflowStage: 'deposit',
  packageName: 'Reportaż',
  price: 12_000,
  depositAmount: 2_500,
  currency: 'PLN',
  packageItems: [],
  travelFeeStatus: 'charged',
  travelFeeAmount: 650,
  checklist: [],
  schedule: [],
  payments,
  finances: [],
  questionnaires: {
    contractData: { status: 'completed' },
    weddingQuestionnaire: { status: 'sent' },
  },
  contract: { status: 'signed' },
  notes: [],
  deliverables: [],
  timeline: [],
  accentColor: '#000000',
  createdAt: '2026-01-01T00:00:00.000Z',
} satisfies Wedding

const context = new WeddingReadContext(wedding.id, {
  seeded: { wedding, payments },
})

const expected = new Map<ConceptKey, number | boolean>([
  ['FIN.CONTRACT_VALUE', getContractValue(wedding)],
  ['FIN.AGREED_DEPOSIT', getAgreedDeposit(wedding)],
  ['FIN.TOTAL_PAID', getTotalPaid(payments)],
  [
    'FIN.REMAINING_TO_PAY',
    getRemainingToPay(getContractValue(wedding), payments),
  ],
  [
    'FIN.REMAINING_AFTER_DEPOSIT',
    getRemainingAfterDeposit(
      getContractValue(wedding),
      getAgreedDeposit(wedding),
    ),
  ],
  ['FIN.DEPOSIT_PAID_AMOUNT', getDepositPaid(payments)],
  ['FIN.DEPOSIT_PAID', hasPaidDepositPayment(payments)],
  ['TRAVEL.EFFECTIVE_FEE', getEffectiveTravelFeeAmount(wedding)],
])

let behavioralChecks = 0
for (const [concept, authoritativeValue] of expected) {
  const inspected = await inspectConcept(context, concept)
  assert.equal(
    inspected.value,
    authoritativeValue,
    `${concept} must equal its canonical helper`,
  )
  behavioralChecks += 1
}

const adaptersUrl = new URL('../adapters/inspectAdapters.ts', import.meta.url)
const authorityUrl = new URL('../adapters/financeAuthority.ts', import.meta.url)
const inspectSource = readFileSync(fileURLToPath(adaptersUrl), 'utf8')
const authoritySource = readFileSync(fileURLToPath(authorityUrl), 'utf8')
const authoritySurface = `${inspectSource}\n${authoritySource}`

const requiredAuthorityNames = [
  'hasPaidDepositPayment',
  'getContractValue',
  'getAgreedDeposit',
  'getRemainingToPay',
  'getEffectiveTravelFeeAmount',
  'resolveFinalPaymentDueDate',
]
for (const helper of requiredAuthorityNames) {
  assert.match(
    authoritySurface,
    new RegExp(`\\b${helper}\\b`),
    `canonical authority surface must reference ${helper}`,
  )
}
assert.match(
  inspectSource,
  /from ['"]\.\/financeAuthority['"]/,
  'inspect adapters must import finance authority instead of bypassing it',
)

const suspiciousLocalFormulas = [
  /\bprice\s*-\s*paid\b/i,
  /\btotalPaid\s*>=\s*agreedDeposit\b/i,
]
for (const formula of suspiciousLocalFormulas) {
  assert.doesNotMatch(
    inspectSource,
    formula,
    `inspect adapters contain suspicious local formula ${formula}`,
  )
  assert.doesNotMatch(
    authoritySource,
    formula,
    `finance authority contains suspicious local formula ${formula}`,
  )
}

console.log(
  `v6Cra2BusinessAuthorityAcceptance PASS (${behavioralChecks} behavioral, ${requiredAuthorityNames.length + 5} source checks)`,
)
