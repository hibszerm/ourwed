/**
 * Pure planning helpers for questionnaire → wedding_extra_services sync.
 * Kept free of Supabase imports so acceptance tests can run in Node.
 */

import type { AdditionalServiceOptionSnapshot } from '@/types/contractQuestionnaire'

/** Pure validation helper — does not touch the database. */
export function validateSelectedExtraIdsAgainstSnapshot(
  selectedIds: string[],
  allowed: AdditionalServiceOptionSnapshot[],
): { valid: string[]; invalid: string[] } {
  if (allowed.length === 0) {
    return { valid: selectedIds, invalid: [] }
  }
  const allow = new Set(allowed.map((s) => s.id))
  const valid: string[] = []
  const invalid: string[] = []
  for (const id of selectedIds) {
    if (allow.has(id)) valid.push(id)
    else invalid.push(id)
  }
  return { valid, invalid }
}

/**
 * Pure plan of which IDs would be inserted vs skipped (idempotent).
 * Deselection never deletes — existing rows are preserved.
 */
export function planWeddingExtraSync(
  selectedIds: string[],
  existingExtraServiceIds: string[],
): { toInsert: string[]; toSkip: string[] } {
  const existing = new Set(existingExtraServiceIds)
  const toInsert: string[] = []
  const toSkip: string[] = []
  for (const id of selectedIds) {
    if (existing.has(id)) toSkip.push(id)
    else {
      toInsert.push(id)
      existing.add(id)
    }
  }
  return { toInsert, toSkip }
}
