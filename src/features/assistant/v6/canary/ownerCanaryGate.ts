/**
 * V6 emergency rollback visibility gate.
 *
 * Visibility only. Does not grant CRM authority beyond RLS.
 *
 * Primary kill switch: VITE_ASSISTANT_V6_EMERGENCY (default OFF).
 * Legacy alias: VITE_ASSISTANT_V6_OWNER_CANARY (same effect when used for rollback).
 *
 * When ON + authenticated userId → visible V6 for ALL authenticated users
 * (only reached when V7 global is OFF — Host enforces mutual exclusivity).
 *
 * NEVER mix V6 ConversationCollection with V7 ResourceSet in one session —
 * Host must destroy the other engine's session before switching.
 */

function envTruthy(name: string): boolean {
  const raw = String(import.meta.env?.[name] ?? '')
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes'
}

/** Test-only kill-switch override (null = read Vite env). */
let flagOverrideForTests: boolean | null = null

export function setV6EmergencyFlagForTests(value: boolean | null): void {
  flagOverrideForTests = value
}

/** @deprecated Use setV6EmergencyFlagForTests */
export function setV6OwnerCanaryFlagForTests(value: boolean | null): void {
  setV6EmergencyFlagForTests(value)
}

/**
 * V6 emergency kill switch.
 * ON when VITE_ASSISTANT_V6_EMERGENCY or legacy VITE_ASSISTANT_V6_OWNER_CANARY is truthy.
 */
export function isV6EmergencyFlagEnabled(): boolean {
  if (flagOverrideForTests !== null) return flagOverrideForTests
  return (
    envTruthy('VITE_ASSISTANT_V6_EMERGENCY') ||
    envTruthy('VITE_ASSISTANT_V6_OWNER_CANARY')
  )
}

/** @deprecated Use isV6EmergencyFlagEnabled */
export function isV6OwnerCanaryFlagEnabled(): boolean {
  return isV6EmergencyFlagEnabled()
}

/**
 * Visible V6 emergency path for any authenticated user when emergency flag is ON.
 * Host must only call this when V7 is not visible for the turn.
 */
export function isV6EmergencyVisible(
  userId: string | null | undefined,
): boolean {
  if (!userId || typeof userId !== 'string' || !userId.trim()) return false
  return isV6EmergencyFlagEnabled()
}

/**
 * @deprecated Alias of isV6EmergencyVisible — retained for Host/import stability.
 * No longer owner-UUID-restricted.
 */
export function isV6OwnerCanaryVisible(
  userId: string | null | undefined,
): boolean {
  return isV6EmergencyVisible(userId)
}

/**
 * Host routing decision — visibility only.
 * When v6Visible, Host must await V6 once and must not fire shadow duplicate
 * or produce a second legacy visible answer.
 */
export function decideV6CanaryRouting(input: {
  authenticatedUserId: string | null | undefined
}): {
  v6Visible: boolean
  /** Fire-and-forget shadow for non-visible-V6 users only. */
  runShadowDiagnostics: boolean
} {
  const v6Visible = isV6EmergencyVisible(input.authenticatedUserId)
  return {
    v6Visible,
    runShadowDiagnostics: !v6Visible,
  }
}
