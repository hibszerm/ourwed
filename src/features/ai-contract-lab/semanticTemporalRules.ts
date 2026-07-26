/**
 * Deterministic temporal rules for Phase B derived dates.
 */

import {
  formatDotDateFromIso,
  parseFlexibleDate,
} from '@/features/ai-contract-lab/semanticValueEquality'
import type { ContractSemanticRole } from '@/features/ai-contract-lab/semanticRoleCatalog'

export type TemporalBase =
  | 'wedding.date'
  | 'contract.executionDate'

export type TemporalRule = {
  base: TemporalBase
  offsetDays?: number
  offsetMonths?: number
  displayMapping: string
  fieldKey: string
}

export const SEMANTIC_TEMPORAL_RULES: Partial<
  Record<ContractSemanticRole, TemporalRule>
> = {
  deposit_due_date: {
    base: 'contract.executionDate',
    offsetDays: 7,
    displayMapping: 'derived(contract.executionDate + 7d)',
    fieldKey: 'derived.deposit_due_from_contract_date',
  },
  delivery_deadline: {
    base: 'wedding.date',
    offsetMonths: 4,
    displayMapping: 'derived(wedding.date + deliveryMonths)',
    fieldKey: 'derived.delivery_deadline',
  },
  preview_deadline: {
    base: 'wedding.date',
    offsetDays: 14,
    displayMapping: 'derived(wedding.date + previewDays)',
    fieldKey: 'derived.preview_deadline',
  },
  payment_due_date: {
    base: 'wedding.date',
    offsetDays: 0,
    displayMapping: 'derived(wedding.date)',
    fieldKey: 'derived.final_payment_due_on_wedding_date',
  },
}

function addDaysIso(isoDate: string, days: number): string | null {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(Date.UTC(y, mo, day + Math.round(days)))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function addMonthsIso(isoDate: string, months: number): string | null {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(Date.UTC(y, mo + Math.round(months), day))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export function computeTemporalValue(input: {
  rule: TemporalRule
  baseIso: string | null
  /** Override months for delivery when studio setting exists. */
  deliveryMonths?: number | null
  previewDays?: number | null
}): { iso: string; formatted: string } | null {
  if (!input.baseIso) return null
  let iso: string | null = input.baseIso

  if (input.rule.fieldKey === 'derived.delivery_deadline') {
    const months =
      input.deliveryMonths != null && input.deliveryMonths > 0
        ? input.deliveryMonths
        : (input.rule.offsetMonths ?? 4)
    iso = addMonthsIso(input.baseIso, months)
  } else if (input.rule.fieldKey === 'derived.preview_deadline') {
    const days =
      input.previewDays != null && input.previewDays > 0
        ? input.previewDays
        : (input.rule.offsetDays ?? 14)
    iso = addDaysIso(input.baseIso, days)
  } else if (input.rule.offsetMonths != null && input.rule.offsetMonths !== 0) {
    iso = addMonthsIso(input.baseIso, input.rule.offsetMonths)
  } else if (input.rule.offsetDays != null && input.rule.offsetDays !== 0) {
    iso = addDaysIso(input.baseIso, input.rule.offsetDays)
  }

  if (!iso) return null
  return { iso, formatted: formatDotDateFromIso(iso) }
}

export function isoFromAnyDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  return parseFlexibleDate(value) ?? (/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null)
}
