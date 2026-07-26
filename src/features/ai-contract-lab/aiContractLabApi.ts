import { supabase } from '@/lib/supabase'
import type { DocumentSemanticMap } from '@/features/ai-contract-lab/aiContractLabTypes'
import {
  mapLabAnalyzeErrorMessage,
  validateAiPayloadSize,
} from '@/features/ai-contract-lab/aiContractLabPayload'
import type { PhaseAValidationStats } from '@/features/ai-contract-lab/phaseAValidateSemanticMap'
import {
  AiContractLabApiError,
  formatPhaseAErrorDetails,
  type AiContractLabAnalyzeError,
} from '@/features/ai-contract-lab/aiContractLabErrors'

export type { AiContractLabAnalyzeError }
export { AiContractLabApiError, formatPhaseAErrorDetails }

export type AiContractLabAnalyzeResponse =
  | {
      ok: true
      semanticMap: DocumentSemanticMap
      stats?: PhaseAValidationStats
      requestId?: string
    }
  | { ok: false; error: AiContractLabAnalyzeError }

function readErrorPayload(data: unknown): AiContractLabAnalyzeError | null {
  if (!data || typeof data !== 'object') return null
  const body = data as { ok?: boolean; error?: AiContractLabAnalyzeError }
  if (body.ok === false && body.error && typeof body.error === 'object') {
    return body.error
  }
  return null
}

/**
 * Client → Supabase Edge Function only. Never call OpenAI from the browser.
 * Phase A: returns document semantic map (no wedding field mapping).
 */
export async function analyzeContractLabDocument(input: {
  sessionId: string
  weddingId: string
  sourceHash: string
  textAnchors: unknown
  fieldCatalog: unknown
}): Promise<AiContractLabAnalyzeResponse> {
  if (Array.isArray(input.textAnchors) && Array.isArray(input.fieldCatalog)) {
    const gate = validateAiPayloadSize({
      textAnchors: input.textAnchors as never,
      fieldCatalog: input.fieldCatalog as never,
      schemaJson: '{}',
    })
    if (!gate.ok) {
      const mapped = mapLabAnalyzeErrorMessage('document_too_large')
      return {
        ok: false,
        error: {
          code: 'document_too_large',
          stage: 'validate_request',
          message: mapped.message,
          retryable: false,
          status: 413,
        },
      }
    }
  }

  const { data, error } = await supabase.functions.invoke(
    'ai-contract-lab-analyze',
    {
      body: {
        sessionId: input.sessionId,
        weddingId: input.weddingId,
        sourceHash: input.sourceHash,
        textAnchors: input.textAnchors,
        fieldCatalog: input.fieldCatalog,
        analysisVersion: '2.0.0',
      },
    },
  )

  if (error) {
    const payload = readErrorPayload(data)
    if (payload) {
      const mapped = mapLabAnalyzeErrorMessage(payload.code)
      return {
        ok: false,
        error: {
          code: payload.code,
          stage: payload.stage,
          message: payload.message || mapped.message,
          analysisVersion: payload.analysisVersion,
          issueCount: payload.issueCount ?? payload.issues?.length ?? 0,
          issues: payload.issues ?? [],
          stats: payload.stats,
          retryable: payload.retryable ?? mapped.retryable,
          status: 422,
        },
      }
    }
    const ctx = (error as { context?: Response }).context
    const status = ctx?.status ?? 0
    const mapped = mapLabAnalyzeErrorMessage(
      status === 422 ? 'validation_failed' : 'provider_error',
    )
    return {
      ok: false,
      error: {
        code: status === 422 ? 'semantic_map_invalid' : 'network_error',
        stage: status === 422 ? 'validate_provider_output' : 'provider_request',
        message: mapped.message,
        retryable: true,
        status: status || undefined,
        issues: [],
      },
    }
  }

  const body = data as
    | {
        ok: true
        semanticMap?: DocumentSemanticMap
        analysis?: DocumentSemanticMap
        stats?: PhaseAValidationStats
        requestId?: string
      }
    | { ok: false; error: AiContractLabAnalyzeError }
    | null

  if (!body || typeof body !== 'object') {
    const mapped = mapLabAnalyzeErrorMessage('invalid_provider_output')
    return {
      ok: false,
      error: {
        code: 'provider_output_not_json',
        stage: 'parse_provider_json',
        message: mapped.message,
        retryable: true,
      },
    }
  }

  if (!body.ok) {
    const mapped = mapLabAnalyzeErrorMessage(body.error?.code ?? 'provider_error')
    return {
      ok: false,
      error: {
        code: body.error?.code ?? 'analysis_failed',
        stage: body.error?.stage,
        message: body.error?.message || mapped.message,
        analysisVersion: body.error?.analysisVersion,
        issueCount: body.error?.issueCount ?? body.error?.issues?.length ?? 0,
        issues: body.error?.issues ?? [],
        stats: body.error?.stats,
        retryable: body.error?.retryable ?? mapped.retryable,
        status: 422,
      },
    }
  }

  const semanticMap = body.semanticMap ?? body.analysis
  if (!semanticMap || typeof semanticMap !== 'object') {
    const mapped = mapLabAnalyzeErrorMessage('invalid_provider_output')
    return {
      ok: false,
      error: {
        code: 'provider_schema_mismatch',
        stage: 'validate_provider_output',
        message: mapped.message,
        retryable: true,
      },
    }
  }

  return {
    ok: true,
    semanticMap: {
      ...semanticMap,
      warnings: semanticMap.warnings ?? [],
      semanticAnchors: semanticMap.semanticAnchors ?? [],
      unresolved: semanticMap.unresolved ?? [],
    },
    stats: body.stats,
    requestId: body.requestId,
  }
}

export function labStoragePath(
  userId: string,
  sessionId: string,
  kind: 'source' | 'generated',
): string {
  return `${userId}/ai-contract-lab/${sessionId}/${kind}.docx`
}
