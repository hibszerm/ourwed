import type {
  PackageContractHealthCheck,
  PackageContractHealthCode,
} from '@/features/documents/template/packageContractHealthAudit'

/** Product-facing recommendation copy — calm, never technical. */
const RECOMMENDATION_BY_CODE: Partial<Record<PackageContractHealthCode, string>> =
  {
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

export function packageHealthRecommendation(
  check: PackageContractHealthCheck,
): string {
  return (
    RECOMMENDATION_BY_CODE[check.code] ??
    check.recommendation ??
    check.message ??
    check.title
  )
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
