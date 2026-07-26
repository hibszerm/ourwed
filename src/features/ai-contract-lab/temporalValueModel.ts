/**
 * Temporal value model for Phase B.
 * Distinguishes absolute dates, relative durations, and times of day.
 */

export type TemporalValue =
  | {
      kind: 'absolute_date'
      date: string
    }
  | {
      kind: 'relative_duration'
      amount: number
      unit: 'days' | 'weeks' | 'months'
      base: 'contract.executionDate' | 'wedding.date' | 'delivery.date'
    }
  | {
      kind: 'time_of_day'
      time: string
    }

export type RelativeDurationUnit = 'days' | 'weeks' | 'months'

const RELATIVE_PATTERNS: Array<{
  re: RegExp
  unit: RelativeDurationUnit
  baseHint?: TemporalValue extends { kind: 'relative_duration' }
    ? TemporalValue['base']
    : never
}> = [
  {
    re: /(\d+)\s*miesi[ęe]c/i,
    unit: 'months',
  },
  {
    re: /(\d+)\s*(?:tygodn|tyg\.?)/i,
    unit: 'weeks',
  },
  {
    re: /(\d+)\s*dn/i,
    unit: 'days',
  },
]

/**
 * Detect relative duration clause from document text around a temporal role.
 */
export function detectRelativeDuration(input: {
  sourceText: string
  anchorText: string
  role:
    | 'delivery_deadline'
    | 'deposit_due_date'
    | 'preview_deadline'
    | 'final_payment_due_date'
    | string
}): TemporalValue | null {
  const hay = `${input.sourceText} ${input.anchorText}`

  for (const pat of RELATIVE_PATTERNS) {
    const m = hay.match(pat.re)
    if (!m) continue
    const amount = Number(m[1])
    if (!Number.isFinite(amount) || amount <= 0) continue

    let base: 'contract.executionDate' | 'wedding.date' | 'delivery.date' =
      'wedding.date'
    if (
      input.role === 'deposit_due_date' ||
      /zawarcia|umowy|podpisania|zawarciu/i.test(hay)
    ) {
      base = 'contract.executionDate'
    } else if (
      input.role === 'delivery_deadline' ||
      /wydarze|ślub|reportaż|wesel/i.test(hay)
    ) {
      base = 'wedding.date'
    } else if (input.role === 'preview_deadline') {
      base = 'wedding.date'
    }

    // Stronger clause hints
    if (/od daty zawarcia|od dnia zawarcia|od daty podpisania/i.test(hay)) {
      base = 'contract.executionDate'
    }
    if (
      /od daty wydarze|od daty ślubu|od daty reportażu|od dnia wydarze/i.test(
        hay,
      )
    ) {
      base = 'wedding.date'
    }

    return {
      kind: 'relative_duration',
      amount,
      unit: pat.unit,
      base,
    }
  }

  return null
}

/** Absolute date TemporalValue from a date string. */
export function absoluteDateTemporal(dateIsoOrDoc: string): TemporalValue {
  return { kind: 'absolute_date', date: dateIsoOrDoc }
}

export function timeOfDayTemporal(time: string): TemporalValue {
  return { kind: 'time_of_day', time }
}

export function relativeDurationsEqual(
  a: Extract<TemporalValue, { kind: 'relative_duration' }>,
  b: { amount: number; unit: RelativeDurationUnit; base?: string },
): boolean {
  if (a.amount !== b.amount) return false
  if (a.unit !== b.unit) return false
  if (b.base && a.base !== b.base) return false
  return true
}

/** Canonical studio relative rule for a role. */
export function canonicalRelativeRule(input: {
  role: string
  deliveryMonths: number | null
  depositDueDays?: number | null
  previewDays?: number | null
}): Extract<TemporalValue, { kind: 'relative_duration' }> | null {
  if (input.role === 'delivery_deadline') {
    const months =
      input.deliveryMonths != null && input.deliveryMonths > 0
        ? input.deliveryMonths
        : 4
    return {
      kind: 'relative_duration',
      amount: months,
      unit: 'months',
      base: 'wedding.date',
    }
  }
  if (input.role === 'deposit_due_date') {
    const days =
      input.depositDueDays != null && input.depositDueDays > 0
        ? input.depositDueDays
        : 7
    return {
      kind: 'relative_duration',
      amount: days,
      unit: 'days',
      base: 'contract.executionDate',
    }
  }
  if (input.role === 'preview_deadline') {
    const days =
      input.previewDays != null && input.previewDays > 0
        ? input.previewDays
        : 14
    return {
      kind: 'relative_duration',
      amount: days,
      unit: 'days',
      base: 'wedding.date',
    }
  }
  return null
}

export function formatRelativeRule(
  v: Extract<TemporalValue, { kind: 'relative_duration' }>,
): string {
  const unitLabel =
    v.unit === 'months' ? 'months' : v.unit === 'weeks' ? 'weeks' : 'days'
  return `${v.amount} ${unitLabel} from ${v.base}`
}
