/**
 * V7-CANARY — Minimal safe diagnostics (no PII / no CRM bodies).
 */

export function emitV7Diagnostic(detail: {
  turnId: string
  model?: string
  toolCallCount?: number
  stoppedReason?: string
  ok?: boolean
  handleCount?: number
  toolNames?: string[]
  latencyMs?: number
}): void {
  try {
    console.info('[assistant:v7]', {
      turnId: detail.turnId,
      model: detail.model ?? null,
      toolCallCount: detail.toolCallCount ?? null,
      stoppedReason: detail.stoppedReason ?? null,
      ok: detail.ok ?? null,
      handleCount: detail.handleCount ?? null,
      toolNames: detail.toolNames ?? null,
      latencyMs: detail.latencyMs ?? null,
    })
  } catch {
    // ignore
  }
}
