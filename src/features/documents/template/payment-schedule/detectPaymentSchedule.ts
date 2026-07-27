/**
 * Detect payment schedule structure from template slots + paragraphs.
 * Does not invent installment amounts.
 */

import type { TemplateSlot } from '../types'
import {
  installmentOrdinal,
  normalizePaymentLabelRole,
  parsePlnMajorUnits,
} from './normalize'
import type {
  DetectedPaymentEntry,
  DetectedPaymentSchedule,
  OurWedFinanceSnapshot,
} from './types'

const DEPOSIT_KEYS = new Set([
  'deposit_amount',
  'deposit_amount_words',
  'agreed_deposit',
  'agreed_deposit_formatted',
  'agreed_deposit_words',
])

const REMAINING_KEYS = new Set([
  'remaining_amount',
  'remaining_amount_words',
  'remaining_after_deposit',
  'remaining_after_deposit_formatted',
  'remaining_after_deposit_words',
  'remaining_to_pay',
  'remaining_to_pay_formatted',
  'remaining_to_pay_words',
])

const DUE_KEYS = new Set([
  'deposit_due_date',
  'final_payment_due_date',
  'final_payment_due_date_long',
  'payment_due_date',
  'payment_deadline',
])

const WORDS_KEYS = new Set([
  'deposit_amount_words',
  'agreed_deposit_words',
  'remaining_amount_words',
  'remaining_after_deposit_words',
  'remaining_to_pay_words',
])

export type PaymentParagraphEvidence = {
  index: number
  text: string
  blockId?: string
}

const SCHEDULE_LINE_RE =
  /(?:^|\n)\s*((?:zadatek|zaliczka|i{1,3}\s*\.?\s*rata|1\s*\.?\s*rata|2\s*\.?\s*rata|3\s*\.?\s*rata|pierwsza\s+rata|druga\s+rata|trzecia\s+rata|pozostała\s+kwota|reszta|płatność\s+końcowa)[^\n]{0,120})/gi

function isAmountKey(key: string | null | undefined): boolean {
  if (!key) return false
  if (WORDS_KEYS.has(key)) return false
  return DEPOSIT_KEYS.has(key) || REMAINING_KEYS.has(key)
}

function roleFromRegistryKey(key: string | null): DetectedPaymentEntry['normalizedRole'] {
  if (!key) return 'other'
  if (DEPOSIT_KEYS.has(key)) return 'deposit'
  if (REMAINING_KEYS.has(key)) return 'remaining'
  return 'other'
}

