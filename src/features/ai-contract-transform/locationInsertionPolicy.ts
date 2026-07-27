/**
 * Location insertion helpers + heuristic grammar / completeness warnings.
 * Heuristics only — does not claim full Polish grammar validation.
 */

import type { ContractTransformationDataset } from './types'

export function looksLikeStreetAddress(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  return (
    /\bul\.?\b/i.test(v) ||
    /\b(al\.|aleja|os\.|plac|pl\.)\b/i.test(v) ||
    /\b\d{2}-\d{3}\b/.test(v)
  )
}

export function looksLikeVenueDisplayName(value: string): boolean {
  const v = value.trim()
  if (!v || looksLikeStreetAddress(v)) return false
  return (
    /\b(pałac|kościół|bazylika|hotel|sala|dwór|restauracja|ośrodek|dom|kaplica)\b/i.test(
      v,
    ) || /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(v)
  )
}

/** Building number alone / incomplete street data. */
export function isIncompleteLocationAddress(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  // bare number or "nr 5" without street
  if (/^(nr\.?\s*)?\d+[a-zA-Z]?$/i.test(v)) return true
  if (/^(budynek|blok)\s*\d+/i.test(v) && !/\bul\.?\b/i.test(v)) return true
  return false
}

/**
 * Malformed "przy ul. <nominative street>" without inflection —
 * heuristic warning only.
 */
export function hasPossibleLocationGrammarIssue(text: string): boolean {
  // "przy ul. Lwowska" / "przy ulicy Lwowska" — adjective-like nominative after ul.
  return /\bprzy\s+ul\.?\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:ska|cka|dzka|owa|owa)\b/.test(
    text,
  ) || /\bprzy\s+ulicy\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:ska|cka|dzka|owa)\b/.test(
    text,
  )
}

export function preferredLocationInsertionHint(loc: {
  displayName?: string
  fullAddress?: string
}): 'display_name' | 'pod_adresem' | 'incomplete' {
  const name = loc.displayName?.trim()
  const addr = loc.fullAddress?.trim()
  if (addr && isIncompleteLocationAddress(addr)) return 'incomplete'
  if (name && looksLikeVenueDisplayName(name) && (!addr || name === addr)) {
    return 'display_name'
  }
  if (addr && looksLikeStreetAddress(addr)) return 'pod_adresem'
  if (name && looksLikeStreetAddress(name)) return 'pod_adresem'
  if (addr) return 'pod_adresem'
  return 'display_name'
}

export function collectLocationDatasetValues(
  dataset: ContractTransformationDataset,
): string[] {
  const out: string[] = []
  for (const key of ['preparation', 'ceremony', 'reception'] as const) {
    const loc = dataset.locations[key]
    if (!loc) continue
    if (loc.displayName?.trim()) out.push(loc.displayName.trim())
    if (loc.fullAddress?.trim()) out.push(loc.fullAddress.trim())
    if (loc.city?.trim()) out.push(loc.city.trim())
  }
  return out
}

export function replacementExplainedByLocationDataset(
  replacement: string,
  dataset: ContractTransformationDataset,
): boolean {
  const values = collectLocationDatasetValues(dataset)
  if (values.length === 0) return false
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  const r = norm(replacement)
  // Strip grammar-neutral wrapper
  const stripped = r
    .replace(/^pod adresem:?\s*/i, '')
    .replace(/^w\s+/i, '')
    .replace(/^we\s+/i, '')
    .trim()
  return values.some((v) => {
    const nv = norm(v)
    return (
      stripped.includes(nv) ||
      nv.includes(stripped) ||
      r.includes(nv)
    )
  })
}
