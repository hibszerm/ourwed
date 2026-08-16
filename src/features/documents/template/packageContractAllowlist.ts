/**
 * Authoritative allowlist for package-owned contract templates.
 *
 * Only these registry keys may become active dynamic physical bindings.
 * Coverage hours, overtime, film duration, and legal package content stay
 * immutable template text even if the analyzer detects them.
 */

import {
  evaluateClientPartyReadiness,
  type ClientPartyReadinessResult,
} from './clientPartyReadiness'
import { devInfoArgs } from '@/lib/debug/devConsole'

/** Keys the product may replace for a package contract. */
export const PACKAGE_CONTRACT_ALLOWED_DYNAMIC_KEYS = [
  // Dates
  'contract_execution_date',
  'wedding_date',
  // Couple / client
  'couple_full_names',
  'partner1_full_name',
  'partner2_full_name',
  'partner_one_full_name',
  'partner_two_full_name',
  'bride_full_name',
  'groom_full_name',
  'client_address',
  'bride_address',
  'groom_address',
  'partner1_address',
  'partner2_address',
  'client_phone',
  'bride_phone',
  'groom_phone',
  'partner1_phone',
  'partner2_phone',
  'client_email',
  'bride_email',
  'groom_email',
  'partner1_email',
  'partner2_email',
  'couple_party_participle',
  // Locations
  'preparation_location',
  'ceremony_location',
  'reception_location',
  // Financial values
  'contract_value',
  'contract_value_formatted',
  'contract_value_words',
  'package_price',
  'deposit_amount',
  'deposit_amount_words',
  'agreed_deposit',
  'agreed_deposit_formatted',
  'agreed_deposit_words',
  'remaining_amount',
  'remaining_amount_words',
  'remaining_after_deposit',
  'remaining_after_deposit_formatted',
  'remaining_after_deposit_words',
  'remaining_to_pay',
  'remaining_to_pay_formatted',
  'remaining_to_pay_words',
  // Payment deadlines
  'deposit_due_date',
  'final_payment_due_date',
  'final_payment_due_date_long',
  'payment_due_date',
] as const

export type PackageContractAllowedDynamicKey =
  (typeof PACKAGE_CONTRACT_ALLOWED_DYNAMIC_KEYS)[number]

const ALLOWED = new Set<string>(PACKAGE_CONTRACT_ALLOWED_DYNAMIC_KEYS)

/**
 * Detected internally but must never become mutable package-contract bindings.
 */
export const PACKAGE_CONTRACT_IMMUTABLE_PACKAGE_KEYS = [
  'coverage_hours',
  'working_hours',
  'package_duration',
  'coverage_start_time',
  'coverage_end_time',
  'coverage_time_range',
  'overtime_rate',
  'overtime_rate_formatted',
  'overtime_rate_words',
  'overtime_price',
  'package_overtime_rate',
  'operator_count',
  'videographer_count',
  'film_duration',
  'teaser_duration',
  'teaser',
  'delivery_duration',
  'delivery_term_text',
  'delivery_months',
  'delivery_days',
  'delivery_time',
  'package_name',
  'package_name_without_prefix',
  'included_services_text',
  'package_contents',
] as const

const IMMUTABLE = new Set<string>(PACKAGE_CONTRACT_IMMUTABLE_PACKAGE_KEYS)

export function isPackageContractAllowedDynamicKey(key: string | null | undefined): boolean {
  if (!key) return false
  return ALLOWED.has(key)
}

export function isPackageContractImmutableKey(key: string | null | undefined): boolean {
  if (!key) return false
  return IMMUTABLE.has(key)
}

/** User-facing readiness categories (no registry keys). */
export type PackageContractUserCategory =
  | 'couple'
  | 'contract_date'
  | 'wedding_date'
  | 'contract_value'
  | 'deposit'
  | 'remaining'
  | 'payment_deadline'
  | 'locations'
  | 'contact'

export const PACKAGE_CONTRACT_CATEGORY_LABELS: Record<
  PackageContractUserCategory,
  string
> = {
  couple: 'Dane strony zamawiającej',
  contract_date: 'Data zawarcia umowy',
  wedding_date: 'Data ślubu',
  contract_value: 'Wartość umowy',
  deposit: 'Zaliczka',
  remaining: 'Pozostała kwota',
  payment_deadline: 'Termin płatności',
  locations: 'Miejsca',
  contact: 'Dane kontaktowe',
}

const CATEGORY_KEYS: Record<PackageContractUserCategory, readonly string[]> = {
  couple: [
    'couple_full_names',
    'partner1_full_name',
    'partner2_full_name',
    'partner_one_full_name',
    'partner_two_full_name',
    'bride_full_name',
    'groom_full_name',
  ],
  contract_date: ['contract_execution_date'],
  wedding_date: ['wedding_date'],
  contract_value: [
    'contract_value',
    'contract_value_formatted',
    'contract_value_words',
    'package_price',
  ],
  deposit: [
    'deposit_amount',
    'deposit_amount_words',
    'agreed_deposit',
    'agreed_deposit_formatted',
    'agreed_deposit_words',
  ],
  remaining: [
    'remaining_amount',
    'remaining_amount_words',
    'remaining_after_deposit',
    'remaining_after_deposit_formatted',
    'remaining_after_deposit_words',
    'remaining_to_pay',
    'remaining_to_pay_formatted',
    'remaining_to_pay_words',
  ],
  payment_deadline: [
    'deposit_due_date',
    'final_payment_due_date',
    'final_payment_due_date_long',
    'payment_due_date',
  ],
  locations: [
    'preparation_location',
    'ceremony_location',
    'reception_location',
  ],
  contact: [
    'client_phone',
    'bride_phone',
    'groom_phone',
    'partner1_phone',
    'partner2_phone',
    'client_email',
    'bride_email',
    'groom_email',
    'partner1_email',
    'partner2_email',
    'client_address',
    'bride_address',
    'groom_address',
    'partner1_address',
    'partner2_address',
  ],
}

