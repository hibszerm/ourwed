/**
 * Live structured mapping — browser calls Supabase Edge Function only.
 * Never import OpenAI SDK or API keys here.
 */

import { supabase } from '@/lib/supabase'
import {
  EXPERIMENT_FIELD_REGISTRY,
  EXPERIMENT_IMMUTABLE_CONCEPTS,
} from './fieldRegistry'
import { parseStructuredMappingResponse } from './structuredMappingSchema'
import type {
  AiMappingApiErrorCode,
  IndexedDocxBlock,
  MappingGenerationContext,
  StructuredAiMappingResponse,
  StructuredMappingDiagnostics,
  StructuredMappingMetadata,
} from './types'

export type StructuredMappingApiRequest = {
  experimentRunId: string
  package: { id: string; name: string }
  document: { fileName: string; blocks: IndexedDocxBlock[] }
  generationContext: MappingGenerationContext
}

export type LiveStructuredMappingResult =
  | {
      ok: true
      response: StructuredAiMappingResponse
      metadata: StructuredMappingMetadata
      diagnostics: StructuredMappingDiagnostics
    }
  | {
      ok: false
      error: {
        code: AiMappingApiErrorCode
        message: string
        retryable: boolean
      }
    }

const ERROR_MESSAGES: Record<AiMappingApiErrorCode, string> = {
  not_configured: 'Analiza AI nie jest skonfigurowana.',
  authentication_failed: 'Autoryzacja OpenAI nie powiodła się.',
  model_unavailable: 'Wybrany model OpenAI jest niedostępny.',
  rate_limited: 'Limit zapytań OpenAI został wyczerpany. Spróbuj ponownie za chwilę.',
  timeout: 'Analiza trwała zbyt długo. Spróbuj ponownie.',
  invalid_structured_output: 'Odpowiedź OpenAI nie przeszła walidacji struktury.',
  missing_structured_output:
    'OpenAI nie zwróciło strukturyzowanej odpowiedzi.',
  incomplete_response:
    'Analiza OpenAI zakończyła się przed wygenerowaniem pełnej odpowiedzi.',
  refused: 'Model odmówił analizy dokumentu.',
  document_too_large:
    'Dokument jest zbyt duży do jednorazowej analizy. Użyj krótszego wzoru albo podziel analizę.',
  request_failed: 'Analiza AI nie powiodła się. Oryginalny dokument nie został zmieniony.',
}

function slimBlock(block: IndexedDocxBlock) {
  const base = {
    id: block.id,
    kind: block.kind,
    text: block.text,
    paragraphIndex: block.paragraphIndex,
  }
  if (block.kind === 'tableCell') {
    return {
      ...base,
      tableIndex: block.tableIndex,
      rowIndex: block.rowIndex,
      cellIndex: block.cellIndex,
      rowTexts: block.rowTexts,
      headerTexts: block.headerTexts,
    }
  }
  return base
}

function buildSanitizedRequest(
  input: StructuredMappingApiRequest,
): Record<string, unknown> {
  return {
    experimentRunId: input.experimentRunId,
    package: { id: input.package.id, name: input.package.name },
    document: {
      fileName: input.document.fileName,
      blockCount: input.document.blocks.length,
      blocks: input.document.blocks.map(slimBlock),
    },
    registry: {
      allowedDynamicFields: EXPERIMENT_FIELD_REGISTRY.map((f) => f.key),
      immutableConceptKeys: EXPERIMENT_IMMUTABLE_CONCEPTS.map((c) => c.key),
    },
    generationContext: {
      expectedClientCount: input.generationContext.expectedClientCount,
      availableWeddingFields: input.generationContext.availableWeddingFields,
      universallyRequiredTemplateFields:
        input.generationContext.universallyRequiredTemplateFields,
      sourceConditionalFields: input.generationContext.sourceConditionalFields,
    },
  }
}

function readError(data: unknown): {
  code: AiMappingApiErrorCode
  message: string
  retryable: boolean
} | null {
  if (!data || typeof data !== 'object') return null
  const body = data as {
    ok?: boolean
    error?: { code?: string; message?: string; retryable?: boolean }
  }
  if (body.ok === false && body.error) {
    const code = (body.error.code ?? 'request_failed') as AiMappingApiErrorCode
    return {
      code,
      message:
        body.error.message ||
        ERROR_MESSAGES[code] ||
        ERROR_MESSAGES.request_failed,
      retryable: Boolean(body.error.retryable),
    }
  }
  return null
}

export async function runLiveStructuredMapping(
  input: StructuredMappingApiRequest,
): Promise<LiveStructuredMappingResult> {
  const sanitizedRequest = buildSanitizedRequest(input)

  const { data, error } = await supabase.functions.invoke(
    'ai-contract-lab-structured-mapping',
    {
      body: {
        experimentRunId: input.experimentRunId,
        package: input.package,
        document: {
          fileName: input.document.fileName,
          blocks: input.document.blocks.map(slimBlock),
        },
        registry: {
          allowedDynamicFields: EXPERIMENT_FIELD_REGISTRY,
          immutableConcepts: EXPERIMENT_IMMUTABLE_CONCEPTS,
        },
        generationContext: input.generationContext,
      },
    },
  )

  if (error) {
    const payload = readError(data)
    if (payload) {
      return { ok: false, error: payload }
    }
    return {
      ok: false,
      error: {
        code: 'request_failed',
        message: ERROR_MESSAGES.request_failed,
        retryable: true,
      },
    }
  }

  const err = readError(data)
  if (err) return { ok: false, error: err }

  const body = data as {
    ok?: boolean
    mapping?: unknown
    metadata?: StructuredMappingMetadata
    diagnostics?: StructuredMappingDiagnostics
  }

  if (!body?.ok || !body.mapping) {
    return {
      ok: false,
      error: {
        code: 'invalid_structured_output',
        message: ERROR_MESSAGES.invalid_structured_output,
        retryable: false,
      },
    }
  }

  const parsed = parseStructuredMappingResponse(
    body.mapping,
    input.document.blocks,
  )
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: 'invalid_structured_output',
        message: `${ERROR_MESSAGES.invalid_structured_output} (${parsed.reason})`,
        retryable: false,
      },
    }
  }

  const metadata: StructuredMappingMetadata = {
    model: body.metadata?.model ?? 'unknown',
    requestCount: body.metadata?.requestCount ?? 1,
    inputTokens: body.metadata?.inputTokens,
    outputTokens: body.metadata?.outputTokens,
    durationMs: body.metadata?.durationMs ?? 0,
    responseId: body.metadata?.responseId ?? null,
    promptVersion: body.metadata?.promptVersion ?? 'unknown',
  }

  const diagnostics: StructuredMappingDiagnostics = {
    promptVersion: body.diagnostics?.promptVersion ?? metadata.promptVersion,
    responseVersion:
      parsed.response.responseVersion ??
      (body.diagnostics as { responseVersion?: string } | undefined)?.responseVersion,
    systemPrompt: body.diagnostics?.systemPrompt ?? '',
    taskPayload: body.diagnostics?.taskPayload ?? null,
    sanitizedRequest,
  }

  return {
    ok: true,
    response: parsed.response,
    metadata,
    diagnostics,
  }
}

export { availableWeddingFieldKeys } from './mappingGenerationContext'
