/**
 * Manual payment schedule patch tests.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/payment-schedule/applyManualPaymentSchedule.test.ts
 */

import {
  applyManualPaymentSchedule,
} from './applyManualPaymentSchedule'
import { detectPaymentSchedule } from './detectPaymentSchedule'
import {
  evaluatePaymentSchedulePolicy,
  validateManualPaymentSubmission,
} from './paymentSchedulePolicy'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function main() {
  const finance = {
    totalContractAmount: 10_500,
    depositAmount: 1_000,
    remainingAmount: 9_500,
  }
  const paragraphs = [
    {
      index: 0,
      text: 'Zadatek w wysokości 1 500 zł w terminie 5 dni od zawarcia Umowy.',
    },
    {
      index: 1,
      text: 'II rata w wysokości 3 000 zł do dnia 19.06.2025 r.',
    },
    {
      index: 2,
      text: 'III rata w wysokości 4 000 zł najpóźniej w dniu ślubu.',
    },
    {
      index: 3,
      text: 'Rachunek bankowy: 12 3456 7890 1234 5678 9012 3456',
    },
    {
      index: 4,
      text: 'W razie odstąpienia potrąca się 30% wartości umowy.',
    },
  ]
  const detected = detectPaymentSchedule({
    slots: [],
    paragraphs,
    finances: finance,
  })
  const policy = evaluatePaymentSchedulePolicy(detected, finance)
  assert(policy.requiresManualCompletion, 'manual required')
  const schedule = policy.resolvedSchedule!

  const submitted = {
    entries: [
      { entryId: schedule.entries[0]!.id, amount: 1_000, dueDateText: 'w terminie 5 dni od zawarcia Umowy' },
      { entryId: schedule.entries[1]!.id, amount: 4_500, dueDateText: 'do dnia 19.06.2027 r.' },
      { entryId: schedule.entries[2]!.id, amount: 5_000, dueDateText: 'najpóźniej w dniu ślubu' },
    ],
  }
  const validated = validateManualPaymentSubmission({
    schedule,
    entries: submitted.entries,
  })
  assert(validated.ok, 'submission ok')

  const patched = applyManualPaymentSchedule({
    paragraphs,
    detectedSchedule: schedule,
    submitted,
    protectedSnippets: ['12 3456 7890 1234 5678 9012 3456'],
  })
  assert(patched.ok, 'patch ok')
  const joined = patched.paragraphs.map((p) => p.text).join('\n')
  assert(joined.includes('1 000 zł'), 'deposit amount')
  assert(joined.includes('4 500 zł'), 'II rata')
  assert(joined.includes('5 000 zł'), 'III rata')
  assert(!joined.includes('9 500 zł'), 'no duplicated remaining')
  assert(
    joined.includes('12 3456 7890 1234 5678 9012 3456'),
    'bank unchanged',
  )
  assert(joined.includes('30%'), 'cancellation % unchanged')
  assert(patched.changedParagraphIndexes.length >= 1, 'some paras changed')
  assert(!joined.includes('1 500 zł'), 'old deposit gone')
  assert(!joined.includes('3 000 zł'), 'old II gone')

  console.log('ok — applyManualPaymentSchedule')
}

main()