/** Required minimum categories — at least one physical slot from each group. */
export const PACKAGE_CONTRACT_REQUIRED_CATEGORIES: PackageContractUserCategory[] =
  ['couple', 'contract_date', 'wedding_date', 'contract_value']

export function categoryForPackageContractKey(
  key: string,
): PackageContractUserCategory | null {
  for (const [category, keys] of Object.entries(CATEGORY_KEYS) as Array<
    [PackageContractUserCategory, readonly string[]]
  >) {
    if (keys.includes(key)) return category
  }
  return null
}

export function filterSlotsToPackageContractAllowlist<
  T extends { registryKey?: string | null },
>(slots: T[]): { kept: T[]; filteredOut: T[] } {
  const kept: T[] = []
  const filteredOut: T[] = []
  for (const slot of slots) {
    const key = slot.registryKey ?? ''
    if (isPackageContractAllowedDynamicKey(key)) {
      kept.push(slot)
    } else {
      filteredOut.push(slot)
    }
  }
  return { kept, filteredOut }
}

/** Filter a full slot map; used by upload, generation, and tests. */
export function applyPackageContractAllowlistToSlotMap<
  TMap extends { slots: Array<{ registryKey?: string | null }> },
>(slotMap: TMap): { slotMap: TMap; filteredOutKeys: string[] } {
  const { kept, filteredOut } = filterSlotsToPackageContractAllowlist(
    slotMap.slots,
  )
  const filteredOutKeys = [
    ...new Set(
      filteredOut
        .map((s) => s.registryKey)
        .filter((k): k is string => Boolean(k)),
    ),
  ]
  devInfoArgs('[package-contract-allowlist]', {
    keptCount: kept.length,
    filteredOutCount: filteredOut.length,
    filteredOutKeys,
  })
  return {
    slotMap: { ...slotMap, slots: kept },
    filteredOutKeys,
  }
}

export type PackageContractReadiness = {
  ready: boolean
  presentCategories: PackageContractUserCategory[]
  missingRequiredCategories: PackageContractUserCategory[]
  presentOptionalCategories: PackageContractUserCategory[]
  userMessage: string | null
  /** Role-neutral client-party evaluation (authoritative for `couple`). */
  clientParty: ClientPartyReadinessResult
  /** Actionable capability / key diagnostics for incomplete categories. */
  missingRegistryKeys: string[]
}

/**
 * Template is usable when every required category that the product needs has
 * at least one allowed physical slot present. Conditional categories (deposit,
 * locations, …) only matter when slots exist — they never block when absent.
 *
 * The `couple` category means: at least one client-party identity binding —
 * not a traditional bride+groom pair.
 */
export function evaluatePackageContractReadiness(input: {
  allowedRegistryKeys: string[]
}): PackageContractReadiness {
  const clientParty = evaluateClientPartyReadiness({
    boundRegistryKeys: input.allowedRegistryKeys,
  })

  const present = new Set<PackageContractUserCategory>()
  for (const key of input.allowedRegistryKeys) {
    const cat = categoryForPackageContractKey(key)
    if (!cat) continue
    // Client-party presence is decided by the role-neutral evaluator only.
    if (cat === 'couple') continue
    present.add(cat)
  }
  if (clientParty.ready) present.add('couple')

  const presentCategories = [...present]
  const missingRequiredCategories = PACKAGE_CONTRACT_REQUIRED_CATEGORIES.filter(
    (c) => !present.has(c),
  )
  const presentOptionalCategories = presentCategories.filter(
    (c) => !PACKAGE_CONTRACT_REQUIRED_CATEGORIES.includes(c),
  )
  const ready = missingRequiredCategories.length === 0

  const missingRegistryKeys: string[] = []
  if (missingRequiredCategories.includes('couple')) {
    missingRegistryKeys.push(...clientParty.missingRegistryKeys)
  }
  for (const cat of missingRequiredCategories) {
    if (cat === 'couple') continue
    const keys = CATEGORY_KEYS[cat]
    if (keys[0]) missingRegistryKeys.push(keys[0])
  }

  return {
    ready,
    presentCategories,
    missingRequiredCategories,
    presentOptionalCategories,
    userMessage: ready
      ? null
      : 'Rozpoznaliśmy część danych, ale dokument nie zawiera wszystkich informacji potrzebnych do automatycznego generowania.',
    clientParty,
    missingRegistryKeys: [...new Set(missingRegistryKeys)],
  }
}
