/**
 * Run golden benchmarks against the production Edge analyzer.
 * Does not modify prompts, validation, or the import pipeline.
 * Bypasses the client analysis cache so scores reflect live provider output.
 */

import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DOCUMENT_AI_CONFIG } from '@/features/documents/ai/config'
import {
  DocumentAiAnalysisError,
  documentAiErrorFromPayload,
  mapHttpStatusToErrorCode,
} from '@/features/documents/ai/errors'
import { hashDocumentText } from '@/features/documents/ai/hash'
import type { DocumentAiErrorPayload } from '@/features/documents/ai/types'
import { BENCHMARK_FIXTURES, getBenchmarkFixture } from './fixtures'
import { averageRecall, scoreDetected } from './metrics'
import { normalizeIdList } from './normalizeIds'
import type {
  BenchmarkCaseResult,
  BenchmarkFixture,
  BenchmarkSuiteResult,
  DetectedBuckets,
} from './types'

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const x of value) {
    if (typeof x === 'string' && x.trim()) out.push(x.trim())
  }
  return out
}

function detectedFromEdgeAnalysis(analysis: unknown): DetectedBuckets {
  if (!analysis || typeof analysis !== 'object') {
    return { couple: [], company: [], package: [], possible: [] }
  }
  const obj = analysis as Record<string, unknown>
  return {
    couple: normalizeIdList(asStringList(obj.coupleVariables)),
    company: normalizeIdList(asStringList(obj.studioVariables)),
    package: normalizeIdList(asStringList(obj.packageVariables)),
    possible: normalizeIdList(asStringList(obj.possibleVariables)),
  }
}

async function invokeProductionAnalysis(text: string): Promise<{
  analysis: unknown
  fromCache?: boolean
}> {
  const contentHash = await hashDocumentText(text)
  // Distinct cache key prefix so eval runs do not collide with import cache
  // semantics on the Edge memory cache.
  const evalHash = `eval:${contentHash}`

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    DOCUMENT_AI_CONFIG.clientTimeoutMs,
  )

  try {
    const result = await supabase.functions.invoke(
      DOCUMENT_AI_CONFIG.edgeFunctionName,
      {
        body: {
          text,
          contentHash: evalHash,
          mode: 'production',
          schemaVersion: DOCUMENT_AI_CONFIG.schemaVersion,
          promptVersion: DOCUMENT_AI_CONFIG.promptVersion,
        },
        signal: controller.signal,
      },
    )

    if (result.error) {
      let body: unknown = result.data
      if (result.error instanceof FunctionsHttpError) {
        try {
          body = await result.error.context.json()
        } catch {
          /* keep data */
        }
      }
      if (
        body &&
        typeof body === 'object' &&
        (body as { ok?: unknown }).ok === false &&
        'error' in body
      ) {
        throw documentAiErrorFromPayload(
          (body as { error: DocumentAiErrorPayload }).error,
        )
      }
      const status =
        result.error instanceof FunctionsHttpError &&
        typeof result.error.context?.status === 'number'
          ? result.error.context.status
          : 0
      throw new DocumentAiAnalysisError(mapHttpStatusToErrorCode(status))
    }

    const data = result.data
    if (
      !data ||
      typeof data !== 'object' ||
      (data as { ok?: unknown }).ok !== true ||
      (data as { analysis?: unknown }).analysis == null
    ) {
      if (
        data &&
        typeof data === 'object' &&
        (data as { ok?: unknown }).ok === false &&
        'error' in data
      ) {
        throw documentAiErrorFromPayload(
          (data as { error: DocumentAiErrorPayload }).error,
        )
      }
      throw new DocumentAiAnalysisError('empty_response')
    }

    return {
      analysis: (data as { analysis: unknown }).analysis,
      fromCache: Boolean((data as { fromCache?: boolean }).fromCache),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function runBenchmarkCase(
  fixture: BenchmarkFixture,
): Promise<BenchmarkCaseResult> {
  const started = performance.now()
  try {
    const { analysis, fromCache } = await invokeProductionAnalysis(
      fixture.sourceText,
    )
    const detected = detectedFromEdgeAnalysis(analysis)
    const scored = scoreDetected(fixture.expected, detected)

    return {
      fixtureId: fixture.id,
      name: fixture.name,
      ok: true,
      fromCache,
      detected,
      couple: scored.couple,
      company: scored.company,
      package: scored.package,
      overall: scored.overall,
      unexpectedAll: scored.unexpectedAll,
      missingAll: scored.missingAll,
      elapsedMs: Math.round(performance.now() - started),
    }
  } catch (err) {
    const message =
      err instanceof DocumentAiAnalysisError
        ? err.code
        : err instanceof Error
          ? err.message
          : 'unknown_error'
    const empty: DetectedBuckets = {
      couple: [],
      company: [],
      package: [],
      possible: [],
    }
    const scored = scoreDetected(fixture.expected, empty)
    return {
      fixtureId: fixture.id,
      name: fixture.name,
      ok: false,
      error: message,
      detected: empty,
      couple: scored.couple,
      company: scored.company,
      package: scored.package,
      overall: scored.overall,
      unexpectedAll: scored.unexpectedAll,
      missingAll: scored.missingAll,
      elapsedMs: Math.round(performance.now() - started),
    }
  }
}

export async function runBenchmarkSuite(options?: {
  fixtureIds?: string[]
  onCaseDone?: (result: BenchmarkCaseResult, index: number, total: number) => void
}): Promise<BenchmarkSuiteResult> {
  const fixtures = options?.fixtureIds?.length
    ? options.fixtureIds
        .map((id) => getBenchmarkFixture(id))
        .filter((f): f is NonNullable<typeof f> => Boolean(f))
    : BENCHMARK_FIXTURES

  const cases: BenchmarkCaseResult[] = []
  for (let i = 0; i < fixtures.length; i++) {
    const result = await runBenchmarkCase(fixtures[i]!)
    cases.push(result)
    options?.onCaseDone?.(result, i, fixtures.length)
  }

  const okCases = cases.filter((c) => c.ok)
  const summary = {
    cases: cases.length,
    overallRecall: averageRecall(okCases.map((c) => c.overall.recall)),
    coupleRecall: averageRecall(okCases.map((c) => c.couple.recall)),
    companyRecall: averageRecall(okCases.map((c) => c.company.recall)),
    packageRecall: averageRecall(okCases.map((c) => c.package.recall)),
    totalMissing: okCases.reduce((n, c) => n + c.missingAll.length, 0),
    totalUnexpected: okCases.reduce((n, c) => n + c.unexpectedAll.length, 0),
  }

  return {
    ranAt: new Date().toISOString(),
    cases,
    summary,
  }
}

export { BENCHMARK_FIXTURES, getBenchmarkFixture }
