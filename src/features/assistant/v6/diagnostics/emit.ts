/**
 * V6-F1 — Shadow diagnostics (dev/QA). No secrets / full CRM rows.
 */

export type V6FailureTaxonomy =
  | 'INTERPRETATION_ERROR'
  | 'REFERENCE_RESOLUTION_ERROR'
  | 'UNSUPPORTED_CAPABILITY'
  | 'PLAN_ERROR'
  | 'VALIDATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'EXECUTION_ERROR'
  | 'STALE_COLLECTION'
  | 'OBSERVATION_ERROR'
  | 'PRESENTATION_ERROR'
  | 'PROVIDER_ERROR'

export type V6DiagnosticEvent = {
  turnId: string
  round?: number
  semanticAction?: string
  toolName?: string
  inputHandle?: string
  outputHandle?: string
  capability?: string
  authority?: string
  observationType?: string
  failureCode?: string
  modelLatencyMs?: number
  toolLatencyMs?: number
  tokenUsage?: unknown
  agentStatus?: string
  detail?: string
}

export function emitV6Diagnostic(event: V6DiagnosticEvent): void {
  if (import.meta.env?.DEV) {
    console.debug('[assistant-v6-shadow]', event)
  }
}
