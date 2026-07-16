/**
 * Shared Supabase / mapping helpers used by domain services.
 */

export function throwOnError(
  error: { message: string } | null,
): asserts error is null {
  if (error) {
    throw new Error(error.message)
  }
}

export function toDateString(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 10)
}

export function toOptionalDateString(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined
  return value.slice(0, 10)
}

export function toNumber(
  value: number | string | null | undefined,
  fallback = 0,
): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

/**
 * Only real Studio Catalog package UUIDs may hit `packages.id` / `weddings.package_id`.
 * Rejects legacy mock ids (`p1`, `p2`, …) and empty strings.
 */
export function asCatalogPackageId(
  value: string | null | undefined,
): string | null {
  if (!value || !isLikelyUuid(value)) return null
  return value
}
