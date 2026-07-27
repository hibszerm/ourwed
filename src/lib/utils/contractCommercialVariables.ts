/**
 * Contract commercial variables — formatted money, words, package items,
 * coverage / overtime / delivery / final payment from wedding snapshot only.
 */

import { amountToWordsPlOrNull } from '@/lib/utils/amountToWordsPl'
import {
  formatDeliveryTerm,
  getWeddingCommercialSummary,
} from '@/lib/utils/commercial'
import { formatFinalPaymentTerms } from '@/lib/utils/finalPaymentTerms'
import { formatContractPln } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { Wedding, WeddingPackageItemSnapshot } from '@/types/wedding'
import { formatPolishHours } from '@/lib/utils/polishDuration'

/** True when a numeric commercial field is intentionally present (0 allowed). */
export function isPresentMoney(
  value: number | null | undefined,
): value is number {
  return value != null && Number.isFinite(value)
}

/**
 * Strip one leading "Pakiet" (+ whitespace) for templates that already say
 * "Pakiecie …". Does not mutate the stored wedding.packageName.
 */
export function packageNameWithoutPrefix(packageName: string): string {
  const trimmed = packageName.trim()
  if (!trimmed) return ''
  const stripped = trimmed.replace(/^pakiet\s+/iu, '')
  return stripped.trim() || trimmed
}

