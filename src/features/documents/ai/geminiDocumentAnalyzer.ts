/**
 * Production Gemini analyzer — calls Supabase Edge Function only.
 * Never talks to Google from the browser; never sees the API key.
 */

import { FunctionsHttpError } from '@supabase/supabase-js'
import { DOCUMENT_VARIABLES } from '@/features/documents/registry/variableRegistry'
import { supabase } from '@/lib/supabase'
import type { DocumentAnalyzer } from './analyzer'
import { activeDocumentAnalysisCache } from './cache'
import { DOCUMENT_AI_CONFIG } from './config'
import {
  DocumentAiAnalysisError,
  documentAiErrorFromPayload,
  mapHttpStatusToErrorCode,
} from './errors'
import { hashDocumentText } from './hash'
import { normalizeAnalysisPayload } from './normalizeAnalysisResult'
import type {
  AiDocumentAnalysisResult,
  DocumentAiErrorPayload,
} from './types'

/** TEMP diagnostic logging — remove after Phase 5 failure diagnosis. */
const AI_DEBUG = '[document-ai]'

function aiLog(...args: unknown[]) {
  console.info(AI_DEBUG, ...args)
}

function aiWarn(...args: unknown[]) {
  console.warn(AI_DEBUG, ...args)
}

interface EdgeSuccessBody {
  ok: true
  analysis: unknown
  fromCache?: boolean
}

interface EdgeErrorBody {
  ok: false
  error: DocumentAiErrorPayload
}

type EdgeBody = EdgeSuccessBody | EdgeErrorBody | Record<string, unknown>

function isEdgeError(body: unknown): body is EdgeErrorBody {
  return (
    body != null &&
    typeof body === 'object' &&
    'ok' in body &&
    (body as { ok: unknown }).ok === false &&
    'error' in body
  )
}

function isEdgeSuccess(body: unknown): body is EdgeSuccessBody {
  return (
    body != null &&
    typeof body === 'object' &&
    'ok' in body &&
    (body as { ok: unknown }).ok === true &&
    'analysis' in body
  )
}

async function readHttpErrorBody(
  error: unknown,
): Promise<EdgeBody | null> {
  if (!(error instanceof FunctionsHttpError)) return null
  const ctx = error.context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    return (await ctx.json()) as EdgeBody
  } catch {
    return null
  }
}

export const geminiDocumentAnalyzer: DocumentAnalyzer = {
  id: DOCUMENT_AI_CONFIG.analyzerId,
  version: DOCUMENT_AI_CONFIG.analyzerVersion,

  async analyze(input): Promise<AiDocumentAnalysisResult> {
    const fullText = input.text ?? ''
    const text =
      fullText.length > DOCUMENT_AI_CONFIG.maxTextChars
        ? fullText.slice(0, DOCUMENT_AI_CONFIG.maxTextChars)
        : fullText

    const contentHash = await hashDocumentText(text)
    aiLog('analyze start', {
      analyzer: this.id,
      edgeFunction: DOCUMENT_AI_CONFIG.edgeFunctionName,
      textLength: text.length,
      contentHash,
      useMockEnv: import.meta.env.VITE_DOCUMENT_AI_USE_MOCK === 'true',
    })

    const cached = await activeDocumentAnalysisCache.get(contentHash)
    if (cached) {
      aiLog('cache hit — skipping Edge Function', { contentHash })
      return {
        ...cached,
        sourceTextLength: text.length,
        contentHash,
        fromCache: true,
      }
    }

    const registryKeys = DOCUMENT_VARIABLES.map((v) => v.key)
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      DOCUMENT_AI_CONFIG.clientTimeoutMs,
    )

    let data: unknown = null
    let error: unknown = null

    try {
      aiLog('invoking Edge Function…')
      const result = await supabase.functions.invoke(
        DOCUMENT_AI_CONFIG.edgeFunctionName,
        {
          body: {
            text,
            contentHash,
            registryKeys,
            schemaVersion: DOCUMENT_AI_CONFIG.schemaVersion,
            promptVersion: DOCUMENT_AI_CONFIG.promptVersion,
            structure: input.structure
              ? {
                  blockCount: input.structure.blocks?.length ?? 0,
                  plainTextLength: text.length,
                }
              : undefined,
          },
          signal: controller.signal,
        },
      )
      data = result.data
      error = result.error
      aiLog('invoke returned', {
        hasData: data != null,
        hasError: error != null,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : error,
        httpStatus:
          error instanceof FunctionsHttpError
            ? error.context?.status
            : undefined,
        dataPreview:
          data && typeof data === 'object'
            ? {
                ok: (data as { ok?: unknown }).ok,
                keys: Object.keys(data as object),
              }
            : data,
      })
    } catch (err) {
      aiWarn('invoke threw', err)
      if (
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && /abort/i.test(err.message))
      ) {
        throw new DocumentAiAnalysisError('timeout')
      }
      throw err
    } finally {
      clearTimeout(timer)
    }

    if (error) {
      const body = (await readHttpErrorBody(error)) ?? data
      aiWarn('Edge Function error path', {
        body,
        mappedStatus:
          error instanceof FunctionsHttpError
            ? error.context?.status
            : undefined,
      })
      if (isEdgeError(body)) {
        throw documentAiErrorFromPayload(body.error)
      }
      const status =
        error instanceof FunctionsHttpError &&
        typeof error.context?.status === 'number'
          ? error.context.status
          : 0
      const code = mapHttpStatusToErrorCode(status)
      aiWarn('mapping HTTP status to DocumentAiAnalysisError', {
        status,
        code,
        note:
          status === 404
            ? 'Function not deployed (NOT_FOUND) — never reached Gemini'
            : undefined,
      })
      throw new DocumentAiAnalysisError(code)
    }

    if (!isEdgeSuccess(data) || data.analysis == null) {
      if (isEdgeError(data)) {
        aiWarn('structured Edge error in data', data.error)
        throw documentAiErrorFromPayload(data.error)
      }
      aiWarn('empty / unexpected success payload', data)
      throw new DocumentAiAnalysisError('empty_response')
    }

    let normalized: AiDocumentAnalysisResult
    try {
      normalized = normalizeAnalysisPayload(data.analysis, {
        sourceTextLength: text.length,
        contentHash,
        fromCache: Boolean(data.fromCache),
      })
      aiLog('normalizeAnalysisPayload OK', {
        fieldCount: normalized.fields.length,
        documentType: normalized.documentType,
      })
    } catch (normErr) {
      aiWarn('normalizeAnalysisPayload REJECTED', normErr, data.analysis)
      throw new DocumentAiAnalysisError('validation_failed')
    }

    await activeDocumentAnalysisCache.set(contentHash, normalized)
    return normalized
  },
}
