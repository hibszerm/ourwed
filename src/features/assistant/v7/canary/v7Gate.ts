/**
 * V7 global visibility gate — production cutover.
 *
 * Visibility only. Does not grant CRM authority beyond RLS.
 *
 * Primary kill switch: VITE_ASSISTANT_V7_GLOBAL (default OFF).
 * Legacy alias: VITE_ASSISTANT_V7_OWNER_CANARY (same effect — any authenticated user).
 *
 * When ON + authenticated userId from session → visible V7 for ALL authenticated users.
 * When OFF → fail-closed (no legacy engine).
 *
 * Tenant identity still comes only from authService.getUser() / session — never the model.
 */

function envTruthy(name: string): boolean {
  const raw = String(import.meta.env?.[name] ?? '')
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes'
}

let flagOverrideForTests: boolean | null = null

/** Test-only override for V7 global flag (null = read Vite env). */
export function setV7GlobalFlagForTests(value: boolean | null): void {
  flagOverrideForTests = value
}

/**
 * V7 global kill switch.
 * ON when VITE_ASSISTANT_V7_GLOBAL or legacy VITE_ASSISTANT_V7_OWNER_CANARY is truthy.
 */
export function isV7GlobalFlagEnabled(): boolean {
  if (flagOverrideForTests !== null) return flagOverrideForTests
  return (
    envTruthy('VITE_ASSISTANT_V7_GLOBAL') ||
    envTruthy('VITE_ASSISTANT_V7_OWNER_CANARY')
  )
}

/**
 * Visible V7 for any authenticated OurWed user when global flag is ON.
 * userId must come from authenticated session (Host / host.ts).
 */
export function isV7Enabled(
  userId: string | null | undefined,
): boolean {
  if (!userId || typeof userId !== 'string' || !userId.trim()) return false
  return isV7GlobalFlagEnabled()
}

/** @deprecated Alias of isV7Enabled */
export function isV7Visible(
  userId: string | null | undefined,
): boolean {
  return isV7Enabled(userId)
}
