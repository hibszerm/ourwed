/**
 * Product-facing readiness copy for package contracts.
 * Presentation only — does not change analysis, allowlist, or readiness rules.
 */

import type { PackageContractUserCategory } from '@/features/documents/template/packageContractAllowlist'
import type { PackageContractHealthReport } from '@/features/documents/template/packageContractHealthAudit'
import type { PackageContractReportKind } from '@/features/documents/template/packageContractFinalReport'

/** Attention state derived from the canonical report (read-only). */
export type PackageContractAttentionKind =
  | 'ready'
  | 'partial_recognition'
  | 'no_supported_fields'
  | 'upload_error'
  | 'internal_inconsistency'

/** Polish labels for readiness categories shown in product UI. */
export const PACKAGE_READINESS_PRODUCT_LABELS: Record<
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

/**
 * Optional registry-key → product label map for when the UI knows exact fields.
 * Prefer these over the generic couple category when keys are available.
 */
const FIELD_PRODUCT_LABELS: Record<string, string> = {
  couple_full_names: 'Dane strony zamawiającej',
  client_party_identity: 'Dane osoby zawierającej umowę',
  bride_full_name: 'Dane Panny Młodej',
  bride_address: 'Adresy zamieszkania',
  bride_phone: 'Dane kontaktowe',
  bride_email: 'Dane kontaktowe',
  groom_full_name: 'Dane Pana Młodego',
  groom_address: 'Adresy zamieszkania',
  groom_phone: 'Dane kontaktowe',
  groom_email: 'Dane kontaktowe',
  partner1_full_name: 'Osoba 1',
  partner2_full_name: 'Osoba 2',
  partner_one_full_name: 'Osoba 1',
  partner_two_full_name: 'Osoba 2',
  contract_execution_date: 'Data zawarcia umowy',
  wedding_date: 'Data ślubu',
  contract_value: 'Wartość umowy',
  contract_value_formatted: 'Wartość umowy',
  contract_value_words: 'Wartość umowy',
  package_price: 'Wartość umowy',
  client_phone: 'Dane kontaktowe',
  client_email: 'Dane kontaktowe',
  client_address: 'Adresy zamieszkania',
  partner1_address: 'Adresy zamieszkania',
  partner2_address: 'Adresy zamieszkania',
  partner1_phone: 'Dane kontaktowe',
  partner2_phone: 'Dane kontaktowe',
  partner1_email: 'Dane kontaktowe',
  partner2_email: 'Dane kontaktowe',
}

const BLOCKING_PRODUCT_LABELS: Record<string, string> = {
  shared_physical_span_conflict: 'Nakładające się pola danych klientów',
  legacy_readiness_boolean: 'Kompletność danych umowy',
}

export function productLabelForReadinessCategory(
  category: PackageContractUserCategory,
): string {
  return PACKAGE_READINESS_PRODUCT_LABELS[category]
}

export function productLabelForRegistryKey(key: string): string | null {
  return FIELD_PRODUCT_LABELS[key] ?? null
}

export function productLabelForBlockingIssue(code: string): string | null {
  return BLOCKING_PRODUCT_LABELS[code] ?? null
}

/**
 * Build the exact missing list for product UI.
 * Prefer precise field labels when exact missing keys are known;
 * otherwise fall back to readiness categories, then blocking issues.
 */
export function packageReadinessMissingProductLabels(input: {
  missingCategories: readonly PackageContractUserCategory[]
  /** Exact missing registry keys when known (optional). */
  missingRegistryKeys?: readonly string[]
  blockingIssues?: readonly { code: string; message?: string }[]
}): string[] {
  const fromKeys = (input.missingRegistryKeys ?? [])
    .map((key) => productLabelForRegistryKey(key))
    .filter((label): label is string => Boolean(label))

  if (fromKeys.length > 0) {
    return [...new Set(fromKeys)]
  }

  const fromCats = input.missingCategories.map(productLabelForReadinessCategory)
  if (fromCats.length > 0) return fromCats

  const fromBlockers = (input.blockingIssues ?? [])
    .map((b) => productLabelForBlockingIssue(b.code) ?? b.message)
    .filter((label): label is string => Boolean(label))
  return [...new Set(fromBlockers)]
}

