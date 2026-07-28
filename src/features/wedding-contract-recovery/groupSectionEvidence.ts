/**
 * UI-level evidence quote grouping for review sections.
 * Does not mutate persisted extraction.
 */

import type { ExtractionEvidence, RecoveryFieldComparison } from './types'
import { normalizeEvidenceQuoteForCompare } from './extractionSanitizers'

export type SharedEvidenceSource = {
  id: string
  label: string
  quote: string
  page: number | null
  fieldKeys: string[]
}

export type FieldEvidenceRef = {
  fieldKey: string
  sharedSourceId: string | null
  uniqueEvidence: ExtractionEvidence | null
}

export function groupSectionEvidence(fields: RecoveryFieldComparison[]): {
  fieldRefs: Map<string, FieldEvidenceRef>
  sharedSources: SharedEvidenceSource[]
} {
  const quoteToFields = new Map<
    string,
    { quote: string; page: number | null; fieldKeys: string[] }
  >()

  for (const field of fields) {
    const first = field.evidence[0]
    if (!first?.quote?.trim()) continue
    const key = normalizeEvidenceQuoteForCompare(first.quote)
    const existing = quoteToFields.get(key)
    if (existing) {
      existing.fieldKeys.push(field.fieldKey)
      if (existing.page == null && first.page != null) existing.page = first.page
    } else {
      quoteToFields.set(key, {
        quote: first.quote.trim(),
        page: first.page ?? null,
        fieldKeys: [field.fieldKey],
      })
    }
  }

  const sharedSources: SharedEvidenceSource[] = []
  const fieldToShared = new Map<string, string>()
  let sharedIndex = 0

  for (const entry of quoteToFields.values()) {
    if (entry.fieldKeys.length < 2) continue
    sharedIndex += 1
    const id = `src-${sharedIndex}`
    sharedSources.push({
      id,
      label: `Źródło ${sharedIndex}`,
      quote: entry.quote,
      page: entry.page,
      fieldKeys: entry.fieldKeys,
    })
    for (const fieldKey of entry.fieldKeys) {
      fieldToShared.set(fieldKey, id)
    }
  }

  const fieldRefs = new Map<string, FieldEvidenceRef>()
  for (const field of fields) {
    const sharedSourceId = fieldToShared.get(field.fieldKey) ?? null
    const first = field.evidence[0] ?? null
    fieldRefs.set(field.fieldKey, {
      fieldKey: field.fieldKey,
      sharedSourceId,
      uniqueEvidence: sharedSourceId ? null : first,
    })
  }

  return { fieldRefs, sharedSources }
}
