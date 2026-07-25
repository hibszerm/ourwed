/**
 * Deterministic wedding/company completeness for contract readiness.
 * No AI — pure field checks against required / optional rules.
 */

import type { CompanyDetails } from '@/types/company'
import type { Wedding } from '@/types/wedding'
import {
  formatDeliveryTerm,
  getWeddingCommercialSummary,
} from '@/lib/utils/commercial'

export type CompletenessStatus = 'complete' | 'missing' | 'optional'

export type CompletenessOverall = 'ready' | 'needs_attention'

export interface CompletenessItem {
  id: string
  group: 'client' | 'company' | 'package' | 'payments'
  label: string
  status: CompletenessStatus
}

export interface WeddingContractReadiness {
  overall: CompletenessOverall
  overallLabel: 'Gotowe do umowy' | 'Wymaga uzupełnienia'
  items: CompletenessItem[]
  requiredMissing: number
  requiredTotal: number
}

function present(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

function item(
  id: string,
  group: CompletenessItem['group'],
  label: string,
  status: CompletenessStatus,
): CompletenessItem {
  return { id, group, label, status }
}

function required(
  id: string,
  group: CompletenessItem['group'],
  label: string,
  ok: boolean,
): CompletenessItem {
  return item(id, group, label, ok ? 'complete' : 'missing')
}

function optional(
  id: string,
  group: CompletenessItem['group'],
  label: string,
  ok: boolean,
): CompletenessItem {
  return item(id, group, label, ok ? 'complete' : 'optional')
}

/**
 * Evaluate readiness for contract generation from wedding + company profile.
 */
export function evaluateWeddingContractReadiness(
  wedding: Wedding,
  company: CompanyDetails | null | undefined,
): WeddingContractReadiness {
  const commercial = getWeddingCommercialSummary(wedding)
  const c = wedding.couple
  const address =
    c.partner1Address?.trim() ||
    [c.partner1PostalCode, c.partner1City].filter(Boolean).join(' ').trim()
  const phone = c.partner1Phone?.trim() || c.phone?.trim() || ''
  const partnerName =
    c.partner1.trim() ||
    [c.partner1FirstName, c.partner1LastName].filter(Boolean).join(' ').trim()
  const deliveryOk = Boolean(
    formatDeliveryTerm(wedding.deliveryMonths, wedding.deliveryDays),
  )
  const enabledItems = (wedding.packageItems ?? []).filter(
    (row) => row.enabled !== false && row.title.trim(),
  )
  const depositAgreed =
    wedding.depositAmount != null && Number.isFinite(wedding.depositAmount)

  const items: CompletenessItem[] = [
    // Client
    required('client_partner', 'client', 'Imię i nazwisko klienta', present(partnerName)),
    required('client_address', 'client', 'Adres klienta', present(address)),
    required('client_phone', 'client', 'Telefon klienta', present(phone)),
    required('client_date', 'client', 'Data ślubu', present(wedding.date)),
    required(
      'client_prep_bride',
      'client',
      'Przygotowania Panny Młodej',
      present(
        wedding.bridePreparationLocation || wedding.preparationLocation,
      ),
    ),
    required(
      'client_prep_groom',
      'client',
      'Przygotowania Pana Młodego',
      present(wedding.groomPreparationLocation),
    ),
    required(
      'client_ceremony',
      'client',
      'Miejsce ceremonii',
      present(wedding.ceremonyLocation),
    ),
    required(
      'client_reception',
      'client',
      'Miejsce przyjęcia',
      present(wedding.receptionLocation),
    ),

    // Company
    required(
      'company_name',
      'company',
      'Nazwa firmy',
      present(company?.companyName),
    ),
    required('company_address', 'company', 'Adres firmy', present(company?.address)),
    required('company_nip', 'company', 'NIP', present(company?.nip)),
    required('company_regon', 'company', 'REGON', present(company?.regon)),
    required('company_phone', 'company', 'Telefon firmy', present(company?.phone)),
    required(
      'company_bank',
      'company',
      'Numer konta',
      present(company?.bankAccount) || present(company?.iban),
    ),

    // Package
    required(
      'package_name',
      'package',
      'Nazwa pakietu',
      present(commercial.packageName),
    ),
    required(
      'package_value',
      'package',
      'Wartość umowy',
      commercial.contractValue > 0,
    ),
    required('package_deposit', 'package', 'Zadatek uzgodniony', depositAgreed),
    required(
      'package_items',
      'package',
      'Zawartość pakietu (snapshot)',
      enabledItems.length > 0,
    ),
    required(
      'package_coverage_end',
      'package',
      'Koniec reportażu',
      present(wedding.coverageEndTime),
    ),
    required(
      'package_overtime',
      'package',
      'Stawka nadgodzin',
      wedding.overtimeRate != null &&
        Number.isFinite(wedding.overtimeRate) &&
        wedding.overtimeRate >= 0,
    ),
    required('package_delivery', 'package', 'Termin oddania', deliveryOk),
    optional(
      'package_coverage_hours',
      'package',
      'Liczba godzin reportażu',
      wedding.coverageHours != null && wedding.coverageHours > 0,
    ),

    // Payments
    required('pay_agreed_deposit', 'payments', 'Zadatek uzgodniony', depositAgreed),
    required(
      'pay_total_paid',
      'payments',
      'Suma wpłat',
      Number.isFinite(commercial.totalPaid),
    ),
    required(
      'pay_remaining_after',
      'payments',
      'Pozostało po zadatku',
      depositAgreed && commercial.contractValue > 0,
    ),
    required(
      'pay_remaining_to_pay',
      'payments',
      'Pozostało do zapłaty',
      commercial.contractValue > 0,
    ),
    required(
      'pay_final_due',
      'payments',
      'Termin płatności końcowej',
      present(wedding.finalPaymentDueDate),
    ),
  ]

  const requiredItems = items.filter((row) => row.status !== 'optional')
  const requiredMissing = requiredItems.filter((row) => row.status === 'missing')
    .length
  const overall: CompletenessOverall =
    requiredMissing === 0 ? 'ready' : 'needs_attention'

  return {
    overall,
    overallLabel:
      overall === 'ready' ? 'Gotowe do umowy' : 'Wymaga uzupełnienia',
    items,
    requiredMissing,
    requiredTotal: requiredItems.length,
  }
}
