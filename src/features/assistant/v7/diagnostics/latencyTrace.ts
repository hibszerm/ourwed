/**
 * Phase 2K.9-L — V7 latency measurement tracer (diagnostic only).
 *
 * Default OFF. Enable for one browser page-load session via:
 *   ?assistant_latency_audit=1   (sticky for the page lifetime)
 *   window.__OURWED_V7_LATENCY_AUDIT__ = true
 *   VITE_ASSISTANT_V7_LATENCY_AUDIT=true
 *
 * URL flag is captured at boot (before SPA redirects strip search)
 * and mirrored onto window.__OURWED_V7_LATENCY_AUDIT__.
 *
 * Never logs utterance text, PII, tokens, tool args, or CRM field values.
 * Does not change agent/tool/presentation execution.
 */

export type V7LatencyMarkDetail = Record<
  string,
  string | number | boolean | null | undefined
>

export type V7LatencyMark = {
  name: string
  /** ms since trace start (monotonic) */
  ms: number
  detail?: V7LatencyMarkDetail
}

export type V7LatencyTraceMeta = {
  model?: string | null
  ok?: boolean | null
  stoppedReason?: string | null
  llmCallCount?: number | null
  toolCallCount?: number | null
  toolNames?: string[] | null
  edgeOpenaiMs?: number[] | null
}

export type V7LatencyTraceSnapshot = {
  traceId: string
  marks: V7LatencyMark[]
  totalMs: number
  meta: V7LatencyTraceMeta
}

type WindowAuditFlag = {
  __OURWED_V7_LATENCY_AUDIT__?: unknown
}

let testOverride: boolean | null = null
let active: V7LatencyTrace | null = null
/** Sticky arm for this JS realm after URL/window enable (survives SPA search strip). */
let sessionArmed = false

function envTruthy(name: string): boolean {
  const raw = String(
    (import.meta as { env?: Record<string, unknown> }).env?.[name] ?? '',
  )
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes'
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function readWindowAuditFlag(): unknown {
  if (typeof window === 'undefined') return undefined
  return (window as Window & WindowAuditFlag).__OURWED_V7_LATENCY_AUDIT__
}

function writeWindowAuditFlag(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    ;(window as Window & WindowAuditFlag).__OURWED_V7_LATENCY_AUDIT__ = enabled
  } catch {
    // ignore
  }
}

function isTruthyAuditFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

/**
 * Capture ?assistant_latency_audit=1 (or an already-set window flag) into a
 * sticky session arm. Safe to call multiple times. Must run before SPA
 * navigations that strip search (e.g. / → /dashboard).
 */
export function armV7LatencyAuditFromUrl(): boolean {
  if (typeof window === 'undefined') return sessionArmed
  try {
    if (isTruthyAuditFlag(readWindowAuditFlag())) {
      sessionArmed = true
      writeWindowAuditFlag(true)
      return true
    }
    const q = new URLSearchParams(window.location.search)
    if (q.get('assistant_latency_audit') === '1') {
      sessionArmed = true
      writeWindowAuditFlag(true)
      return true
    }
  } catch {
    // ignore
  }
  return sessionArmed
}

/** Test-only enable/disable (null = production gate). */
export function setV7LatencyAuditForTests(value: boolean | null): void {
  testOverride = value
  if (value === null) {
    sessionArmed = false
  } else if (value === false) {
    sessionArmed = false
  }
}

/** Test helper: reset sticky arm without touching window. */
export function resetV7LatencyAuditSessionArmForTests(): void {
  sessionArmed = false
}

export function isV7LatencyAuditEnabled(): boolean {
  if (testOverride != null) return testOverride
  // Re-arm if URL/window still present (and keep sticky once armed).
  armV7LatencyAuditFromUrl()
  if (sessionArmed) return true
  if (isTruthyAuditFlag(readWindowAuditFlag())) {
    sessionArmed = true
    return true
  }
  return envTruthy('VITE_ASSISTANT_V7_LATENCY_AUDIT')
}

export function getActiveV7LatencyTrace(): V7LatencyTrace | null {
  return active
}

export function beginV7LatencyTrace(traceId: string): V7LatencyTrace | null {
  if (!isV7LatencyAuditEnabled()) {
    active = null
    return null
  }
  active = new V7LatencyTrace(traceId)
  return active
}

export function clearActiveV7LatencyTrace(): void {
  active = null
}

/** Pure formatter — used by emit + tests. */
export function formatV7LatencyTrace(snap: V7LatencyTraceSnapshot): string {
  const width = Math.max(
    18,
    ...snap.marks.map((m) => m.name.length),
    'TOTAL'.length,
  )
  const lines = [
    `Assistant latency [${snap.traceId}]`,
    '',
    ...snap.marks.map(
      (m) =>
        `${m.name.padEnd(width)} ${String(Math.round(m.ms)).padStart(6)} ms` +
        (m.detail && Object.keys(m.detail).length > 0
          ? `  ${formatDetail(m.detail)}`
          : ''),
    ),
    '',
    `${'TOTAL'.padEnd(width)} ${String(Math.round(snap.totalMs)).padStart(6)} ms`,
  ]
  const metaBits: string[] = []
  if (snap.meta.ok != null) metaBits.push(`ok=${snap.meta.ok}`)
  if (snap.meta.stoppedReason) metaBits.push(`stopped=${snap.meta.stoppedReason}`)
  if (snap.meta.model) metaBits.push(`model=${snap.meta.model}`)
  if (snap.meta.llmCallCount != null) {
    metaBits.push(`llmCalls=${snap.meta.llmCallCount}`)
  }
  if (snap.meta.toolCallCount != null) {
    metaBits.push(`toolCalls=${snap.meta.toolCallCount}`)
  }
  if (snap.meta.toolNames && snap.meta.toolNames.length > 0) {
    metaBits.push(`tools=${snap.meta.toolNames.join(',')}`)
  }
  if (metaBits.length > 0) {
    lines.push('', metaBits.join('  '))
  }
  return lines.join('\n')
}

