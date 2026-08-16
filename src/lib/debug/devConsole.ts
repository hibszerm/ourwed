/**
 * Browser DEV-only console helpers.
 * Production builds are no-ops — do not log PII/payload dumps here.
 */

function isDev(): boolean {
  try {
    return Boolean(
      (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV,
    )
  } catch {
    return false
  }
}

/** DEV-only info diagnostic (no-op in production). */
export function devInfo(label: string, detail?: Record<string, unknown>): void {
  if (!isDev()) return
  if (detail) console.info(label, detail)
  else console.info(label)
}

/** DEV-only warning (no-op in production). */
export function devWarn(label: string, detail?: unknown): void {
  if (!isDev()) return
  if (detail !== undefined) console.warn(label, detail)
  else console.warn(label)
}

/** DEV-only error diagnostic (no-op in production). Prefer codes over payloads. */
export function devError(label: string, detail?: Record<string, unknown>): void {
  if (!isDev()) return
  if (detail) console.error(label, detail)
  else console.error(label)
}

/** DEV-only debug (no-op in production). */
export function devDebug(label: string, detail?: unknown): void {
  if (!isDev()) return
  if (detail !== undefined) console.debug(label, detail)
  else console.debug(label)
}

/** Variadic DEV-only debug. */
export function devDebugArgs(...args: unknown[]): void {
  if (!isDev()) return
  console.debug(...args)
}

/**
 * Variadic DEV-only info for legacy `console.info(a, b, …)` call sites.
 * Prefer typed `devInfo(label, detail)` for new code.
 */
export function devInfoArgs(...args: unknown[]): void {
  if (!isDev()) return
  console.info(...args)
}

/** Variadic DEV-only warn. */
export function devWarnArgs(...args: unknown[]): void {
  if (!isDev()) return
  console.warn(...args)
}

/** Variadic DEV-only error. */
export function devErrorArgs(...args: unknown[]): void {
  if (!isDev()) return
  console.error(...args)
}
