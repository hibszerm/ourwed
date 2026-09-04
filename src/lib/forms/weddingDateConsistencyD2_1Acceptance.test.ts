/**
 * OURWED — D2.1 regression
 *
 * Root-cause hypothesis:
 * `mergeFormAnswersIntoWedding()` re-hydrates contract form answers for display
 * and (incorrectly) overwrites `wedding.date` with an older submitted weddingDate.
 *
 * Expected behavior:
 * if `wedding.date` is already set (canonical DB value), it must not be
 * overwritten by older contract form answers.
 */

import { mergeFormAnswersIntoWedding } from '@/lib/forms/mergeFormAnswersIntoWedding'
import type { FormAnswerJson } from '@/types/formEngine'
import type { Wedding } from '@/types/wedding'

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

async function run() {
  const wedding = {
    id: 'w1',
    date: '2026-08-18',
    // minimal couple fields used by name resolution
    couple: {
      partner1: 'A',
      partner2: 'B',
      partner1FirstName: 'A',
      partner1LastName: 'A',
      partner2FirstName: 'B',
      partner2LastName: 'B',
      partner1Email: undefined,
      partner2Email: undefined,
      partner1Phone: undefined,
      partner2Phone: undefined,
      partner1Address: undefined,
      partner2Address: undefined,
      partner1PostalCode: undefined,
      partner2PostalCode: undefined,
      partner1City: undefined,
      partner2City: undefined,
      city: '',
      venue: '',
    },
    status: 'active',
    workflowStage: 'reservation',
    packageName: '',
    packageId: null,
    price: 1000,
    depositAmount: 0,
    currency: 'PLN',
    accentColor: '#0a0a0a',
    packageItems: [],
    deliveryMonths: null,
    deliveryDays: null,
    deliveryDueDate: null,
    deliveryDueSource: null,
    deliveryCompletedAt: null,
    finalPaymentTerms: null,
    finalPaymentDueDate: null,
    ceremonyLocation: undefined,
    receptionLocation: undefined,
    bridePreparationLocation: undefined,
    groomPreparationLocation: undefined,
    preparationLocation: undefined,
    notes: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    deliverables: [],
    timeline: [],
    questionnaires: {
      contractData: { status: 'completed', sentAt: '2026-07-01', completedAt: '2026-07-01' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    createdAt: '2026-01-01',
    selectedPackageIds: [],
  } as unknown as Wedding

  const answerJson: FormAnswerJson = {
    // `extractAnswerFields()` prefers `fields` when present.
    fields: { weddingDate: '2026-08-17' },
    values: {},
    answers: [],
  } as unknown as FormAnswerJson

  const merged = await mergeFormAnswersIntoWedding(wedding, answerJson, {
    submittedAt: '2026-07-01',
  })

  assertEq(merged.date, '2026-08-18', 'canonical wedding.date must win')
}

void run().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