function newScheduleId(): string {
  return `ps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Build schedule from bound slots first; supplement with paragraph label evidence
 * for multi-installment templates that lack distinct registry keys per rata.
 */
export function detectPaymentSchedule(input: {
  slots: TemplateSlot[]
  paragraphs?: PaymentParagraphEvidence[]
  finances: OurWedFinanceSnapshot
}): DetectedPaymentSchedule {
  const entries: DetectedPaymentEntry[] = []
  const amountSlots = input.slots.filter(
    (s) => s.enabled !== false && isAmountKey(s.registryKey) && s.physicallyBound,
  )

  // Group deposit / remaining from slots (one entry per role)
  const depositSlot = amountSlots.find((s) =>
    DEPOSIT_KEYS.has(s.registryKey ?? ''),
  )
  const remainingSlot = amountSlots.find((s) =>
    REMAINING_KEYS.has(s.registryKey ?? ''),
  )

  let order = 0
  if (depositSlot) {
    order += 1
    const templateAmount = parsePlnMajorUnits(
      depositSlot.originalText ?? depositSlot.exampleText,
    )
    entries.push({
      id: `entry-deposit-${depositSlot.id}`,
      order,
      label: depositSlot.label || 'Zadatek',
      normalizedRole: 'deposit',
      amount: null, // filled by policy from OurWed — never invent from template alone for auto
      amountSlotId: depositSlot.id,
      amountRegistryKey: depositSlot.registryKey,
      amountBlockId:
        depositSlot.paragraphIndex != null
          ? `para-${depositSlot.paragraphIndex}`
          : undefined,
      dueDate: null,
      dueDateText: null,
      amountSource: 'unknown',
      dueDateSource: 'unknown',
      requiresManualAmount: true,
      requiresManualDueDate: false,
      paragraphIndex: depositSlot.paragraphIndex ?? null,
    })
    void templateAmount
  }

  if (remainingSlot) {
    order += 1
    entries.push({
      id: `entry-remaining-${remainingSlot.id}`,
      order,
      label: remainingSlot.label || 'Pozostała kwota',
      normalizedRole: 'remaining',
      amount: null,
      amountSlotId: remainingSlot.id,
      amountRegistryKey: remainingSlot.registryKey,
      amountBlockId:
        remainingSlot.paragraphIndex != null
          ? `para-${remainingSlot.paragraphIndex}`
          : undefined,
      dueDate: null,
      dueDateText: null,
      amountSource: 'unknown',
      dueDateSource: 'unknown',
      requiresManualAmount: true,
      requiresManualDueDate: false,
      paragraphIndex: remainingSlot.paragraphIndex ?? null,
    })
  }

  // Paragraph-driven installments (II rata, III rata, …)
  const paraEntries: DetectedPaymentEntry[] = []
  for (const p of input.paragraphs ?? []) {
    const text = p.text
    SCHEDULE_LINE_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SCHEDULE_LINE_RE.exec(text))) {
      const line = m[1]!.trim()
      const role = normalizePaymentLabelRole(line)
      const ordinal = installmentOrdinal(line)

      const amountMatch = line.match(/([\d\s]+)\s*zł/i)
      const templateAmount = amountMatch
        ? parsePlnMajorUnits(amountMatch[1])
        : null
      const dueTextMatch = line.match(
        /(?:w\s+terminie|do\s+dnia|najpóźniej)[^.…]{3,80}/i,
      )

      paraEntries.push({
        id: `entry-para-${p.index}-${paraEntries.length}`,
        order: 0,
        label: line.split(/[,:]/)[0]?.trim() || line.slice(0, 40),
        normalizedRole:
          role === 'other' && ordinal != null ? 'installment' : role,
        amount: null, // never auto-reuse template installment amounts
        amountBlockId: p.blockId ?? `para-${p.index}`,
        dueDate: null,
        dueDateText: dueTextMatch?.[0]?.trim() ?? null,
        dueDateBlockId: dueTextMatch
          ? (p.blockId ?? `para-${p.index}`)
          : undefined,
        labelBlockId: p.blockId ?? `para-${p.index}`,
        amountSource: 'template',
        dueDateSource: dueTextMatch ? 'template' : 'unknown',
        requiresManualAmount: true,
        requiresManualDueDate: !dueTextMatch,
        paragraphIndex: p.index,
      })
      void templateAmount
    }
  }

  const hasInstallmentPara = paraEntries.some(
    (e) => e.normalizedRole === 'installment',
  )
  const useParagraphSchedule =
    paraEntries.length >= 3 ||
    (hasInstallmentPara && paraEntries.length >= 2)

  let finalEntries = entries
  if (useParagraphSchedule) {
    // Prefer full paragraph structure; link deposit/remaining slots by role
    finalEntries = paraEntries.map((e, i) => {
      let linked = { ...e, order: i + 1 }
      if (e.normalizedRole === 'deposit' && depositSlot) {
        linked = {
          ...linked,
          amountSlotId: depositSlot.id,
          amountRegistryKey: depositSlot.registryKey,
        }
      }
      if (
        (e.normalizedRole === 'remaining' || e.normalizedRole === 'final') &&
        remainingSlot
      ) {
        linked = {
          ...linked,
          amountSlotId: remainingSlot.id,
          amountRegistryKey: remainingSlot.registryKey,
        }
      }
      return linked
    })
  } else if (entries.length === 0 && paraEntries.length > 0) {
    finalEntries = paraEntries.map((e, i) => ({ ...e, order: i + 1 }))
  }

  // Attach due-date slots when present
  const dueSlots = input.slots.filter(
    (s) => s.enabled !== false && s.registryKey && DUE_KEYS.has(s.registryKey),
  )
  for (const entry of finalEntries) {
    if (entry.dueDateText) continue
    const due =
      entry.normalizedRole === 'deposit'
        ? dueSlots.find((s) => s.registryKey === 'deposit_due_date')
        : dueSlots.find(
            (s) =>
              s.registryKey === 'final_payment_due_date' ||
              s.registryKey === 'payment_due_date',
          )
    if (due?.originalText || due?.exampleText) {
      entry.dueDateText = (due.originalText ?? due.exampleText ?? '').trim()
      entry.dueDateSlotId = due.id
      entry.dueDateSource = 'template'
      entry.requiresManualDueDate = false
    }
  }

  const schedule: DetectedPaymentSchedule = {
    scheduleId: newScheduleId(),
    totalContractAmount: input.finances.totalContractAmount,
    currency: 'PLN',
    entries: finalEntries,
    source: 'template_analysis',
    requiresManualCompletion: false, // set by policy
  }

  return schedule
}

export function roleFromRegistryKeyExport(key: string | null) {
  return roleFromRegistryKey(key)
}
