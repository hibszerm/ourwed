/**
 * Client API for transform edge functions — no secrets in browser.
 * v2: sparse changedBlocks → local reconstruction.
 */

import { applySparseBlockChanges } from './applySparseBlockChanges'
import {
  buildTransformEdgeErrorDetail,
  edgeErrorFromThrown,
  type TransformEdgeErrorDetail,
} from './edgeFunctionError'
import {
  parseLegacyV1TransformedBlocks,
  parseSparseV2ModelPayload,
} from './sparseResponseSchema'
import type {
  ContractTransformationDataset,
  ResponseSizeDiagnostics,
  TransformDocumentBlock,
  TransformedBlock,
  TransformMode,
} from './types'
import {
  FULL_AI_PROMPT_VERSION,
  FULL_AI_RESPONSE_VERSION,
  GUARDED_AI_PROMPT_VERSION,
  GUARDED_AI_RESPONSE_VERSION,
} from './types'

export type TransformApiError = {
  code: string
  message: string
  retryable?: boolean
  reason?: string
  configuredMaxOutputTokens?: number
  detail: TransformEdgeErrorDetail
}

export type TransformApiSuccess = {
  ok: true
  /** Fully reconstructed document blocks. */
  transformedBlocks: TransformedBlock[]
  changedBlockCount: number
  model: string
  promptVersion: string
  responseVersion: string
  responseSizeDiagnostics?: ResponseSizeDiagnostics
  durationMs: number
}

export type TransformApiResult =
  | TransformApiSuccess
  | { ok: false; error: TransformApiError; durationMs: number }

export type TransformFunctionsInvoke = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: unknown }>

function slimBlocks(blocks: TransformDocumentBlock[]) {
  return blocks.map((b) => ({
    blockId: b.blockId,
    text: b.text,
  }))
}

const defaultInvoke: TransformFunctionsInvoke = async (functionName, options) => {
  const { supabase } = await import('@/lib/supabase')
  const result = await supabase.functions.invoke(functionName, options)
  return { data: result.data, error: result.error }
}

function readDiagnostics(
  body: Record<string, unknown>,
): ResponseSizeDiagnostics | undefined {
  const d = body.diagnostics
  if (!d || typeof d !== 'object') return undefined
  const row = d as Record<string, unknown>
  return {
    attemptCount:
      typeof row.attemptCount === 'number' ? row.attemptCount : undefined,
    configuredMaxOutputTokens:
      typeof row.configuredMaxOutputTokens === 'number'
        ? row.configuredMaxOutputTokens
        : undefined,
    sourceBlockCount:
      typeof row.sourceBlockCount === 'number' ? row.sourceBlockCount : undefined,
    sourceCharacterCount:
      typeof row.sourceCharacterCount === 'number'
        ? row.sourceCharacterCount
        : undefined,
    changedBlockCount:
      typeof row.changedBlockCount === 'number' || row.changedBlockCount === null
        ? (row.changedBlockCount as number | null)
        : undefined,
    responseStatus:
      typeof row.responseStatus === 'string' ? row.responseStatus : undefined,
    incompleteReason:
      typeof row.incompleteReason === 'string' || row.incompleteReason === null
        ? (row.incompleteReason as string | null)
        : undefined,
    inputTokens: typeof row.inputTokens === 'number' ? row.inputTokens : undefined,
    outputTokens:
      typeof row.outputTokens === 'number' ? row.outputTokens : undefined,
    responseId:
      typeof row.responseId === 'string' || row.responseId === null
        ? (row.responseId as string | null)
        : undefined,
    outputItemCount:
      typeof row.outputItemCount === 'number' ? row.outputItemCount : undefined,
  }
}

function fail(
  input: {
    mode: TransformMode
    functionName: string
    durationMs: number
  },
  error: Omit<TransformApiError, 'detail'> & {
    detail?: TransformEdgeErrorDetail
  },
): TransformApiResult {
  const detail =
    error.detail ??
    ({
      mode: input.mode,
      functionName: input.functionName,
      errorType: 'invalid_response',
      message: error.message,
      incompleteReason: error.reason,
      configuredMaxOutputTokens: error.configuredMaxOutputTokens,
    } satisfies TransformEdgeErrorDetail)
  return {
    ok: false,
    durationMs: input.durationMs,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      reason: error.reason ?? detail.incompleteReason,
      configuredMaxOutputTokens:
        error.configuredMaxOutputTokens ?? detail.configuredMaxOutputTokens,
      detail,
    },
  }
}

