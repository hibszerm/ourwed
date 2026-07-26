/**
 * Structured payment due-date rules inferred from template source dates.
 */

import {
  formatDotDateFromIso,
  parseFlexibleDate,
} from '@/features/ai-contract-lab/semanticValueEquality'
import type { TemplateSlot } from './types'

export type PaymentDueRule =
  | { type: 'wedding_date' }
  | { type: 'days_before_wedding'; days: number }
  | { type: 'days_after_wedding'; days: number }
  | { type: 'contract_execution_date' }
  | { type: 'days_after_contract'; days: number }
  | { type: 'fixed_template_value' }
  | { type: 'manual_at_generation' }

const DUE_KEYS = new Set([
  'final_payment_due_date',
  'final_payment_due_date_long',
  'payment_due_date',
  'payment_deadline',
])

const WEDDING_DATE_KEYS = new Set(['wedding_date', 'wedding_date_long'])

const EXEC_DATE_KEYS = new Set([
  'contract_execution_date',
  'contract_date',
  'agreement_date',
])

function daysBetweenIso(a: string, b: string): number | null {
  const am = a.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const bm = b.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!am || !bm) return null
  const ad = Date.UTC(Number(am[1]), Number(am[2]) - 1, Number(am[3]))
  const bd = Date.UTC(Number(bm[1]), Number(bm[2]) - 1, Number(bm[3]))
  return Math.round((bd - ad) / 86_400_000)
}

function addDaysIso(iso: string, days: number): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Math.round(days)),
  )
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function firstOriginal(
  slots: TemplateSlot[],
  keys: Set<string>,
): string | null {
  for (const slot of slots) {
    if (!slot.registryKey || !keys.has(slot.registryKey)) continue
    const t = slot.originalText?.trim()
    if (t) return t
  }
  return null
}

function clauseImpliesWeddingDay(text: string): boolean {
  return /najpóźniej\s+w\s+dniu\s+ślubu|w\s+dniu\s+ślubu|w\s+dniu\s+wesela|w\s+dniu\s+reportażu/i.test(
    text,
  )
}

/**
 * Infer a payment due rule from physically bound template slots.
 * Does not invent relative rules without source evidence.
 */
export function inferPaymentDueRule(input: {
  slots: TemplateSlot[]
  /** Optional surrounding paragraph text for literal wording checks. */
  paragraphTexts?: string[]
}): PaymentDueRule {
  const dueText = firstOriginal(input.slots, DUE_KEYS)
  const weddingText = firstOriginal(input.slots, WEDDING_DATE_KEYS)
  const execText = firstOriginal(input.slots, EXEC_DATE_KEYS)

  const joined = [
    dueText ?? '',
    ...(input.paragraphTexts ?? []),
  ].join('\n')

  if (clauseImpliesWeddingDay(joined)) {
    return { type: 'wedding_date' }
  }

  const dueIso = dueText ? parseFlexibleDate(dueText) : null
  const weddingIso = weddingText ? parseFlexibleDate(weddingText) : null
  const execIso = execText ? parseFlexibleDate(execText) : null

  if (dueIso && weddingIso && dueIso === weddingIso) {
    return { type: 'wedding_date' }
  }

  if (dueIso && weddingIso) {
    const delta = daysBetweenIso(dueIso, weddingIso)
    if (delta != null && delta > 0 && delta <= 120) {
      return { type: 'days_before_wedding', days: delta }
    }
    if (delta != null && delta < 0 && delta >= -120) {
      return { type: 'days_after_wedding', days: -delta }
    }
  }

  if (dueIso && execIso && dueIso === execIso) {
    return { type: 'contract_execution_date' }
  }

  if (dueIso && execIso) {
    const delta = daysBetweenIso(execIso, dueIso)
    if (delta != null && delta > 0 && delta <= 120) {
      return { type: 'days_after_contract', days: delta }
    }
  }

  // Clear calendar date in template with no relational evidence — ask.
  if (dueIso && !weddingIso && !execIso) {
    return { type: 'manual_at_generation' }
  }

  if (!dueIso && dueText && !isLikelyInvariantBoilerplate(dueText)) {
    return { type: 'manual_at_generation' }
  }

  if (!dueText) {
    return { type: 'manual_at_generation' }
  }

  return { type: 'fixed_template_value' }
}

function isLikelyInvariantBoilerplate(text: string): boolean {
  return /najpóźniej\s+w\s+dniu\s+ślubu|w\s+terminie\s+określonym/i.test(text)
}

export function resolvePaymentDueIso(input: {
  rule: PaymentDueRule
  weddingDateIso: string | null | undefined
  contractExecutionDateIso?: string | null
  templateDueText?: string | null
}): string | null {
  const wedding = input.weddingDateIso?.trim() || null
  const exec = input.contractExecutionDateIso?.trim() || null

  switch (input.rule.type) {
    case 'wedding_date':
      return wedding && /^\d{4}-\d{2}-\d{2}/.test(wedding)
        ? wedding.slice(0, 10)
        : null
    case 'days_before_wedding':
      return wedding ? addDaysIso(wedding.slice(0, 10), -input.rule.days) : null
    case 'days_after_wedding':
      return wedding ? addDaysIso(wedding.slice(0, 10), input.rule.days) : null
    case 'contract_execution_date':
      return exec && /^\d{4}-\d{2}-\d{2}/.test(exec) ? exec.slice(0, 10) : null
    case 'days_after_contract':
      return exec ? addDaysIso(exec.slice(0, 10), input.rule.days) : null
    case 'fixed_template_value': {
      const parsed = input.templateDueText
        ? parseFlexibleDate(input.templateDueText)
        : null
      return parsed
    }
    case 'manual_at_generation':
      return null
    default:
      return null
  }
}

/** Short dotted display for a resolved due ISO (no trailing r.). */
export function formatPaymentDueShort(iso: string | null): string {
  if (!iso) return ''
  return formatDotDateFromIso(iso)
}

export function paymentDueRuleNeedsManualInput(rule: PaymentDueRule): boolean {
  return rule.type === 'manual_at_generation'
}

export function describePaymentDueRule(rule: PaymentDueRule): string {
  switch (rule.type) {
    case 'wedding_date':
      return 'Termin płatności = data ślubu'
    case 'days_before_wedding':
      return `Termin płatności = ${rule.days} dni przed ślubem`
    case 'days_after_wedding':
      return `Termin płatności = ${rule.days} dni po ślubie`
    case 'contract_execution_date':
      return 'Termin płatności = data zawarcia umowy'
    case 'days_after_contract':
      return `Termin płatności = ${rule.days} dni po zawarciu umowy`
    case 'fixed_template_value':
      return 'Termin płatności = wartość ze szablonu'
    case 'manual_at_generation':
      return 'Termin płatności wymaga wyboru przy generowaniu'
  }
}
