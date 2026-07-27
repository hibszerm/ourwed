/**
 * Deterministic application of manually completed payment schedule values.
 * Patches only identified amount/due-date locations — never global number replace.
 */

import { formatContractPln } from '@/lib/utils/currency'
import { amountToWordsPl } from '@/lib/utils/amountToWordsPl'
import type { TemplateSlot } from '../types'
import { formatPlnMajorUnits } from './normalize'
import {
  validateManualPaymentSubmission,
} from './paymentSchedulePolicy'
import type {
  DetectedPaymentSchedule,
  ManualPaymentScheduleSubmission,
} from './types'

export type PaymentDocumentParagraph = {
  index: number
  text: string
  blockId?: string
}

export type ApplyManualPaymentScheduleResult = {
  ok: boolean
  paragraphs: PaymentDocumentParagraph[]
  schedule: DetectedPaymentSchedule
  resolvedValues: Record<string, string>
  changedParagraphIndexes: number[]
  issues: Array<{ code: string; safeDescription: string }>
}

function replaceFirstAmount(
  text: string,
  newAmountFormatted: string,
): { text: string; changed: boolean } {
  const re = /\d[\d\s\u00a0]*\s*zł/i
  if (!re.test(text)) return { text, changed: false }
  return { text: text.replace(re, newAmountFormatted), changed: true }
}

function findParagraph(
  paragraphs: PaymentDocumentParagraph[],
  entry: { amountBlockId?: string; paragraphIndex?: number | null },
): number {
  if (entry.amountBlockId) {
    const byBlock = paragraphs.findIndex(
      (p) =>
        p.blockId === entry.amountBlockId ||
        `para-${p.index}` === entry.amountBlockId,
    )
    if (byBlock >= 0) return byBlock
  }
  if (entry.paragraphIndex != null) {
    const byIdx = paragraphs.findIndex((p) => p.index === entry.paragraphIndex)
    if (byIdx >= 0) return byIdx
  }
  return -1
}

/**
 * Apply user-submitted installment amounts into document paragraphs.
 * Bank accounts and cancellation percentages are never touched (no global digit replace).
 */
