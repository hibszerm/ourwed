/**
 * Domain error contract for PRO-required server writes.
 * Distinct from ownership / auth failures.
 */

export const PRO_ACCESS_REQUIRED = 'PRO_ACCESS_REQUIRED'

export function isProAccessRequiredError(err: unknown): boolean {
  if (err == null) return false

  const record =
    typeof err === 'object' ? (err as Record<string, unknown>) : null
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String(record?.message ?? '')
  const code = String(record?.code ?? '')
  const hint = String(record?.hint ?? '')
  const details = String(record?.details ?? '')
  const blob = `${message} ${code} ${hint} ${details}`.toLowerCase()

  if (message === PRO_ACCESS_REQUIRED || code === PRO_ACCESS_REQUIRED) {
    return true
  }
  if (blob.includes('pro_required') || blob.includes('pro_access_required')) {
    return true
  }
  // Map entitlement-specific privilege errors only (not ownership).
  if (
    (code === '42501' || code === 'P0001') &&
    /active pro|entitlement|pro_required|subskrypc/i.test(blob)
  ) {
    return true
  }
  return false
}

export function toProAccessUserMessage(): string {
  return 'Ta akcja wymaga aktywnego planu PRO.'
}