export async function invokeTransform(input: {
  functionName: string
  mode: TransformMode
  runId: string
  promptVersion: string
  documentBlocks: TransformDocumentBlock[]
  transformationDataset: ContractTransformationDataset
  protectedDataSummary: { exactCount: number; patternCount: number }
  requiredReplacements?: unknown
  invoke?: TransformFunctionsInvoke
}): Promise<TransformApiResult> {
  const started = performance.now()
  const invoke = input.invoke ?? defaultInvoke

  let data: unknown
  let error: unknown
  try {
    const result = await invoke(input.functionName, {
      body: {
        runId: input.runId,
        mode: input.mode,
        promptVersion: input.promptVersion,
        documentBlocks: slimBlocks(input.documentBlocks),
        transformationDataset: input.transformationDataset,
        protectedDataSummary: input.protectedDataSummary,
        requiredReplacements: input.requiredReplacements ?? [],
      },
    })
    data = result.data
    error = result.error
  } catch (thrown) {
    const durationMs = Math.round(performance.now() - started)
    const detail = edgeErrorFromThrown({
      mode: input.mode,
      functionName: input.functionName,
      error: thrown,
    })
    return {
      ok: false,
      durationMs,
      error: {
        code: detail.errorType,
        message: detail.message,
        retryable:
          detail.errorType === 'network_error' ||
          detail.errorType === 'timeout' ||
          detail.errorType === 'provider_error',
        detail,
      },
    }
  }

  const durationMs = Math.round(performance.now() - started)

  if (error) {
    const detail = await buildTransformEdgeErrorDetail({
      mode: input.mode,
      functionName: input.functionName,
      error,
      data,
    })
    return {
      ok: false,
      durationMs,
      error: {
        code: detail.providerCode ?? detail.errorType,
        message: detail.message,
        retryable:
          detail.retryable ??
          (detail.errorType === 'network_error' ||
            detail.errorType === 'timeout' ||
            detail.errorType === 'provider_error'),
        reason: detail.incompleteReason,
        configuredMaxOutputTokens: detail.configuredMaxOutputTokens,
        detail,
      },
    }
  }

  if (!data || typeof data !== 'object') {
    return fail(
      { mode: input.mode, functionName: input.functionName, durationMs },
      {
        code: 'invalid_response',
        message: 'Brak odpowiedzi strukturalnej',
        detail: {
          mode: input.mode,
          functionName: input.functionName,
          errorType: 'invalid_response',
          message: 'Brak odpowiedzi strukturalnej',
          rawResponse: data == null ? 'null' : String(data),
        },
      },
    )
  }

  const body = data as Record<string, unknown>
  if (body.ok === false && body.error && typeof body.error === 'object') {
    const err = body.error as Record<string, unknown>
    const detail = await buildTransformEdgeErrorDetail({
      mode: input.mode,
      functionName: input.functionName,
      error: { message: String(err.message ?? 'Błąd AI') },
      data: body,
      fallbackMessage: String(err.message ?? 'Błąd AI'),
    })
    if (typeof err.code === 'string' && err.code.includes('config')) {
      detail.errorType = 'missing_configuration'
    }
    if (typeof err.reason === 'string') {
      detail.incompleteReason = err.reason
    }
    if (typeof err.configuredMaxOutputTokens === 'number') {
      detail.configuredMaxOutputTokens = err.configuredMaxOutputTokens
    }
    return {
      ok: false,
      durationMs,
      error: {
        code: String(err.code ?? detail.errorType),
        message: detail.message,
        retryable: Boolean(err.retryable),
        reason: detail.incompleteReason,
        configuredMaxOutputTokens: detail.configuredMaxOutputTokens,
        detail,
      },
    }
  }

  const diagnostics = readDiagnostics(body)

  // Prefer v2 sparse changedBlocks — responseVersion is trusted from Edge / injected
  if (Array.isArray(body.changedBlocks)) {
    const parsed = parseSparseV2ModelPayload(input.mode, {
      changedBlocks: body.changedBlocks,
      // Legacy Edge/fixture may still include responseVersion; ignored by parser
      ...(typeof body.responseVersion === 'string'
        ? { responseVersion: body.responseVersion }
        : {}),
    })
    if (!parsed.ok) {
      return fail(
        { mode: input.mode, functionName: input.functionName, durationMs },
        { code: parsed.code, message: parsed.message },
      )
    }

    const reconstructed = applySparseBlockChanges(
      input.documentBlocks,
      parsed.changedBlocks,
    )
    if (!reconstructed.ok) {
      return fail(
        { mode: input.mode, functionName: input.functionName, durationMs },
        {
          code: reconstructed.error.code,
          message: reconstructed.error.message,
        },
      )
    }

    // Prefer Edge-injected version when present and trusted; else parser injection
    const trusted =
      input.mode === 'full_ai_trusted_rewrite'
        ? FULL_AI_RESPONSE_VERSION
        : GUARDED_AI_RESPONSE_VERSION
    const edgeVersion =
      typeof body.responseVersion === 'string' ? body.responseVersion : ''
    const responseVersion =
      edgeVersion === trusted ? edgeVersion : parsed.responseVersion

    return {
      ok: true,
      transformedBlocks: reconstructed.blocks,
      changedBlockCount: reconstructed.changedBlockCount,
      model: String(body.model ?? 'unknown'),
      promptVersion: String(body.promptVersion ?? input.promptVersion),
      responseVersion,
      responseSizeDiagnostics: {
        ...diagnostics,
        changedBlockCount: reconstructed.changedBlockCount,
        sourceBlockCount:
          diagnostics?.sourceBlockCount ?? input.documentBlocks.length,
      },
      durationMs,
    }
  }

  // Temporary v1 fixture support only — never treat incomplete as valid.
  const legacy = parseLegacyV1TransformedBlocks(body)
  if (legacy) {
    return {
      ok: true,
      transformedBlocks: legacy,
      changedBlockCount: legacy.length,
      model: String(body.model ?? 'unknown'),
      promptVersion: String(body.promptVersion ?? input.promptVersion),
      responseVersion: String(body.responseVersion ?? ''),
      responseSizeDiagnostics: diagnostics,
      durationMs,
    }
  }

  return fail(
    { mode: input.mode, functionName: input.functionName, durationMs },
    {
      code: 'invalid_response',
      message: 'Brak changedBlocks (wymagane w v2)',
      detail: {
        mode: input.mode,
        functionName: input.functionName,
        errorType: 'invalid_response',
        message: 'Brak changedBlocks (wymagane w v2)',
        rawResponse: JSON.stringify(body).slice(0, 2000),
      },
    },
  )
}