function formatDetail(detail: V7LatencyMarkDetail): string {
  return Object.entries(detail)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
}

export class V7LatencyTrace {
  readonly traceId: string
  private readonly t0: number
  private readonly marks: V7LatencyMark[] = []
  private meta: V7LatencyTraceMeta = {}
  private finished = false
  private llmIndex = 0
  private toolIndex = 0
  private readonly edgeOpenaiMs: number[] = []

  constructor(traceId: string) {
    this.traceId = traceId
    this.t0 = nowMs()
  }

  mark(name: string, detail?: V7LatencyMarkDetail): void {
    if (this.finished) return
    this.marks.push({
      name,
      ms: nowMs() - this.t0,
      detail,
    })
  }

  /** Convenience: llm_1_start / llm_1_end with optional edge openai ms. */
  markLlmStart(): number {
    this.llmIndex += 1
    const i = this.llmIndex
    this.mark(`llm_${i}_start`)
    return i
  }

  markLlmEnd(
    index: number,
    detail?: {
      roundtripMs?: number
      edgeOpenaiMs?: number | null
      /** tools | final_content | grounding_retry_continue | provider_error */
      kind?: string
      /** Comma-separated tool names only — never args. */
      toolNames?: string | null
      toolCount?: number | null
      /**
       * 2K.9-L3 — provider usage when Edge returns the field.
       * Omit key when absent; include 0 when provider returns 0.
       */
      promptTokens?: number
      cachedTokens?: number
      cacheWriteTokens?: number
      completionTokens?: number
    },
  ): void {
    if (
      detail?.edgeOpenaiMs != null &&
      Number.isFinite(detail.edgeOpenaiMs)
    ) {
      this.edgeOpenaiMs.push(detail.edgeOpenaiMs)
    }
    const markDetail: V7LatencyMarkDetail = {
      roundtripMs: detail?.roundtripMs ?? null,
      edgeOpenaiMs: detail?.edgeOpenaiMs ?? null,
      kind: detail?.kind ?? null,
      toolNames: detail?.toolNames ?? null,
      toolCount: detail?.toolCount ?? null,
    }
    // Only attach usage keys that were actually provided (incl. explicit 0).
    if (typeof detail?.promptTokens === 'number') {
      markDetail.promptTokens = detail.promptTokens
    }
    if (typeof detail?.cachedTokens === 'number') {
      markDetail.cachedTokens = detail.cachedTokens
    }
    if (typeof detail?.cacheWriteTokens === 'number') {
      markDetail.cacheWriteTokens = detail.cacheWriteTokens
    }
    if (typeof detail?.completionTokens === 'number') {
      markDetail.completionTokens = detail.completionTokens
    }
    this.mark(`llm_${index}_end`, markDetail)
  }

  markToolStart(toolName: string): number {
    this.toolIndex += 1
    const i = this.toolIndex
    this.mark(`tool_${i}_start`, { name: toolName })
    return i
  }

  markToolEnd(index: number, toolName: string, durationMs: number): void {
    this.mark(`tool_${index}_end`, {
      name: toolName,
      durationMs: Math.round(durationMs),
    })
  }

  setMeta(partial: V7LatencyTraceMeta): void {
    this.meta = {
      ...this.meta,
      ...partial,
      edgeOpenaiMs:
        partial.edgeOpenaiMs ??
        (this.edgeOpenaiMs.length > 0 ? [...this.edgeOpenaiMs] : null),
    }
  }

  snapshot(): V7LatencyTraceSnapshot {
    const totalMs =
      this.marks.length > 0
        ? this.marks[this.marks.length - 1]!.ms
        : nowMs() - this.t0
    return {
      traceId: this.traceId,
      marks: [...this.marks],
      totalMs,
      meta: {
        ...this.meta,
        llmCallCount: this.meta.llmCallCount ?? this.llmIndex,
        toolCallCount: this.meta.toolCallCount ?? this.toolIndex,
        edgeOpenaiMs:
          this.meta.edgeOpenaiMs ??
          (this.edgeOpenaiMs.length > 0 ? [...this.edgeOpenaiMs] : null),
      },
    }
  }

  /** Emit one compact readable + structured console trace; clear active. */
  finish(meta?: V7LatencyTraceMeta): V7LatencyTraceSnapshot {
    if (meta) this.setMeta(meta)
    this.finished = true
    const snap = this.snapshot()
    try {
      const text = formatV7LatencyTrace(snap)
      console.info(`[assistant:v7-latency]\n${text}`, {
        traceId: snap.traceId,
        totalMs: Math.round(snap.totalMs),
        marks: snap.marks.map((m) => ({
          name: m.name,
          ms: Math.round(m.ms),
          detail: m.detail ?? null,
        })),
        meta: snap.meta,
      })
    } catch {
      // ignore
    }
    if (active === this) active = null
    return snap
  }
}
