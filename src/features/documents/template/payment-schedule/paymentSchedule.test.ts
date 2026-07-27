/**
 * Payment schedule detection + policy.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/payment-schedule/paymentSchedule.test.ts
 */

import type { TemplateSlot } from '../types'
import { detectPaymentSchedule } from './detectPaymentSchedule'
import { formatPlnMajorUnits } from './normalize'
import {
  evaluatePaymentSchedulePolicy,
  validateManualPaymentSubmission,
} from './paymentSchedulePolicy'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function slot(
  partial: Partial<TemplateSlot> & { id: string; registryKey: string },
): TemplateSlot {
  return {
    label: partial.label ?? partial.registryKey,
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    ...partial,
  }
}

function main() {
  const finance = {
    totalContractAmount: 10_500,
    depositAmount: 1_000,
    remainingAmount: 9_500,
  }

  // 1. Two-entry auto
  {
    const schedule = detectPaymentSchedule({
      slots: [
        slot({
          id: 's-dep',
          registryKey: 'agreed_deposit_formatted',
          label: 'Zadatek',
          originalText: '1 500 zł',
          paragraphIndex: 2,
        }),
        slot({
          id: 's-rem',
          registryKey: 'remaining_after_deposit_formatted',
          label: 'Pozostała kwota',
          originalText: '7 000 zł',
          paragraphIndex: 3,
        }),
      ],
      finances: finance,
    })
    const policy = evaluatePaymentSchedulePolicy(schedule, finance)
    assert(policy.canAutoFill, '2-entry auto')
    assert(!policy.requiresManualCompletion, 'no manual')
    assert(policy.resolvedSchedule?.entries[0]?.amount === 1_000, 'deposit ourwed')
    assert(policy.resolvedSchedule?.entries[1]?.amount === 9_500, 'remaining ourwed')
  }

  // 2. Three-entry manual — amounts stay null for installments
  {
    const schedule = detectPaymentSchedule({
      slots: [
        slot({
          id: 's-dep',
          registryKey: 'agreed_deposit_formatted',
          label: 'Zadatek',
          originalText: '1 000 zł',
          paragraphIndex: 1,
        }),
      ],
      paragraphs: [
        {
          index: 10,
          text: 'Zadatek w wysokości 1 000 zł w terminie 5 dni od zawarcia Umowy.',
        },
        {
          index: 11,
          text: 'II rata w wysokości 3 000 zł do dnia 19.06.2025 r.',
        },
        {
          index: 12,
          text: 'III rata w wysokości 4 000 zł najpóźniej w dniu ślubu.',
        },
      ],
      finances: finance,
    })
    const policy = evaluatePaymentSchedulePolicy(schedule, finance)
    assert(policy.requiresManualCompletion, '3-entry manual')
    assert(!policy.canAutoFill, 'not auto')
    const unresolved = policy.resolvedSchedule!.entries.filter(
      (e) => e.amount == null || e.requiresManualAmount,
    )
    assert(unresolved.length >= 2, 'installments unresolved')
    assert(
      policy.resolvedSchedule!.entries.every(
        (e) =>
          e.normalizedRole === 'deposit' ||
          e.amount == null ||
          e.amountSource === 'ourwed',
      ),
      'no invented installment amounts',
    )
  }

  // 3. Sum validation
  {
    const schedule = detectPaymentSchedule({
      slots: [],
      paragraphs: [
        { index: 1, text: 'Zadatek 1 000 zł w terminie 5 dni.' },
        { index: 2, text: 'II rata do dnia 19.06.2027 r.' },
        { index: 3, text: 'III rata najpóźniej w dniu ślubu.' },
      ],
      finances: finance,
    })
    const policy = evaluatePaymentSchedulePolicy(schedule, finance)
    const base = policy.resolvedSchedule!
    const low = validateManualPaymentSubmission({
      schedule: base,
      entries: [
        { entryId: base.entries[0]!.id, amount: 1_000, dueDateText: '5 dni' },
        { entryId: base.entries[1]!.id, amount: 4_000, dueDateText: 'do dnia' },
        { entryId: base.entries[2]!.id, amount: 3_000, dueDateText: 'ślub' },
      ],
    })
    assert(!low.ok && low.sum === 8_000, 'sum too low')

    const high = validateManualPaymentSubmission({
      schedule: base,
      entries: [
        { entryId: base.entries[0]!.id, amount: 1_000, dueDateText: '5 dni' },
        { entryId: base.entries[1]!.id, amount: 6_000, dueDateText: 'do dnia' },
        { entryId: base.entries[2]!.id, amount: 5_000, dueDateText: 'ślub' },
      ],
    })
    assert(!high.ok && high.sum === 12_000, 'sum too high')

    const exact = validateManualPaymentSubmission({
      schedule: base,
      entries: [
        { entryId: base.entries[0]!.id, amount: 1_000, dueDateText: '5 dni' },
        { entryId: base.entries[1]!.id, amount: 4_500, dueDateText: 'do dnia' },
        { entryId: base.entries[2]!.id, amount: 5_000, dueDateText: 'ślub' },
      ],
    })
    assert(exact.ok && exact.sum === 10_500, 'exact sum')
  }

  assert(formatPlnMajorUnits(10500) === '10 500 zł', 'format')

  console.log('ok — payment-schedule detection/policy')
}

main()