/** Contract short date: 2026-07-10 → "10.07.2026". */
export function formatContractDateShort(
  isoDate: string | null | undefined,
): string {
  const raw = isoDate?.trim()
  if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return ''
  const [y, m, d] = raw.slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${d}.${m}.${y}`
}

/** Contract long date: 2026-07-10 → "10 lipca 2026 r." */
export function formatContractDateLong(
  isoDate: string | null | undefined,
): string {
  const raw = isoDate?.trim()
  if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return ''
  try {
    return `${formatDate(raw.slice(0, 10))} r.`
  } catch {
    return ''
  }
}

export interface ContractIncludedService {
  id: string
  label: string
  description?: string
  quantity?: number
  order: number
}

export function buildIncludedServices(
  items: WeddingPackageItemSnapshot[],
): ContractIncludedService[] {
  const out: ContractIncludedService[] = []
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
  for (let index = 0; index < sorted.length; index++) {
    const item = sorted[index]!
    if (item.enabled === false) continue
    const label = item.title.trim()
    if (!label) continue
    const description = item.description?.trim() || undefined
    out.push({
      id: item.sourceItemId?.trim() || `snapshot-${index}`,
      label,
      description,
      quantity: item.quantity ?? undefined,
      order: item.sortOrder ?? index,
    })
  }
  return out
}

/**
 * Deterministic plain-text fallback (bullet lines).
 * Uses snapshot titles/descriptions only — never live catalog / AI rewrite.
 */
export function buildIncludedServicesText(
  items: WeddingPackageItemSnapshot[],
): string {
  const services = buildIncludedServices(items)
  if (services.length === 0) return ''
  return services
    .map((s, index) => {
      const body = s.description ? `${s.label} — ${s.description}` : s.label
      const trimmed = body.replace(/[.;]\s*$/u, '').trim()
      const end = index === services.length - 1 ? '.' : ';'
      return `- ${trimmed}${end}`
    })
    .join('\n')
}

export interface ContractCommercialResolved {
  /** Flat string map for VariableResolver / weddingValues. */
  values: Record<string, string>
  includedServices: ContractIncludedService[]
  /** Structured payload for packageSnapshot. */
  snapshotExtras: Record<string, unknown>
  /** Canonical keys that were expected but missing from the snapshot. */
  missingCanonicalKeys: string[]
}

function put(
  out: Record<string, string>,
  key: string,
  value: string | null | undefined,
) {
  const v = value?.trim()
  if (v) out[key] = v
}

function putMoneyBundle(
  out: Record<string, string>,
  keys: {
    raw: string
    formatted: string
    words: string
  },
  amount: number,
) {
  put(out, keys.raw, String(Math.round(amount)))
  put(out, keys.formatted, formatContractPln(amount))
  put(out, keys.words, amountToWordsPlOrNull(amount) ?? undefined)
}

const CANONICAL_REFERENCE_KEYS = [
  'package_name',
  'package_name_without_prefix',
  'contract_value_formatted',
  'contract_value_words',
  'agreed_deposit_formatted',
  'remaining_after_deposit_formatted',
  'remaining_to_pay_formatted',
  'coverage_hours',
  'coverage_start_time',
  'coverage_end_time',
  'overtime_rate',
  'overtime_rate_formatted',
  'overtime_rate_words',
  'delivery_term_text',
  'final_payment_due_date',
  'package_items_count',
  'included_services_text',
] as const

/**
 * Build all contract-ready commercial string variables from a wedding snapshot.
 */
export function buildContractCommercialResolved(
  wedding: Wedding,
): ContractCommercialResolved {
  const commercial = getWeddingCommercialSummary(wedding)
  const values: Record<string, string> = {}

  const packageName = wedding.packageName?.trim() ?? ''
  put(values, 'package_name', packageName)
  if (packageName) {
    put(
      values,
      'package_name_without_prefix',
      packageNameWithoutPrefix(packageName),
    )
  }

  // contractValue — always present on Wedding as price (0 is a real zero)
  if (isPresentMoney(wedding.price)) {
    putMoneyBundle(
      values,
      {
        raw: 'contract_value',
        formatted: 'contract_value_formatted',
        words: 'contract_value_words',
      },
      commercial.contractValue,
    )
    put(values, 'package_price', values.contract_value_formatted)
    put(values, 'contract_price', values.contract_value_formatted)
    put(values, 'price', values.contract_value_formatted)
    put(values, 'contractValue', String(Math.round(commercial.contractValue)))
    put(values, 'contractValueFormatted', values.contract_value_formatted)
    put(values, 'contractValueWords', values.contract_value_words)
  }

  if (isPresentMoney(wedding.depositAmount)) {
    putMoneyBundle(
      values,
      {
        raw: 'agreed_deposit',
        formatted: 'agreed_deposit_formatted',
        words: 'agreed_deposit_words',
      },
      commercial.agreedDeposit,
    )
    put(values, 'deposit_amount', values.agreed_deposit_formatted)
    put(values, 'deposit', values.agreed_deposit_formatted)
    put(values, 'agreedDeposit', String(Math.round(commercial.agreedDeposit)))
    put(values, 'agreedDepositFormatted', values.agreed_deposit_formatted)
    put(values, 'agreedDepositWords', values.agreed_deposit_words)
  }

  putMoneyBundle(
    values,
    {
      raw: 'total_paid',
      formatted: 'total_paid_formatted',
      words: 'total_paid_words',
    },
    commercial.totalPaid,
  )
  put(values, 'totalPaid', String(Math.round(commercial.totalPaid)))
  put(values, 'totalPaidFormatted', values.total_paid_formatted)
  put(values, 'totalPaidWords', values.total_paid_words)

  if (isPresentMoney(wedding.price)) {
    putMoneyBundle(
      values,
      {
        raw: 'remaining_to_pay',
        formatted: 'remaining_to_pay_formatted',
        words: 'remaining_to_pay_words',
      },
      commercial.remainingToPay,
    )
    put(values, 'remainingToPay', String(Math.round(commercial.remainingToPay)))
    put(values, 'remainingToPayFormatted', values.remaining_to_pay_formatted)
    put(values, 'remainingToPayWords', values.remaining_to_pay_words)
  }

  if (isPresentMoney(wedding.price) && isPresentMoney(wedding.depositAmount)) {
    putMoneyBundle(
      values,
      {
        raw: 'remaining_after_deposit',
        formatted: 'remaining_after_deposit_formatted',
        words: 'remaining_after_deposit_words',
      },
      commercial.remainingAfterDeposit,
    )
    put(values, 'remaining_payment', values.remaining_after_deposit_formatted)
    put(
      values,
      'remainingAfterDeposit',
      String(Math.round(commercial.remainingAfterDeposit)),
    )
    put(
      values,
      'remainingAfterDepositFormatted',
      values.remaining_after_deposit_formatted,
    )
    put(
      values,
      'remainingAfterDepositWords',
      values.remaining_after_deposit_words,
    )
  }

  // Coverage / overtime / delivery — missing → omit (never invent zeros / catalog)
  if (
    wedding.coverageHours != null &&
    Number.isFinite(wedding.coverageHours)
  ) {
    const hours = String(Math.round(wedding.coverageHours))
    put(values, 'coverage_hours', hours)
    put(values, 'working_hours', hours)
    // Full phrase for spans that include „godzin*” — never append clock times.
    put(values, 'coverage_hours_text', formatPolishHours(wedding.coverageHours))
  }

  // End time only — never concatenate with duration.
  if (wedding.coverageEndTime?.trim()) {
    const raw = wedding.coverageEndTime.trim()
    const clock = raw.match(/\d{1,2}[.:]\d{2}/)?.[0] ?? raw
    put(values, 'coverage_end_time', clock)
  }

  if (
    wedding.overtimeRate != null &&
    Number.isFinite(wedding.overtimeRate)
  ) {
    putMoneyBundle(
      values,
      {
        raw: 'overtime_rate',
        formatted: 'overtime_rate_formatted',
        words: 'overtime_rate_words',
      },
      wedding.overtimeRate,
    )
    // Legacy money slot often bound to overtime_rate in older templates
    put(values, 'overtime_price', values.overtime_rate_formatted)
  }

  if (
    wedding.deliveryMonths != null &&
    Number.isFinite(wedding.deliveryMonths)
  ) {
    put(values, 'delivery_months', String(Math.round(wedding.deliveryMonths)))
  }
  if (wedding.deliveryDays != null && Number.isFinite(wedding.deliveryDays)) {
    put(values, 'delivery_days', String(Math.round(wedding.deliveryDays)))
  }

  const deliveryTerm = formatDeliveryTerm(
    wedding.deliveryMonths,
    wedding.deliveryDays,
  )
  put(values, 'delivery_term_text', deliveryTerm)
  // Legacy delivery_time → same prose when available
  put(values, 'delivery_time', deliveryTerm)

  const dueShort = formatContractDateShort(wedding.finalPaymentDueDate)
  const dueLong = formatContractDateLong(wedding.finalPaymentDueDate)
  put(values, 'final_payment_due_date', dueShort)
  put(values, 'final_payment_due_date_long', dueLong)

  const finalTermsText = formatFinalPaymentTerms(wedding.finalPaymentTerms)
  put(values, 'final_payment_terms_text', finalTermsText)
  // Prefer concrete date; fall back to contractual rule for after_delivery etc.
  if (!dueShort && finalTermsText) {
    put(values, 'final_payment_due_date', finalTermsText)
  }

  const includedServices = buildIncludedServices(wedding.packageItems ?? [])
  const includedText = buildIncludedServicesText(wedding.packageItems ?? [])
  put(values, 'included_services_text', includedText)
  put(values, 'included_services', includedText)
  put(values, 'package_items_count', String(includedServices.length))

  const missingCanonicalKeys = CANONICAL_REFERENCE_KEYS.filter(
    (key) => !values[key],
  )

  return {
    values,
    includedServices,
    missingCanonicalKeys: [...missingCanonicalKeys],
    snapshotExtras: {
      contractValue: commercial.contractValue,
      agreedDeposit: commercial.agreedDeposit,
      totalPaid: commercial.totalPaid,
      remainingToPay: commercial.remainingToPay,
      remainingAfterDeposit: commercial.remainingAfterDeposit,
      contractValueFormatted: values.contract_value_formatted,
      agreedDepositFormatted: values.agreed_deposit_formatted,
      totalPaidFormatted: values.total_paid_formatted,
      remainingToPayFormatted: values.remaining_to_pay_formatted,
      remainingAfterDepositFormatted: values.remaining_after_deposit_formatted,
      contractValueWords: values.contract_value_words,
      agreedDepositWords: values.agreed_deposit_words,
      remainingToPayWords: values.remaining_to_pay_words,
      remainingAfterDepositWords: values.remaining_after_deposit_words,
      packageNameWithoutPrefix: values.package_name_without_prefix,
      coverageHours: wedding.coverageHours ?? null,
      coverageEndTime: wedding.coverageEndTime ?? null,
      overtimeRate: wedding.overtimeRate ?? null,
      overtimeRateFormatted: values.overtime_rate_formatted,
      overtimeRateWords: values.overtime_rate_words,
      deliveryMonths: wedding.deliveryMonths ?? null,
      deliveryDays: wedding.deliveryDays ?? null,
      deliveryTermText: deliveryTerm || null,
      deliveryTime: deliveryTerm || null,
      finalPaymentTerms: wedding.finalPaymentTerms ?? null,
      finalPaymentTermsText: finalTermsText || null,
      finalPaymentDueDate: dueShort || null,
      finalPaymentDueDateLong: dueLong || null,
      finalPaymentDueDateIso: wedding.finalPaymentDueDate ?? null,
      packageItemsCount: includedServices.length,
      includedServices,
      includedServicesText: includedText,
      included_services_text: includedText,
      workingHours: wedding.coverageHours ?? null,
      price: values.contract_value_formatted,
      totalPrice: values.contract_value_formatted,
      deposit: values.agreed_deposit_formatted,
      depositAmount: values.agreed_deposit_formatted,
      remaining: values.remaining_after_deposit_formatted,
      remainingPayment: values.remaining_after_deposit_formatted,
      overtimePrice: values.overtime_rate_formatted,
    },
  }
}

/**
 * Dev-only diagnostics for reference wedding commercial resolve.
 * Never logs full client personal data.
 */
export function logContractReferenceValues(
  wedding: Wedding,
  resolved: ContractCommercialResolved,
): void {
  if (!import.meta.env?.DEV) return
  const commercial = getWeddingCommercialSummary(wedding)
  const deliveryTerm = formatDeliveryTerm(
    wedding.deliveryMonths,
    wedding.deliveryDays,
  )
  console.info('[contract-reference-values]', {
    weddingId: wedding.id,
    packageName: commercial.packageName || null,
    contractValue: isPresentMoney(wedding.price)
      ? commercial.contractValue
      : null,
    agreedDeposit: isPresentMoney(wedding.depositAmount)
      ? commercial.agreedDeposit
      : null,
    totalPaid: commercial.totalPaid,
    remainingToPay: isPresentMoney(wedding.price)
      ? commercial.remainingToPay
      : null,
    remainingAfterDeposit:
      isPresentMoney(wedding.price) && isPresentMoney(wedding.depositAmount)
        ? commercial.remainingAfterDeposit
        : null,
    coverageHours: wedding.coverageHours ?? null,
    coverageEndTime: wedding.coverageEndTime ?? null,
    overtimeRate: wedding.overtimeRate ?? null,
    deliveryTerm: deliveryTerm || null,
    finalPaymentDueDate: wedding.finalPaymentDueDate ?? null,
    packageItemsCount: resolved.includedServices.length,
    missingCanonicalValues: resolved.missingCanonicalKeys,
  })
}
