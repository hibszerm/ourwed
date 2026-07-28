/**
 * Name-only projection of wedding extra services for contract generation.
 * Source of truth: wedding_extra_services + joined catalog name.
 */

import { normalizeForMatch } from './quality/normalize'
import type { WeddingExtraService } from '@/types/package'

export type ContractAdditionalService = {
  id?: string
  name: string
}

/** Trim, dedupe (Polish-aware), preserve wedding ordering. No price or quantity. */
export function projectContractAdditionalServices(
  extras: WeddingExtraService[],
): ContractAdditionalService[] {
  const seen = new Set<string>()
  const out: ContractAdditionalService[] = []
  for (const extra of extras) {
    const name = (extra.name ?? 'Usługa').trim()
    if (!name) continue
    const key = normalizeForMatch(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({
      id: extra.extraServiceId,
      name,
    })
  }
  return out
}

export function formatAdditionalServicesDisplayText(
  services: ContractAdditionalService[],
): string {
  return services.map((s) => s.name).join('\n')
}

export function renderAdditionalServicesBulletList(
  names: string[],
): string {
  return names.map((n) => `– ${n}`).join('\n')
}

/**
 * Render additional services as separate paragraphs (never inline on anchor).
 */
export function renderSeparateAdditionalServicesParagraphs(
  names: string[],
): string[] {
  if (names.length === 0) return []
  const intro =
    names.length === 1
      ? 'Ponadto Zamawiający wybrał następującą usługę dodatkową:'
      : 'Ponadto Zamawiający wybrał następujące usługi dodatkowe:'
  const items =
    names.length === 1
      ? [`– ${names[0]}.`]
      : names.map((n) => `– ${n};`)
  return [intro, ...items]
}

/** Unnumbered fallback — no § heading, no "Usługi dodatkowe" section title. */
export function renderUnnumberedAdditionalServicesBlock(
  names: string[],
): string {
  return [
    'Ponadto zakres zamówienia obejmuje następujące usługi dodatkowe:',
    renderAdditionalServicesBulletList(names),
  ].join('\n')
}

/** @deprecated Use renderUnnumberedAdditionalServicesBlock for fallback placement. */
export function renderAdditionalServicesFallbackBlock(
  names: string[],
): string {
  return renderUnnumberedAdditionalServicesBlock(names)
}

/** Detect price or quantity patterns adjacent to additional-service prose. */
export function textLooksLikeServicePriceOrQuantity(text: string): boolean {
  if (!text.trim()) return false
  return (
    /\d[\d\s]*\s*zł/i.test(text) ||
    /\bPLN\b/i.test(text) ||
    /\bx\s*\d+\b/i.test(text) ||
    /\b\d+\s*szt\.?\b/i.test(text) ||
    /,\s*\d+\s*zł/i.test(text)
  )
}

export function serviceNamePresentInText(
  text: string,
  name: string,
): boolean {
  const normText = normalizeForMatch(text)
  const normName = normalizeForMatch(name)
  if (!normName) return false
  return normText.includes(normName)
}
