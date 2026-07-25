/**
 * Documents area performance marks and budget warnings (dev diagnostics).
 * Never throws — list/picker must stay snappy even if timing fails.
 */

export type DocumentsPerfPhase =
  | 'documents-route'
  | 'documents-list-query'
  | 'generate-picker'
  | 'template-detail'

export interface DocumentsPerfCounters {
  totalTemplateCount?: number
  totalPayloadBytes?: number
  numberOfNetworkRequests?: number
  numberOfSequentialRequests?: number
  analysisFunctionsCalled?: number
  binaryFilesFetched?: number
}

const BUDGETS = {
  listQueryMs: 1000,
  cardsAfterDataMs: 500,
  pickerFromCacheMs: 500,
  maxListNetworkRequests: 2,
} as const

let analysisCallCount = 0
let binaryFetchCount = 0

export function resetDocumentsPerfCounters() {
  analysisCallCount = 0
  binaryFetchCount = 0
}

function isDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV)
  } catch {
    return false
  }
}

/** Call from analysis/detection entry points when guarding list/picker paths. */
export function noteAnalysisFunctionCalled(name: string) {
  analysisCallCount += 1
  if (isDev()) {
    console.warn('[documents-performance] analysis function during read path', {
      name,
      analysisFunctionsCalled: analysisCallCount,
    })
  }
}

export function noteBinaryFileFetched(path: string) {
  binaryFetchCount += 1
  if (isDev()) {
    console.warn('[documents-performance] binary fetch during read path', {
      path: path.slice(0, 120),
      binaryFilesFetched: binaryFetchCount,
    })
  }
}

export function getDocumentsPerfCounters(): DocumentsPerfCounters {
  return {
    analysisFunctionsCalled: analysisCallCount,
    binaryFilesFetched: binaryFetchCount,
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function mark(name: string) {
  try {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name)
    }
  } catch {
    /* ignore */
  }
}

function measure(name: string, startMark: string, endMark: string): number | null {
  try {
    if (typeof performance !== 'undefined' && performance.measure) {
      performance.measure(name, startMark, endMark)
      const entries = performance.getEntriesByName(name)
      const last = entries[entries.length - 1]
      return last?.duration ?? null
    }
  } catch {
    /* ignore */
  }
  return null
}

export function startDocumentsPerf(phase: DocumentsPerfPhase) {
  const startedAt = now()
  const prefix = `docs-perf:${phase}`
  mark(`${prefix}:start`)

  const stamps: Record<string, number> = { startedAt }

  return {
    stamp(label: string) {
      stamps[label] = now()
      mark(`${prefix}:${label}`)
    },
    finish(extra?: DocumentsPerfCounters & Record<string, unknown>) {
      const endedAt = now()
      mark(`${prefix}:end`)
      const totalMs = endedAt - startedAt
      measure(`${prefix}:total`, `${prefix}:start`, `${prefix}:end`)

      const payload = {
        phase,
        totalMs: Math.round(totalMs),
        stamps: Object.fromEntries(
          Object.entries(stamps).map(([k, v]) => [
            k,
            k === 'startedAt' ? v : Math.round(v - startedAt),
          ]),
        ),
        analysisFunctionsCalled: analysisCallCount,
        binaryFilesFetched: binaryFetchCount,
        ...extra,
      }

      if (isDev()) {
        console.info('[documents-performance]', payload)
        warnBudgets(phase, totalMs, stamps, extra)
      }

      return payload
    },
  }
}

function warnBudgets(
  phase: DocumentsPerfPhase,
  totalMs: number,
  stamps: Record<string, number>,
  extra?: DocumentsPerfCounters,
) {
  if (phase === 'documents-list-query' && totalMs > BUDGETS.listQueryMs) {
    console.warn(
      `[documents-performance] summary list query exceeded ${BUDGETS.listQueryMs}ms`,
      { totalMs: Math.round(totalMs) },
    )
  }

  if (
    phase === 'documents-route' &&
    stamps.cardsRenderedAt != null &&
    stamps.metadataResponseAt != null
  ) {
    const renderLag = stamps.cardsRenderedAt - stamps.metadataResponseAt
    if (renderLag > BUDGETS.cardsAfterDataMs) {
      console.warn(
        `[documents-performance] cards rendered >${BUDGETS.cardsAfterDataMs}ms after data`,
        { renderLagMs: Math.round(renderLag) },
      )
    }
  }

  if (
    phase === 'generate-picker' &&
    stamps.pickerDataAvailableAt != null &&
    stamps.modalOpenedAt != null
  ) {
    const fromOpen = stamps.pickerDataAvailableAt - stamps.modalOpenedAt
    if (fromOpen > BUDGETS.pickerFromCacheMs) {
      console.warn(
        `[documents-performance] picker data not available within ${BUDGETS.pickerFromCacheMs}ms`,
        { fromOpenMs: Math.round(fromOpen) },
      )
    }
  }

  const requests = extra?.numberOfNetworkRequests
  if (
    typeof requests === 'number' &&
    requests > BUDGETS.maxListNetworkRequests
  ) {
    console.warn(
      `[documents-performance] list/picker used >${BUDGETS.maxListNetworkRequests} network requests`,
      { requests },
    )
  }

  if ((extra?.analysisFunctionsCalled ?? analysisCallCount) > 0) {
    console.warn(
      '[documents-performance] analysis ran during list/picker loading',
      { count: extra?.analysisFunctionsCalled ?? analysisCallCount },
    )
  }

  if ((extra?.binaryFilesFetched ?? binaryFetchCount) > 0) {
    console.warn(
      '[documents-performance] binary fetched during list/picker loading',
      { count: extra?.binaryFilesFetched ?? binaryFetchCount },
    )
  }
}

/** Approx JSON byte size for diagnostics. */
export function approxJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
  } catch {
    return 0
  }
}
