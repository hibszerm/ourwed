/**
 * Temporary timing diagnostics for 504 investigation.
 * Remove once the slow step is identified.
 */

const SLOW_MS = 1000

export function createRequestTimer() {
  const t0 = performance.now()

  function elapsedMs(): number {
    return Math.round(performance.now() - t0)
  }

  function log(step: string, extra?: Record<string, unknown>): void {
    const ms = elapsedMs()
    const payload = { elapsedMs: ms, step, ...extra }
    console.info('[document-ai] timing', payload)
    if (ms >= SLOW_MS) {
      console.warn('[document-ai] SLOW STEP', {
        step,
        elapsedMs: ms,
        note: `exceeded ${SLOW_MS}ms from request start`,
        ...extra,
      })
    }
  }

  function logStepDuration(
    step: string,
    stepStartedAt: number,
    extra?: Record<string, unknown>,
  ): void {
    const stepMs = Math.round(performance.now() - stepStartedAt)
    const ms = elapsedMs()
    console.info('[document-ai] timing', {
      elapsedMs: ms,
      step,
      stepDurationMs: stepMs,
      ...extra,
    })
    if (stepMs >= SLOW_MS) {
      console.warn('[document-ai] SLOW STEP', {
        step,
        stepDurationMs: stepMs,
        elapsedMs: ms,
        note: `step itself exceeded ${SLOW_MS}ms`,
        ...extra,
      })
    }
  }

  return { t0, elapsedMs, log, logStepDuration }
}

export type RequestTimer = ReturnType<typeof createRequestTimer>

/** Rough estimate — ~4 chars per token for mixed PL/EN text. */
export function estimateTokenCount(charLength: number): number {
  return Math.ceil(charLength / 4)
}
