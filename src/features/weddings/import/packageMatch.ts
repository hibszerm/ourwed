import { normalizeHeaderKey } from './normalizeHeader'

export type PackageCatalogEntry = {
  id: string
  name: string
}

export function matchPackageByName(
  value: string | undefined,
  catalog: PackageCatalogEntry[],
): { packageId?: string; packageName?: string; exact: boolean } {
  const trimmed = value?.trim()
  if (!trimmed) return { exact: false }

  const normalized = normalizeHeaderKey(trimmed)
  const matches = catalog.filter(
    (pkg) => normalizeHeaderKey(pkg.name) === normalized,
  )

  if (matches.length === 1) {
    return {
      packageId: matches[0]!.id,
      packageName: matches[0]!.name,
      exact: true,
    }
  }

  return { packageName: trimmed, exact: false }
}
