/**
 * Pure helpers for wedding packageId hydrate / write safety.
 * Keeps FK-safe behavior testable without Supabase.
 */

import { asCatalogPackageId } from '@/lib/supabase/helpers'

/**
 * Resolve packageId after questionnaire hydrate.
 * Only a successfully looked-up catalog package may fill a missing wedding.packageId.
 * Never fall back to an unresolved form UUID (deleted/missing package → FK failure).
 */
export function resolveHydratedWeddingPackageId(input: {
  weddingPackageId: string | null | undefined
  resolvedCatalogPackageId: string | null | undefined
}): string | null {
  return (
    asCatalogPackageId(input.weddingPackageId) ??
    asCatalogPackageId(input.resolvedCatalogPackageId) ??
    null
  )
}

function normalizeWritablePackageId(
  value: string | null | undefined,
): string | null {
  if (value == null || value === '') return null
  return asCatalogPackageId(value)
}

/** Decide whether an update payload may include package_id. */
export function decideWeddingPackageIdWrite(input: {
  incomingPackageId: string | null | undefined
  packageExists: boolean | null
  /** When equal to the normalized incoming value, omit (package unchanged). */
  currentPackageId?: string | null
}): { include: true; value: string | null } | { include: false } {
  const incoming =
    input.incomingPackageId == null || input.incomingPackageId === ''
      ? null
      : (asCatalogPackageId(input.incomingPackageId) ?? null)
  const current = normalizeWritablePackageId(input.currentPackageId)

  // Prefer omitting package_id when the edit did not change it.
  if (
    input.currentPackageId !== undefined &&
    incoming === current &&
    // Non-catalog strings (e.g. mock "p1") normalize to null — only treat as
    // unchanged when the raw incoming was also empty/null.
    (input.incomingPackageId == null ||
      input.incomingPackageId === '' ||
      asCatalogPackageId(input.incomingPackageId) != null)
  ) {
    return { include: false }
  }

  if (input.incomingPackageId == null || input.incomingPackageId === '') {
    return { include: true, value: null }
  }
  const id = asCatalogPackageId(input.incomingPackageId)
  if (!id) {
    return { include: true, value: null }
  }
  if (input.packageExists === false) {
    return { include: false }
  }
  if (input.packageExists === true) {
    return { include: true, value: id }
  }
  // Existence unknown — caller must resolve before writing.
  return { include: false }
}
