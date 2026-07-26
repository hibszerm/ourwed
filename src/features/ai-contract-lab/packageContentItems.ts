/**
 * Item-level package content comparison via structured attributes.
 * Never compares full legal sentences as blobs.
 */

import {
  compareStructuredPackageContent,
  parsePackageContent,
  type PackageContent,
} from '@/features/ai-contract-lab/structuredPackageContent'

/** @deprecated Prefer PackageContent.subtype / type — kept for UI labels. */
export type PackageContentMeaning =
  | 'teaser'
  | 'main_film'
  | 'electronic_delivery'
  | 'single_operator'
  | 'other'

export type PackageContentItem = {
  anchorId: string
  sourceText: string
  normalizedMeaning: PackageContentMeaning
}

export function meaningFromStructured(c: PackageContent): PackageContentMeaning {
  if (c.type === 'delivery') return 'electronic_delivery'
  if (c.subtype === 'highlight_film') return 'teaser'
  if (c.subtype === 'main_film') return 'main_film'
  if (c.subtype === 'operator' && c.quantity === 1) return 'single_operator'
  return 'other'
}

export function normalizePackageMeaning(text: string): PackageContentMeaning {
  return meaningFromStructured(parsePackageContent(text))
}

export function parseCanonicalPackageItems(
  packageContentsField: string | null | undefined,
): Array<{ raw: string; meaning: PackageContentMeaning; structured: PackageContent }> {
  if (!packageContentsField?.trim()) return []
  return packageContentsField
    .split(/[\n;,•·]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const structured = parsePackageContent(raw)
      return {
        raw,
        structured,
        meaning: meaningFromStructured(structured),
      }
    })
}

export type PackageItemCompareStatus =
  | 'UNCHANGED'
  | 'REPLACEMENT'
  | 'DOCUMENT_ONLY'
  | 'MISSING_CANONICAL_ITEM'
  | 'REVIEW'

export function comparePackageContentItem(input: {
  documentText: string
  canonicalItems: Array<{
    raw: string
    meaning: PackageContentMeaning
    structured?: PackageContent
  }>
}): {
  status: PackageItemCompareStatus
  matchedCanonical: string | null
  meaning: PackageContentMeaning
  reason: string
} {
  const document = parsePackageContent(input.documentText)
  const meaning = meaningFromStructured(document)
  const canonical = input.canonicalItems.map(
    (c) => c.structured ?? parsePackageContent(c.raw),
  )

  const cmp = compareStructuredPackageContent({ document, canonical })

  return {
    status: cmp.status,
    matchedCanonical: cmp.matched?.raw ?? null,
    meaning,
    reason: cmp.reason,
  }
}