export function applyManualPaymentSchedule(input: {
  paragraphs: PaymentDocumentParagraph[]
  detectedSchedule: DetectedPaymentSchedule
  submitted: ManualPaymentScheduleSubmission
  slots?: TemplateSlot[]
  resolvedValues?: Record<string, string>
  /** Texts that must remain unchanged (bank, NIP, cancellation %). */
  protectedSnippets?: string[]
}): ApplyManualPaymentScheduleResult {
  const validated = validateManualPaymentSubmission({
    schedule: input.detectedSchedule,
    entries: input.submitted.entries,
  })
  if (!validated.ok) {
    return {
      ok: false,
      paragraphs: input.paragraphs,
      schedule: input.detectedSchedule,
      resolvedValues: input.resolvedValues ?? {},
      changedParagraphIndexes: [],
      issues: validated.issues.map((i) => ({
        code: i.code,
        safeDescription: i.safeDescription,
      })),
    }
  }

  const paragraphs = input.paragraphs.map((p) => ({ ...p }))
  const changed = new Set<number>()
  const resolved: Record<string, string> = { ...(input.resolvedValues ?? {}) }
  const protectedSnippets = input.protectedSnippets ?? []

  for (const entry of validated.applied.entries) {
    if (entry.amount == null) continue
    const formatted = formatPlnMajorUnits(entry.amount)
    const idx = findParagraph(paragraphs, entry)
    if (idx < 0) continue
    const before = paragraphs[idx]!.text

    // Skip if this paragraph looks like bank / cancellation only
    if (
      /rachunek|iban|nr\s*konta/i.test(before) &&
      !/zadatek|rata|zaliczka|pozostał/i.test(before)
    ) {
      continue
    }
    if (/potrąca|odstąpienia|kar[ay]\s+umown/i.test(before) && /%/.test(before)) {
      continue
    }

    const next = replaceFirstAmount(before, formatted)
    if (!next.changed) continue

    // Ensure protected snippets still present
    for (const snip of protectedSnippets) {
      if (snip && before.includes(snip) && !next.text.includes(snip)) {
        return {
          ok: false,
          paragraphs: input.paragraphs,
          schedule: validated.applied,
          resolvedValues: resolved,
          changedParagraphIndexes: [],
          issues: [
            {
              code: 'protected_value_would_change',
              safeDescription:
                'Aktualizacja harmonogramu naruszyłaby chronione dane w dokumencie.',
            },
          ],
        }
      }
    }

    paragraphs[idx] = { ...paragraphs[idx]!, text: next.text }
    changed.add(paragraphs[idx]!.index)

    if (entry.amountRegistryKey) {
      resolved[entry.amountRegistryKey] = formatted
      // Also set common aliases
      if (entry.normalizedRole === 'deposit') {
        resolved.agreed_deposit_formatted = formatted
        resolved.deposit_amount = formatted
        resolved.agreed_deposit_words = amountToWordsPl(entry.amount)
      }
      if (
        entry.normalizedRole === 'remaining' ||
        entry.normalizedRole === 'final'
      ) {
        resolved.remaining_after_deposit_formatted = formatted
        resolved.remaining_amount = formatted
        resolved.remaining_after_deposit_words = amountToWordsPl(entry.amount)
      }
    }

    // Due date text patch in same paragraph when present
    const sub = input.submitted.entries.find((e) => e.entryId === entry.id)
    if (
      sub?.dueDateText &&
      entry.dueDateText &&
      entry.dueDateText !== sub.dueDateText &&
      paragraphs[idx]!.text.includes(entry.dueDateText)
    ) {
      paragraphs[idx] = {
        ...paragraphs[idx]!,
        text: paragraphs[idx]!.text.replace(
          entry.dueDateText,
          sub.dueDateText,
        ),
      }
    }
  }

  // Verify no stale old installment amounts remain for patched entries
  const issues: ApplyManualPaymentScheduleResult['issues'] = []
  const joined = paragraphs.map((p) => p.text).join('\n')
  for (const entry of validated.applied.entries) {
    if (entry.amount == null) continue
    const expected = formatPlnMajorUnits(entry.amount)
    const compactExpected = expected.replace(/\s/g, '')
    if (
      entry.normalizedRole === 'installment' &&
      !joined.replace(/\s/g, '').includes(compactExpected.replace('zł', 'zł'))
    ) {
      // soft — amount may use formatContractPln without space variants
      if (!joined.includes(String(entry.amount))) {
        issues.push({
          code: 'manual_amount_not_represented',
          safeDescription: `Kwota dla „${entry.label}” nie pojawia się w dokumencie.`,
        })
      }
    }
  }

  void formatContractPln

  return {
    ok: issues.length === 0,
    paragraphs,
    schedule: validated.applied,
    resolvedValues: resolved,
    changedParagraphIndexes: [...changed],
    issues,
  }
}

/**
 * Rematerialize DOCX from patched paragraphs using existing materialize path.
 * Caller supplies materializeDocx implementation to avoid circular imports.
 */
export async function rematerializeDocxAfterPaymentPatch(input: {
  sourceBytes: ArrayBuffer
  isDocx: boolean
  paragraphs: PaymentDocumentParagraph[]
  materializeDocx: (args: {
    sourceBytes: ArrayBuffer
    isDocx: boolean
    paragraphs: Array<{ index: number; text: string }>
    spanEdits: Array<{
      index: number
      start: number
      end: number
      replacement: string
      registryKey: string
    }>
  }) => Promise<ArrayBuffer>
}): Promise<ArrayBuffer> {
  return input.materializeDocx({
    sourceBytes: input.sourceBytes,
    isDocx: input.isDocx,
    paragraphs: input.paragraphs.map((p) => ({
      index: p.index,
      text: p.text,
    })),
    // Full-paragraph rewrite via text map — spanEdits empty; materialize uses paragraph texts
    spanEdits: [],
  })
}
