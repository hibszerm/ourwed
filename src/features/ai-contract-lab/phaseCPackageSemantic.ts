/**
 * Phase C package semantic helpers — delegates to structured package content.
 */

import {
  compareStructuredPackageContent,
  parseDurationBounds,
  parsePackageContent,
} from '@/features/ai-contract-lab/structuredPackageContent'
import type { PackageContentMeaning } from '@/features/ai-contract-lab/packageContentItems'
import { meaningFromStructured } from '@/features/ai-contract-lab/packageContentItems'

export type SemanticPackageStatus =
  | 'UNCHANGED'
  | 'REPLACEMENT'
  | 'DOCUMENT_ONLY'
  | 'REVIEW'

/** @deprecated Use parsePackageContent — kept for callers. */
export function semanticPackageMeaning(
  text: string,
): PackageContentMeaning | 'wedding_clip' | 'duration_note' {
  const c = parsePackageContent(text)
  if (c.type === 'duration') return 'duration_note'
  return meaningFromStructured(c)
}

/** Normalize duration phrases: "1–2 min" ≈ "ok. 1-2 minut" */
export function normalizeDurationPhrase(text: string): string | null {
  const d = parseDurationBounds(text)
  if (!d) return null
  return `${d.min}-${d.max}min`
}

export function comparePackageItemSemantically(input: {
  documentText: string
  canonicalItems: string[]
}): {
  status: SemanticPackageStatus
  matchedCanonical: string | null
  score: number
  reason: string
} {
  const document = parsePackageContent(input.documentText)
  const canonical = input.canonicalItems.map((raw) => parsePackageContent(raw))
  const cmp = compareStructuredPackageContent({ document, canonical })

  const score =
    cmp.status === 'UNCHANGED'
      ? 0.95
      : cmp.status === 'REPLACEMENT'
        ? 0.85
        : cmp.status === 'REVIEW'
          ? 0.6
          : 0.2

  return {
    status: cmp.status,
    matchedCanonical: cmp.matched?.raw ?? null,
    score,
    reason: cmp.reason,
  }
}