export function runFullAiRewrite(input: {
  runId: string
  documentBlocks: TransformDocumentBlock[]
  transformationDataset: ContractTransformationDataset
  protectedDataSummary: { exactCount: number; patternCount: number }
  requiredReplacements?: unknown
  invoke?: TransformFunctionsInvoke
}): Promise<TransformApiResult> {
  return invokeTransform({
    functionName: 'ai-contract-full-rewrite',
    mode: 'full_ai_trusted_rewrite',
    promptVersion: FULL_AI_PROMPT_VERSION,
    ...input,
  })
}

export function runGuardedAiTransform(input: {
  runId: string
  documentBlocks: TransformDocumentBlock[]
  transformationDataset: ContractTransformationDataset
  protectedDataSummary: { exactCount: number; patternCount: number }
  requiredReplacements?: unknown
  invoke?: TransformFunctionsInvoke
}): Promise<TransformApiResult> {
  return invokeTransform({
    functionName: 'ai-contract-guarded-transform',
    mode: 'guarded_ai_transform',
    promptVersion: GUARDED_AI_PROMPT_VERSION,
    ...input,
  })
}

/** Offline / test helper — apply a local transform result without edge. */
export function validateResponseVersions(mode: TransformMode, version: string): boolean {
  if (mode === 'full_ai_trusted_rewrite') {
    return version === FULL_AI_RESPONSE_VERSION
  }
  return version === GUARDED_AI_RESPONSE_VERSION
}
