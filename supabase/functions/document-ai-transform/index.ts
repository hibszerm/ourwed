import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { DOCUMENT_TRANSFORM_EDGE_CONFIG } from './config.ts'
import {
  buildContractTransformPrompt,
  buildContractTransformUserPayload,
  CONTRACT_TRANSFORM_PROMPT_VERSION,
} from './ContractTransformPrompt.ts'
import { callOpenAiTransformJson, ProviderError } from './openaiClient.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type EdgeErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_rate_limit'
  | 'invalid_json'
  | 'validation_failed'
  | 'empty_response'

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

function parseParagraphs(raw: unknown): Array<{ index: number; text: string }> | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const list = Array.isArray(obj.paragraphs) ? obj.paragraphs : null
  if (!list) return null
  const out: Array<{ index: number; text: string }> = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const index = typeof row.index === 'number' ? row.index : Number(row.index)
    if (!Number.isFinite(index)) continue
    const text = typeof row.text === 'string' ? row.text : ''
    out.push({ index: Math.floor(index), text })
  }
  return out
}

function validateAgainstOriginal(
  original: Array<{ index: number; text: string }>,
  transformed: Array<{ index: number; text: string }>,
): string | null {
  if (transformed.length !== original.length) {
    return `paragraph count mismatch: expected ${original.length}, got ${transformed.length}`
  }
  for (let i = 0; i < original.length; i++) {
    const o = original[i]!
    const t = transformed[i]!
    if (t.index !== o.index) {
      return `paragraph index mismatch at position ${i}`
    }
    if (!o.text.trim() && t.text.trim()) {
      return `empty paragraph ${o.index} was expanded`
    }
  }
  return null
}

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
      return errorResponse('provider_unavailable', 'Server misconfigured', 500)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('unauthorized', 'Invalid session', 401)
    }

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return errorResponse('bad_request', 'Invalid JSON body', 400)
    }

    const original = parseParagraphs({ paragraphs: body.paragraphs })
    if (!original || original.length === 0) {
      return errorResponse('bad_request', 'paragraphs required', 400)
    }

    const variables =
      body.variables && typeof body.variables === 'object'
        ? (body.variables as Record<string, Record<string, string>>)
        : {}
    const omittedKeys = Array.isArray(body.omittedKeys)
      ? body.omittedKeys.filter((k): k is string => typeof k === 'string')
      : []
    const retryNote =
      typeof body.retryNote === 'string' ? body.retryNote : undefined

    let joinedLen = 0
    for (const p of original) joinedLen += p.text.length
    if (joinedLen > DOCUMENT_TRANSFORM_EDGE_CONFIG.maxTextChars) {
      return errorResponse('bad_request', 'Document too large', 400)
    }

    const systemPrompt = buildContractTransformPrompt()
    const userPayload = buildContractTransformUserPayload({
      paragraphs: original,
      variables,
      omittedKeys,
      retryNote,
    })

    const outcome = await callOpenAiTransformJson({
      systemPrompt,
      userPayload,
    })

    let parsed: unknown
    try {
      parsed = JSON.parse(outcome.text)
    } catch {
      return errorResponse('invalid_json', 'Model returned invalid JSON', 422)
    }

    const transformed = parseParagraphs(parsed)
    if (!transformed) {
      return errorResponse(
        'validation_failed',
        'Model JSON missing paragraphs',
        422,
      )
    }

    // Align by sorting on index then re-check length
    transformed.sort((a, b) => a.index - b.index)
    const validationError = validateAgainstOriginal(original, transformed)
    if (validationError) {
      return errorResponse('validation_failed', validationError, 422)
    }

    return jsonResponse({
      ok: true,
      paragraphs: transformed,
      meta: {
        promptVersion: CONTRACT_TRANSFORM_PROMPT_VERSION,
        schemaVersion: DOCUMENT_TRANSFORM_EDGE_CONFIG.schemaVersion,
        model: DOCUMENT_TRANSFORM_EDGE_CONFIG.model,
      },
    })
  } catch (err) {
    if (err instanceof ProviderError) {
      return providerErrorResponse(err)
    }
    console.error('[document-ai-transform]', err)
    return errorResponse(
      'provider_unavailable',
      'Unexpected transformation failure',
      502,
    )
  }
})
