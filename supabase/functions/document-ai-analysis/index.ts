import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { DOCUMENT_AI_EDGE_CONFIG } from './config.ts'
import { buildDocumentAnalysisPrompt } from './DocumentAnalysisPrompt.ts'
import {
  callOpenAiResponsesJson,
  ProviderError,
} from './openaiClient.ts'
import {
  createRequestTimer,
  estimateTokenCount,
} from './timing.ts'
import {
  parseAnalysisJsonText,
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

function providerErrorResponse(err: ProviderError): Response {
  const p = err.payload
  const httpStatus =
    p.httpStatus != null && p.httpStatus >= 400 && p.httpStatus < 600
      ? p.httpStatus
      : p.code === 'provider_timeout'
        ? 504
        : p.code === 'provider_rate_limit'
          ? 429
          : p.code === 'unauthorized'
            ? 401
            : p.code === 'bad_request'
              ? 400
              : 502

  return errorResponse(p.code, p.message, httpStatus)
}

function statusForCode(code: EdgeErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401
    case 'bad_request':
      return 400
    case 'provider_rate_limit':
      return 429
    case 'provider_timeout':
      return 504
    case 'invalid_json':
    case 'validation_failed':
      return 422
    case 'empty_response':
    case 'provider_unavailable':
      return 502
    default:
      return 502
  }
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

  const timer = createRequestTimer()
  timer.log('Request received', { method: req.method })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('unauthorized', 'Missing Authorization', 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse(
        'provider_unavailable',
        'Server misconfigured',
        500,
      )
    }

    const authStarted = performance.now()
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    timer.logStepDuration('Auth getUser', authStarted)
    if (authError || !user) {
      return errorResponse('unauthorized', 'Unauthorized', 401)
    }

    let body: Record<string, unknown>
    try {
      const parseBodyStarted = performance.now()
      body = (await req.json()) as Record<string, unknown>
      timer.logStepDuration('Parse request body', parseBodyStarted)
    } catch {
      return errorResponse('bad_request', 'Invalid JSON body', 400)
    }

    const rawText = typeof body.text === 'string' ? body.text : ''
    const text =
      rawText.length > DOCUMENT_AI_EDGE_CONFIG.maxTextChars
        ? rawText.slice(0, DOCUMENT_AI_EDGE_CONFIG.maxTextChars)
        : rawText

    timer.log('Request validation', {
      documentTextLength: text.length,
      estimatedDocumentTokens: estimateTokenCount(text.length),
      truncated: rawText.length > text.length,
    })

    const contentHash =
      typeof body.contentHash === 'string' && body.contentHash.trim()
        ? body.contentHash.trim()
        : null

    if (contentHash) {
      const cacheKey = `${DOCUMENT_AI_EDGE_CONFIG.schemaVersion}:${contentHash}`
      const hit = memoryCache.get(cacheKey)
      if (hit) {
        timer.log('Response returned', { fromCache: true })
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

    const promptStarted = performance.now()
    const prompt = buildDocumentAnalysisPrompt({
      schemaVersion,
      promptVersion,
    })
    timer.logStepDuration('Prompt creation', promptStarted, {
      promptLength: prompt.length,
      estimatedPromptTokens: estimateTokenCount(prompt.length),
      documentTextLength: text.length,
      estimatedDocumentTokens: estimateTokenCount(text.length),
      estimatedTotalInputTokens: estimateTokenCount(
        prompt.length + text.length,
      ),
    })

    const meta = {
      schemaVersion,
      promptVersion,
      model: DOCUMENT_AI_EDGE_CONFIG.model,
    }

    async function analyzeOnce(): Promise<Record<string, unknown>> {
      const documentText = text.length === 0 ? '(empty document)' : text
      const openaiResult = await callOpenAiResponsesJson({
        prompt,
        documentText,
        timer,
      })

      // Temporary debug path: expose exact OpenAI payload (no empty_response).
      if ('debugEmpty' in openaiResult && openaiResult.debugEmpty) {
        const err = new Error('openai_debug_empty') as Error & {
          code: 'openai_debug_empty'
          debug: unknown
        }
        err.code = 'openai_debug_empty'
        err.debug = openaiResult.responseJson
        throw err
      }

      const providerText = openaiResult.text

      const parseStarted = performance.now()
      let parsed: unknown
      try {
        parsed = parseAnalysisJsonText(providerText)
        timer.logStepDuration('JSON parsing', parseStarted, {
          responseLength: providerText.length,
          estimatedResponseTokens: estimateTokenCount(providerText.length),
        })
      } catch {
        timer.logStepDuration('JSON parsing (failed)', parseStarted, {
          responseLength: providerText.length,
        })
        const err = new Error('invalid_json') as Error & { code: EdgeErrorCode }
        err.code = 'invalid_json'
        throw err
      }

      const validateStarted = performance.now()
      try {
        const validated = validateAndNormalizeAnalysis(parsed, new Set(), meta)
        timer.logStepDuration(
          'Schema validation / normalizeAnalysisPayload',
          validateStarted,
          {
            coupleCount: validated.coupleVariables.length,
            studioCount: validated.studioVariables.length,
            packageCount: validated.packageVariables.length,
            possibleCount: validated.possibleVariables.length,
          },
        )
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
        timer.logStepDuration(
          'Schema validation / normalizeAnalysisPayload (failed)',
          validateStarted,
        )
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
      if (
        first &&
        typeof first === 'object' &&
        (first as { code?: string }).code === 'openai_debug_empty'
      ) {
        timer.log('Response returned', {
          ok: false,
          code: 'openai_debug_empty',
        })
        return jsonResponse({
          ok: false,
          debug: (first as { debug: unknown }).debug,
        })
      }

      if (first instanceof ProviderError) {
        timer.log('Response returned', {
          ok: false,
          code: first.payload.code,
        })
        return providerErrorResponse(first)
      }

      const code = (first as { code?: EdgeErrorCode }).code
      if (code === 'invalid_json' || code === 'validation_failed') {
        timer.log('Retry analyzeOnce', { reason: code })
        try {
          analysis = await analyzeOnce()
        } catch (second) {
          if (
            second &&
            typeof second === 'object' &&
            (second as { code?: string }).code === 'openai_debug_empty'
          ) {
            timer.log('Response returned', {
              ok: false,
              code: 'openai_debug_empty',
            })
            return jsonResponse({
              ok: false,
              debug: (second as { debug: unknown }).debug,
            })
          }
          if (second instanceof ProviderError) {
            timer.log('Response returned', {
              ok: false,
              code: second.payload.code,
            })
            return providerErrorResponse(second)
          }
          const code2 =
            (second as { code?: EdgeErrorCode }).code ?? 'unknown'
          timer.log('Response returned', { ok: false, code: code2 })
          return errorResponse(
            code2,
            'Analysis failed after retry',
            statusForCode(code2),
          )
        }
      } else {
        timer.log('Response returned', {
          ok: false,
          code: code ?? 'provider_unavailable',
        })
        return errorResponse(
          code ?? 'provider_unavailable',
          'Analysis request failed',
          statusForCode(code ?? 'provider_unavailable'),
        )
      }
    }

    if (contentHash) {
      memoryCache.set(`${DOCUMENT_AI_EDGE_CONFIG.schemaVersion}:${contentHash}`, {
        analysis,
        storedAt: Date.now(),
      })
    }

    timer.log('Response returned', {
      ok: true,
      fromCache: false,
      coupleCount: Array.isArray(analysis.coupleVariables)
        ? analysis.coupleVariables.length
        : undefined,
      studioCount: Array.isArray(analysis.studioVariables)
        ? analysis.studioVariables.length
        : undefined,
      packageCount: Array.isArray(analysis.packageVariables)
        ? analysis.packageVariables.length
        : undefined,
      possibleCount: Array.isArray(analysis.possibleVariables)
        ? analysis.possibleVariables.length
        : undefined,
    })
    return jsonResponse({ ok: true, fromCache: false, analysis })
  } catch (e) {
    if (e instanceof ProviderError) {
      timer.log('Response returned', {
        ok: false,
        code: e.payload.code,
      })
      return providerErrorResponse(e)
    }
    console.error('[document-ai] unexpected error', e)
    timer.log('Response returned', { ok: false, code: 'unknown' })
    return errorResponse('unknown', 'Unexpected server error', 500)
  }
})
