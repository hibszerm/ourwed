/**
 * Numeric semantic-family isolation — overtime_rate must not bind to
 * contract value / deposit / installment amounts by proximity.
 */

export type NumericSemanticFamily =
  | 'overtime_rate'
  | 'contract_value'
  | 'deposit'
  | 'remaining'
  | 'installment'
  | 'other_money'

const OVERTIME_KEYS = new Set([
  'overtime_rate',
  'overtime_rate_formatted',
  'overtime_rate_words',
  'overtime_price',
  'package_overtime_rate',
])

const CONTRACT_VALUE_KEYS = new Set([
  'contract_value',
  'contract_value_formatted',
  'contract_value_words',
  'package_price',
  'package_price_formatted',
])

const DEPOSIT_KEYS = new Set([
  'deposit_amount',
  'agreed_deposit',
  'agreed_deposit_formatted',
  'agreed_deposit_words',
  'deposit',
])

const REMAINING_KEYS = new Set([
  'remaining_amount',
  'remaining_after_deposit',
  'remaining_after_deposit_formatted',
  'remaining_payment',
  'remainingAfterDeposit',
])

export function numericFamilyForRegistryKey(
  key: string,
): NumericSemanticFamily {
  const k = key.trim()
  if (OVERTIME_KEYS.has(k) || /overtime|nadgodzin/i.test(k)) {
    return 'overtime_rate'
  }
  if (CONTRACT_VALUE_KEYS.has(k) || /contract_value|package_price/i.test(k)) {
    return 'contract_value'
  }
  if (DEPOSIT_KEYS.has(k) || /deposit|zadat/i.test(k)) {
    return 'deposit'
  }
  if (REMAINING_KEYS.has(k) || /remaining|pozostał/i.test(k)) {
    return 'remaining'
  }
  if (/installment|rata|rat[ay]/i.test(k)) return 'installment'
  return 'other_money'
}

export function isOvertimeRegistryKey(key: string): boolean {
  return numericFamilyForRegistryKey(key) === 'overtime_rate'
}

/**
 * Overtime may only be sourced from wedding/package overtime or an explicit
 * manual override — never from another money family by numeric coincidence.
 */
export function assertOvertimeValueSource(input: {
  registryKey: string
  resolvedValue: string
  weddingOvertimeRate: number | null | undefined
  packageOvertimeRate?: number | null
  manualOverride?: string | null
  templateOriginal?: string | null
}): {
  ok: boolean
  source:
    | 'wedding'
    | 'package'
    | 'manual'
    | 'template_preserved'
    | 'unproven'
  reason: string
} {
  if (!isOvertimeRegistryKey(input.registryKey)) {
    return { ok: true, source: 'unproven', reason: 'not overtime key' }
  }

  const digits = (v: string | number | null | undefined) => {
    if (v == null) return null
    const n =
      typeof v === 'number'
        ? v
        : Number(String(v).replace(/\s/g, '').replace(/zł|pln/gi, '').replace(',', '.'))
    return Number.isFinite(n) ? Math.round(n) : null
  }

  const resolved = digits(input.resolvedValue)
  const wedding = digits(input.weddingOvertimeRate)
  const pkg = digits(input.packageOvertimeRate ?? null)
  const manual = digits(input.manualOverride ?? null)
  const template = digits(input.templateOriginal ?? null)

  if (manual != null && resolved === manual) {
    return { ok: true, source: 'manual', reason: 'manual generation override' }
  }
  if (wedding != null && resolved === wedding) {
    return { ok: true, source: 'wedding', reason: 'wedding.overtimeRate' }
  }
  if (pkg != null && resolved === pkg) {
    return { ok: true, source: 'package', reason: 'package overtime rate' }
  }
  if (template != null && resolved === template) {
    return {
      ok: true,
      source: 'template_preserved',
      reason: 'safely preserved template overtime value',
    }
  }

  // Unproven — do not apply cross-family numbers.
  return {
    ok: false,
    source: 'unproven',
    reason:
      'Overtime rate source cannot be proven; preserve template or ask during generation.',
  }
}
