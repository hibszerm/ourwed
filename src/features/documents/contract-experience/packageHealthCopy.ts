import type {
  PackageContractHealthCheck,
  PackageContractHealthCode,
} from '@/features/documents/template/packageContractHealthAudit'

const TECHNICAL_MESSAGE_RE =
  /No physical allowlisted|Required package-contract categories|allowlisted bindings|bindings_valid/i

/** Product-facing recommendation copy — calm, never technical. */
const RECOMMENDATION_BY_CODE: Partial<Record<PackageContractHealthCode, string>> =
  {
    bindings_valid:
      'Nie udało się odnaleźć danych, które można bezpiecznie uzupełniać.',
    required_data_ready:
      'Rozpoznaliśmy część dokumentu. Brakuje kilku informacji potrzebnych do generowania.',
    derived_financial_value:
      'Ta umowa zawiera kwotę zależną od ceny pakietu.',
    multi_location_slot:
      'Jedna lokalizacja reprezentuje przygotowania, ceremonię i przyjęcie.',
    payment_numbering_inconsistent:
      'Numeracja płatności może wymagać korekty.',
    remaining_amount_mismatch:
      'Kwota pozostała do zapłaty może wymagać aktualizacji wraz z ceną.',
    deposit_mismatch:
      'Kwota zadatku może wymagać aktualizacji wraz z ceną.',
  }

function productMessageForBindings(
  check: PackageContractHealthCheck,
): string {
  if (check.evidence === 'diagnostic:no_physical_allowlisted_bindings') {
    return 'Nie udało się odnaleźć danych, które można bezpiecznie uzupełniać.'
  }
  if (check.message && !TECHNICAL_MESSAGE_RE.test(check.message)) {
    if (/No physical|allowlisted/i.test(check.message)) {
      return (
        RECOMMENDATION_BY_CODE.bindings_valid ??
        'Nie udało się odnaleźć danych, które można bezpiecznie uzupełniać.'
      )
    }
    return check.message
  }
  return (
    RECOMMENDATION_BY_CODE.bindings_valid ??
    'Nie udało się odnaleźć danych, które można bezpiecznie uzupełniać.'
  )
}

export function packageHealthRecommendation(
  check: PackageContractHealthCheck,
): string {
  if (check.code === 'bindings_valid' && check.status !== 'ok') {
    return productMessageForBindings(check)
  }
  if (check.code === 'required_data_ready' && check.status !== 'ok') {
    return (
      RECOMMENDATION_BY_CODE.required_data_ready ??
      check.message ??
      'Rozpoznaliśmy część dokumentu. Brakuje kilku informacji potrzebnych do generowania.'
    )
  }
  const mapped = RECOMMENDATION_BY_CODE[check.code]
  if (mapped) return mapped
  const fallback = check.recommendation ?? check.message ?? check.title
  if (TECHNICAL_MESSAGE_RE.test(fallback)) {
    return (
      RECOMMENDATION_BY_CODE.bindings_valid ??
      'Brakuje kilku informacji potrzebnych do automatycznego generowania.'
    )
  }
  return fallback
}

export function packageHealthRecommendations(
  checks: PackageContractHealthCheck[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const check of checks) {
    if (check.status === 'ok') continue
    const text = packageHealthRecommendation(check)
    if (seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}
