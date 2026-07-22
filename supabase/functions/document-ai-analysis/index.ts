import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { DOCUMENT_AI_EDGE_CONFIG } from './config.ts'
import { buildGeminiDocumentAnalysisPrompt } from './GeminiDocumentAnalysisPrompt.ts'
import {
  callGeminiGenerateJson,
  GeminiProviderError,
} from './geminiClient.ts'
import {
  parseGeminiJsonText,
  validateAndNormalizeAnalysis,
  type EdgeErrorCode,
} from './validate.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(
  code: EdgeErrorCode,
  message: string,
  status: number,
): Response {
  return jsonResponse({ ok: false, error: { code, message } }, status)
}

/** Preserve original Google error details for diagnostics. */
function geminiErrorResponse(err: GeminiProviderError): Response {
  const p = err.payload
  const httpStatus =
    p.httpStatus != null && p.httpStatus >= 400 && p.httpStatus < 600
      ? p.httpStatus
      : p.internalCode === 'timeout'
        ? 504
        : p.internalCode === 'gemini_rate_limit'
          ? 429
          : 502

  return jsonResponse(
    {
      ok: false,
      error: {
        provider: p.provider,
        httpStatus: p.httpStatus,
        googleCode: p.googleCode,
        googleMessage: p.googleMessage,
        internalCode: p.internalCode,
        model: p.model,
        requestUrl: p.requestUrl,
        // Temporary debug: include Google body + exact request when present
        googleBody: p.googleBody ?? null,
        debugRequest: p.debugRequest ?? null,
      },
    },
    httpStatus,
  )
}

const memoryCache = new Map<
  string,
  { analysis: Record<string, unknown>; storedAt: number }
>()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('bad_request', 'Method not allowed', 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('unauthorized', 'Missing Authorization', 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse(
        'gemini_unavailable',
        'Server misconfigured',
        500,
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('unauthorized', 'Unauthorized', 401)
    }

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return errorResponse('bad_request', 'Invalid JSON body', 400)
    }

    const rawText = typeof body.text === 'string' ? body.text : ''
    const text =
      rawText.length > DOCUMENT_AI_EDGE_CONFIG.maxTextChars
        ? rawText.slice(0, DOCUMENT_AI_EDGE_CONFIG.maxTextChars)
        : rawText

    const registryKeys = Array.isArray(body.registryKeys)
      ? body.registryKeys.filter((k): k is string => typeof k === 'string')
      : []
    if (registryKeys.length === 0) {
      return errorResponse(
        'bad_request',
        'registryKeys required',
        400,
      )
    }

    const contentHash =
      typeof body.contentHash === 'string' && body.contentHash.trim()
        ? body.contentHash.trim()
        : null

    if (contentHash) {
      const hit = memoryCache.get(contentHash)
      if (hit) {
        return jsonResponse({
          ok: true,
          fromCache: true,
          analysis: {
            ...hit.analysis,
            analyzedAt: new Date().toISOString(),
            sourceTextLength: text.length,
            contentHash,
            analyzerId: DOCUMENT_AI_EDGE_CONFIG.analyzerId,
            analyzerVersion: DOCUMENT_AI_EDGE_CONFIG.analyzerVersion,
            fromCache: true,
          },
        })
      }
    }

    const schemaVersion =
      typeof body.schemaVersion === 'string'
        ? body.schemaVersion
        : DOCUMENT_AI_EDGE_CONFIG.schemaVersion
    const promptVersion =
      typeof body.promptVersion === 'string'
        ? body.promptVersion
        : DOCUMENT_AI_EDGE_CONFIG.promptVersion

    const prompt = buildGeminiDocumentAnalysisPrompt({
      registryKeys,
      schemaVersion,
      promptVersion,
    })

    const allowed = new Set(registryKeys)
    const meta = {
      schemaVersion,
      promptVersion,
      model: DOCUMENT_AI_EDGE_CONFIG.model,
    }

    async function analyzeOnce(): Promise<Record<string, unknown>> {
      const { text: geminiText } = await callGeminiGenerateJson({
        prompt,
        documentText: text.length === 0 ? '(empty document)' : text,
      })
      let parsed: unknown
      try {
        parsed = parseGeminiJsonText(geminiText)
      } catch {
        const err = new Error('invalid_json') as Error & { code: EdgeErrorCode }
        err.code = 'invalid_json'
        throw err
      }
      try {
        const validated = validateAndNormalizeAnalysis(parsed, allowed, meta)
        return {
          ...validated,
          analyzerId: DOCUMENT_AI_EDGE_CONFIG.analyzerId,
          analyzerVersion: DOCUMENT_AI_EDGE_CONFIG.analyzerVersion,
          analyzedAt: new Date().toISOString(),
          sourceTextLength: text.length,
          contentHash: contentHash ?? undefined,
          fromCache: false,
        }
      } catch {
        const err = new Error('validation_failed') as Error & {
          code: EdgeErrorCode
        }
        err.code = 'validation_failed'
        throw err
      }
    }

    let analysis: Record<string, unknown>
    try {
      analysis = await analyzeOnce()
    } catch (first) {
      if (first instanceof GeminiProviderError) {
        return geminiErrorResponse(first)
      }

      const code = (first as { code?: EdgeErrorCode }).code
      // Retry once for parse/validation failures only
      if (code === 'invalid_json' || code === 'validation_failed') {
        try {
          analysis = await analyzeOnce()
        } catch (second) {
          if (second instanceof GeminiProviderError) {
            return geminiErrorResponse(second)
          }
          const code2 =
            (second as { code?: EdgeErrorCode }).code ?? 'unknown'
          const status =
            code2 === 'rate_limit'
              ? 429
              : code2 === 'timeout'
                ? 504
                : code2 === 'invalid_json' || code2 === 'validation_failed'
                  ? 422
                  : 502
          return errorResponse(
            code2,
            'Analysis failed after retry',
            status,
          )
        }
      } else {
        const status =
          code === 'rate_limit'
            ? 429
            : code === 'timeout'
              ? 504
              : code === 'empty_response'
                ? 502
                : 502
        return errorResponse(
          code ?? 'gemini_unavailable',
          'Gemini request failed',
          status,
        )
      }
    }

    if (contentHash) {
      memoryCache.set(contentHash, {
        analysis,
        storedAt: Date.now(),
      })
    }

    return jsonResponse({ ok: true, fromCache: false, analysis })
  } catch (e) {
    if (e instanceof GeminiProviderError) {
      return geminiErrorResponse(e)
    }
    console.error('document-ai-analysis error', e)
    return errorResponse('unknown', 'Unexpected server error', 500)
  }
})
