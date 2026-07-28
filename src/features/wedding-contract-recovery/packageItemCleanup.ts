/**
 * Deterministic package included-items cleanup for contract recovery.
 * Does not rewrite contract meaning; only normalizes list presentation.
 */

const LIST_PREFIX_RE = /^(?:[-–—*•▪◦●]|\d+[.)]|[a-zA-Z][.)]|\([a-zA-Z0-9]+\))\s+/

export function normalizePackageItemText(raw: string): string | null {
  let text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return null
  text = text.replace(LIST_PREFIX_RE, '').trim()
  if (!text) return null
  // Drop trailing punctuation noise from list formatting only
  text = text.replace(/[;,:]+$/g, '').trim()
  return text || null
}

export function cleanupPackageIncludedItems(items: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of items) {
    const cleaned = normalizePackageItemText(raw)
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }

  return result
}

/**
 * When originalDescription is essentially the same as joining includedItems,
 * keep originalDescription (historical) but do not treat items as a duplicate
 * paragraph blob — split if the description is a single giant item.
 */
export function refinePackageItemsAgainstDescription(
  items: string[],
  originalDescription: string | null,
): string[] {
  const cleaned = cleanupPackageIncludedItems(items)
  if (cleaned.length === 0) return cleaned

  // If one giant item duplicates the description, prefer splitting on newlines/bullets
  if (cleaned.length === 1 && originalDescription) {
    const only = cleaned[0]!
    const desc = originalDescription.replace(/\s+/g, ' ').trim().toLowerCase()
    if (only.toLowerCase() === desc || only.length > 280) {
      const split = only
        .split(/\n+|(?=[•▪◦●])|(?<=[;.])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])/)
        .map((part) => normalizePackageItemText(part))
        .filter((part): part is string => Boolean(part))
      const refined = cleanupPackageIncludedItems(split)
      if (refined.length > 1) return refined
    }
  }

  return cleaned
}