export function resolvePackageContractAttentionKind(input: {
  healthReport: PackageContractHealthReport | null
  hasUploadError?: boolean
  /** Canonical report kind when already computed. */
  reportKind?: PackageContractReportKind | null
  missingCategories?: readonly string[]
  missingRegistryKeys?: readonly string[]
  blockingIssues?: readonly { code: string }[]
}): PackageContractAttentionKind {
  if (input.hasUploadError) return 'upload_error'
  if (input.reportKind === 'ready') return 'ready'
  if (input.reportKind === 'no_recognition') return 'no_supported_fields'
  if (input.reportKind === 'internal_inconsistency') {
    return 'internal_inconsistency'
  }
  if (input.reportKind === 'partial_recognition') return 'partial_recognition'

  const bindings = input.healthReport?.checks.find(
    (c) => c.code === 'bindings_valid',
  )
  const required = input.healthReport?.checks.find(
    (c) => c.code === 'required_data_ready',
  )
  const gapCount =
    (input.missingCategories?.length ?? 0) +
    (input.missingRegistryKeys?.length ?? 0) +
    (input.blockingIssues?.length ?? 0)

  if (bindings?.evidence === 'diagnostic:no_physical_allowlisted_bindings') {
    return 'no_supported_fields'
  }
  if (bindings?.status === 'critical') {
    const msg = `${bindings.message ?? ''} ${bindings.recommendation ?? ''}`
    if (/no physical|brak pól do uzupełnienia|bezpiecznie uzupełniać/i.test(msg)) {
      return 'no_supported_fields'
    }
  }

  const allChecksOk =
    (input.healthReport?.checks.length ?? 0) > 0 &&
    input.healthReport!.checks.every((c) => c.status === 'ok')
  if (allChecksOk && gapCount === 0) {
    return 'ready'
  }

  if (
    required?.status === 'critical' &&
    gapCount === 0
  ) {
    return 'internal_inconsistency'
  }

  if (
    required?.evidence === 'diagnostic:required_categories_incomplete' ||
    required?.status === 'critical' ||
    gapCount > 0 ||
    bindings?.evidence === 'diagnostic:bindings_present_readiness_incomplete'
  ) {
    return 'partial_recognition'
  }

  // Never default to unexplained partial — prefer ready when nothing is wrong.
  return 'ready'
}

export type PackageContractAttentionCopy = {
  title: string
  recognitionLine: string
  description: string
  missingSectionTitle: string
  footerGuidance: string
  recommendedAction: string
}

export function packageContractAttentionCopy(
  kind: PackageContractAttentionKind,
): PackageContractAttentionCopy {
  if (kind === 'ready') {
    return {
      title: 'Umowa gotowa',
      recognitionLine: 'Umowa jest gotowa do automatycznego generowania.',
      description:
        'Dokument został przeanalizowany i jest gotowy do użycia w pakietach.',
      missingSectionTitle: '',
      footerGuidance: '',
      recommendedAction: '',
    }
  }

  if (kind === 'no_supported_fields') {
    return {
      title: 'Umowa wymaga uzupełnienia',
      recognitionLine:
        'Nie udało się odnaleźć danych, które można bezpiecznie uzupełniać.',
      description:
        'Dokument nie zawiera informacji, które system może bezpiecznie podmienić przy generowaniu.',
      missingSectionTitle: 'Brakuje rozpoznania',
      footerGuidance:
        'Sprawdź, czy w treści dokumentu występują dane pary, daty oraz wartość umowy, a następnie wgraj poprawioną wersję.',
      recommendedAction: 'Sprawdź dokument i wgraj poprawioną wersję',
    }
  }

  if (kind === 'upload_error') {
    return {
      title: 'Umowa wymaga uzupełnienia',
      recognitionLine: 'Przesyłanie umowy wymaga ponowienia.',
      description:
        'Dokument nie został w pełni zapisany. Spróbuj wgrać umowę ponownie.',
      missingSectionTitle: 'Brakuje rozpoznania',
      footerGuidance:
        'Sprawdź plik i wgraj poprawioną wersję umowy.',
      recommendedAction: 'Sprawdź dokument i wgraj poprawioną wersję',
    }
  }

  if (kind === 'internal_inconsistency') {
    return {
      title: 'Umowa wymaga uwagi',
      recognitionLine:
        'Nie udało się jednoznacznie ocenić gotowości dokumentu.',
      description:
        'Nie udało się jednoznacznie ocenić gotowości dokumentu. Spróbuj ponowić analizę.',
      missingSectionTitle: 'Brakuje rozpoznania',
      footerGuidance:
        'Wgraj umowę ponownie, aby ponowić analizę gotowości.',
      recommendedAction: 'Ponów analizę dokumentu',
    }
  }

  return {
    title: 'Umowa wymaga uzupełnienia',
    recognitionLine: 'Rozpoznaliśmy część dokumentu.',
    description:
      'Rozpoznaliśmy część danych, ale dokument nie zawiera wszystkich informacji potrzebnych do automatycznego generowania.',
    missingSectionTitle: 'Brakuje rozpoznania',
    footerGuidance:
      'Sprawdź, czy poniższe dane występują w treści dokumentu, a następnie wgraj poprawioną wersję umowy.',
    recommendedAction: 'Sprawdź dokument i wgraj poprawioną wersję',
  }
}

const TECHNICAL_UI_RE =
  /allowlist|bindings_valid|diagnostic:|slot_map|readiness|semantic|No physical allowlisted|Required package-contract/i

/** True when a string must never appear in product UI. */
export function isTechnicalDiagnosticText(text: string): boolean {
  return TECHNICAL_UI_RE.test(text)
}
