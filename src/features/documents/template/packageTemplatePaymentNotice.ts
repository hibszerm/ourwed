/**
 * Package-upload payment notice — mirrors generation policy without wedding data.
 */

import { detectPaymentSchedule } from './payment-schedule/detectPaymentSchedule'
import { evaluatePaymentSchedulePolicy } from './payment-schedule/paymentSchedulePolicy'

export const PACKAGE_TEMPLATE_PAYMENT_NOTICE =
  'Ten szablon ma niestandardowy harmonogram płatności. Przy generowaniu umowy możesz zostać poproszony o doprecyzowanie rat.'

/**
 * Warn only when a typical wedding finance snapshot would still require
 * manual payment clarification (3+ installments / ambiguous).
 * Standard deposit + remaining / final payment must NOT warn.
 */
export function assessPackageTemplatePaymentNotice(
  paragraphs: Array<{ index: number; text: string }>,
): string | null {
  const finances = {
    totalContractAmount: 10_000,
    depositAmount: 3_000,
    remainingAmount: 7_000,
  }
  const detected = detectPaymentSchedule({
    slots: [],
    paragraphs,
    finances,
  })

  if (detected.entries.length === 0) return null

  const policy = evaluatePaymentSchedulePolicy(detected, finances)
  if (!policy.requiresManualCompletion) return null
  return PACKAGE_TEMPLATE_PAYMENT_NOTICE
}
