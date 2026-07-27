/**
 * Structured final-payment terms (Package catalog + Wedding snapshot).
 * Concrete due dates are derived when wedding/delivery dates allow.
 */

export type FinalPaymentTermsMode =
  | 'wedding_day'
  | 'days_after_wedding'
  | 'months_after_wedding'
  | 'after_delivery'

export type FinalPaymentTerms =
  | { mode: 'wedding_day' }
  | { mode: 'days_after_wedding'; value: number }
  | { mode: 'months_after_wedding'; value: number }
  | { mode: 'after_delivery' }

export const FINAL_PAYMENT_TERMS_MODE_OPTIONS: Array<{
  mode: FinalPaymentTermsMode
  label: string
  needsValue: boolean
}> = [
  { mode: 'wedding_day', label: 'W dniu ślubu', needsValue: false },
  {
    mode: 'days_after_wedding',
    label: 'Do X dni od daty ślubu',
    needsValue: true,
  },
  {
    mode: 'months_after_wedding',
    label: 'Do X miesięcy od daty ślubu',
    needsValue: true,
  },
  { mode: 'after_delivery', label: 'Po oddaniu materiału', needsValue: false },
]

export function parseFinalPaymentTerms(raw: unknown): FinalPaymentTerms | null {
  if (!raw || typeof raw !== 'object') return null
  const mode = (raw as { mode?: unknown }).mode
  const valueRaw = (raw as { value?: unknown }).value
  const value =
    typeof valueRaw === 'number'
      ? valueRaw
      : typeof valueRaw === 'string' && valueRaw.trim()
        ? Number(valueRaw)
        : null

  if (mode === 'wedding_day') return { mode: 'wedding_day' }
  if (mode === 'after_delivery') return { mode: 'after_delivery' }
  if (mode === 'days_after_wedding') {
    if (value == null || !Number.isFinite(value) || value <= 0) return null
    return { mode: 'days_after_wedding', value: Math.round(value) }
  }
  if (mode === 'months_after_wedding') {
    if (value == null || !Number.isFinite(value) || value <= 0) return null
    return { mode: 'months_after_wedding', value: Math.round(value) }
  }
  return null
}

export function validateFinalPaymentTerms(
  terms: FinalPaymentTerms | null | undefined,
): string | null {
  if (!terms) return 'Wybierz termin płatności końcowej.'
  if (terms.mode === 'days_after_wedding' || terms.mode === 'months_after_wedding') {
    if (!Number.isFinite(terms.value) || terms.value <= 0) {
      return 'Podaj dodatnią liczbę dni lub miesięcy.'
    }
    if (!Number.isInteger(terms.value)) {
      return 'Wartość musi być liczbą całkowitą.'
    }
  }
  return null
}

/** Persist only the fields needed for the selected mode. */
export function normalizeFinalPaymentTerms(
  terms: FinalPaymentTerms,
): FinalPaymentTerms {
  if (terms.mode === 'days_after_wedding') {
    return { mode: 'days_after_wedding', value: Math.round(terms.value) }
  }
  if (terms.mode === 'months_after_wedding') {
    return { mode: 'months_after_wedding', value: Math.round(terms.value) }
  }
  return { mode: terms.mode }
}

export function formatFinalPaymentTerms(
  terms: FinalPaymentTerms | null | undefined,
): string {
  if (!terms) return ''
  switch (terms.mode) {
    case 'wedding_day':
      return 'W dniu ślubu'
    case 'days_after_wedding': {
      const n = terms.value
      return n === 1
        ? 'Do 1 dnia od daty ślubu'
        : `Do ${n} dni od daty ślubu`
    }
    case 'months_after_wedding': {
      const n = terms.value
      const word = n === 1 ? 'miesiąca' : 'miesięcy'
      return `Do ${n} ${word} od daty ślubu`
    }
    case 'after_delivery':
      return 'Po oddaniu materiału'
    default:
      return ''
  }
}

function parseIsoDate(iso: string): Date | null {
  const trimmed = iso.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const d = new Date(`${trimmed}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Derive a concrete YYYY-MM-DD when the rule + wedding date allow it.
 * `after_delivery` needs an explicit delivery date — otherwise returns null.
 */
export function resolveFinalPaymentDueDate(input: {
  terms: FinalPaymentTerms | null | undefined
  weddingDate: string
  /** Actual or contractual delivery completion date, if known. */
  deliveryDate?: string | null
}): string | null {
  const terms = input.terms
  if (!terms) return null

  if (terms.mode === 'after_delivery') {
    if (!input.deliveryDate) return null
    const delivery = parseIsoDate(input.deliveryDate)
    return delivery ? toIsoDate(delivery) : null
  }

  const wedding = parseIsoDate(input.weddingDate)
  if (!wedding) return null

  if (terms.mode === 'wedding_day') return toIsoDate(wedding)

  if (terms.mode === 'days_after_wedding') {
    const d = new Date(wedding)
    d.setDate(d.getDate() + terms.value)
    return toIsoDate(d)
  }

  if (terms.mode === 'months_after_wedding') {
    const d = new Date(wedding)
    d.setMonth(d.getMonth() + terms.value)
    return toIsoDate(d)
  }

  return null
}

/** True when readiness can treat final payment as present. */
export function isFinalPaymentTermsSatisfied(input: {
  terms: FinalPaymentTerms | null | undefined
  dueDate: string | null | undefined
}): boolean {
  if (input.dueDate?.trim()) return true
  if (!input.terms) return false
  // Rule without a concrete date is enough for after_delivery.
  return input.terms.mode === 'after_delivery'
}
