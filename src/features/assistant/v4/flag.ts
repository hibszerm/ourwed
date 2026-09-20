/**
 * V4 feature flags — DEV/local only. Default OFF.
 *
 * Capability execution availability (Phase 3C):
 * - Prefer VITE_ASSISTANT_V4_EXECUTION_CAPABILITIES=id1,id2  (or * / all)
 * - Legacy: VITE_ASSISTANT_V4_EXECUTION_FINANCE still enables wedding.finance.get only
 * Production must keep all OFF.
 */

function envTruthy(name: string): boolean {
  const raw = String(import.meta.env?.[name] ?? '')
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes'
}

function envRaw(name: string): string {
  return String(import.meta.env?.[name] ?? '').trim()
}

/** Interpret + resolve observation only. Default OFF. */
export function isAssistantV4ShadowEnabled(): boolean {
  return envTruthy('VITE_ASSISTANT_V4_SHADOW')
}

/**
 * Legacy Phase 3A finance-only gate.
 * Still honored when CAPABILITIES allowlist is unset.
 */
export function isAssistantV4FinanceExecutionEnabled(): boolean {
  return envTruthy('VITE_ASSISTANT_V4_EXECUTION_FINANCE')
}

/**
 * Optional DEV-only: allow Product Owner tooling to read last V4 finance result.
 * Does NOT make V4 the visible Assistant authority by itself.
 * Default OFF.
 */
export function isAssistantV4FinanceVisibleDevEnabled(): boolean {
  return (
    Boolean(import.meta.env?.DEV) &&
    envTruthy('VITE_ASSISTANT_V4_EXECUTION_FINANCE_VISIBLE')
  )
}

/**
 * Parse VITE_ASSISTANT_V4_EXECUTION_CAPABILITIES.
 * - unset / empty → null (fall back to legacy finance flag)
 * - * | all → enable every registered id
 * - comma list → token set (validated against closed registry in availability)
 */
export function parseV4ExecutionCapabilitiesAllowlist():
  | 'all'
  | Set<string>
  | null {
  const raw = envRaw('VITE_ASSISTANT_V4_EXECUTION_CAPABILITIES')
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower === '*' || lower === 'all') return 'all'
  const out = new Set<string>()
  for (const part of raw.split(/[,;\s]+/)) {
    const id = part.trim()
    if (id) out.add(id)
  }
  return out
}

/** True when shadow should attempt registry execution (any gate on). */
export function isAnyV4CapabilityExecutionEnabled(): boolean {
  const allow = parseV4ExecutionCapabilitiesAllowlist()
  if (allow === 'all') return true
  if (allow && allow.size > 0) return true
  return isAssistantV4FinanceExecutionEnabled()
}
