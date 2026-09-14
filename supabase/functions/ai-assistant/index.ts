/**
 * OurWed Assistant Edge — language → AssistantSemanticRequest only.
 * No CRM tools. No service_role. No identity args.
 * Browser runs the common orchestrator + allowlisted owned tools.
 */

import { requireAuthenticatedUser } from '../_shared/requireAuthenticatedUser.ts'
import { buildRestrictedCorsHeaders } from '../_shared/security/browserCors.ts'
import {
  SYSTEM_PROMPT,
  resolveAssistantModel,
  resolveGoalSpecInterpreterModel,
  resolveV4InterpreterModel,
} from './prompt.ts'
import {
  ASSISTANT_SEMANTIC_JSON_SCHEMA,
  parseFlatSemanticPayload,
} from './schema.ts'
import { V4_INTERPRETER_SYSTEM_PROMPT } from './v4Prompt.ts'
import {
  ASSISTANT_V4_TASKSPEC_JSON_SCHEMA,
  parseFlatV4TaskSpecPayload,
} from './v4Schema.ts'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './v5Prompt.ts'
import {
  ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
  parseFlatV5GoalSpecPayload,
} from './v5Schema.ts'
import {
  buildV5ChatCompletionRequestBody,
  buildV5GoalSpecErrorResponse,
  buildV5GoalSpecSuccessResponse,
  sanitizeV5SemanticContextSummary,
} from './v5OpenAITransport.ts'

/** Eval-only allowlist — never accept arbitrary client model strings. */
const V4_EVAL_MODEL_ALLOWLIST = new Set([
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-4.1-nano',
  'gpt-5-mini',
])

/**
 * V5 GoalSpec eval-only allowlist (secret-gated).
 * Includes Luna for authorized harnesses. Browser UI never sends evalModel.
 */
const V5_EVAL_MODEL_ALLOWLIST = new Set([
  'gpt-5.6-luna',
  'gpt-4.1',
  'gpt-4.1-mini',
])

/**
 * Resolve model for V4 interpret.
 * Default is the V4 interpreter model (gpt-4.1). Eval override only when
 * evalAuth matches server secret AND requested model is allowlisted.
 * Never used by normal Assistant UI / V3 path.
 */
function resolveV4InterpretModel(
  body: Record<string, unknown>,
  defaultModel: string,
  evalAuthHeader: string | null,
): { model: string; evalOverride: boolean; error?: string } {
  const requested =
    typeof body.evalModel === 'string' ? body.evalModel.trim() : ''
  if (!requested) return { model: defaultModel, evalOverride: false }

  const expected =
    Deno.env.get('OURWED_V4_EVAL_SECRET')?.trim() ||
    Deno.env.get('BENCHMARK_TOKEN')?.trim() ||
    ''
  const providedBody =
    typeof body.evalAuth === 'string' ? body.evalAuth.trim() : ''
  const provided = (evalAuthHeader?.trim() || providedBody)
  if (!expected || !provided || provided !== expected) {
    return {
      model: defaultModel,
      evalOverride: false,
      error: 'eval_auth_rejected',
    }
  }
  if (!V4_EVAL_MODEL_ALLOWLIST.has(requested)) {
    return {
      model: defaultModel,
      evalOverride: false,
      error: 'eval_model_not_allowlisted',
    }
  }
  return { model: requested, evalOverride: true }
}

/**
 * Resolve model for V5 GoalSpec interpret.
 * Server owns selection (resolveGoalSpecInterpreterModel). body.model is ignored.
 * Eval override only when secret matches AND model is on V5 allowlist.
 */
function resolveV5InterpretModel(
  body: Record<string, unknown>,
  defaultModel: string,
  evalAuthHeader: string | null,
): { model: string; evalOverride: boolean; error?: string } {
  // Hard invariant: browser/client must not choose the model via `model`.
  void body.model

  const requested =
    typeof body.evalModel === 'string' ? body.evalModel.trim() : ''
  if (!requested) return { model: defaultModel, evalOverride: false }

  const expected =
    Deno.env.get('OURWED_V4_EVAL_SECRET')?.trim() ||
    Deno.env.get('BENCHMARK_TOKEN')?.trim() ||
    ''
  const providedBody =
    typeof body.evalAuth === 'string' ? body.evalAuth.trim() : ''
  const provided = (evalAuthHeader?.trim() || providedBody)
  if (!expected || !provided || provided !== expected) {
    return {
      model: defaultModel,
      evalOverride: false,
      error: 'eval_auth_rejected',
    }
  }
  if (!V5_EVAL_MODEL_ALLOWLIST.has(requested)) {
    return {
      model: defaultModel,
      evalOverride: false,
      error: 'eval_model_not_allowlisted',
    }
  }
  return { model: requested, evalOverride: true }
}

function envCors(name: string): string | null {
  return Deno.env.get(name)?.trim() || null
}

let activeCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ourwed-v4-eval',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...activeCorsHeaders, 'Content-Type': 'application/json' },
  })
}

function resolveApiKey(): string | null {
  const raw = Deno.env.get('OPENAI_API_KEY')
  if (!raw) return null
  let key = raw.trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim()
  }
  return key || null
}

const MAX_RECENT = 4
const MAX_UTTERANCE_CHARS = 500

function sanitizeUtterance(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().slice(0, MAX_UTTERANCE_CHARS)
  return t.length ? t : null
}

function sanitizePageContext(raw: unknown): {
  resourceType: 'wedding' | 'session'
  resourceId: string
} | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const resourceType = row.resourceType
  const resourceId = row.resourceId
  if (
    (resourceType === 'wedding' || resourceType === 'session') &&
    typeof resourceId === 'string' &&
    /^[0-9a-f-]{36}$/i.test(resourceId)
  ) {
    return { resourceType, resourceId }
  }
  return null
}

function sanitizeSessionContext(raw: unknown): { weddingId: string | null } | null {
  if (!raw || typeof raw !== 'object') return null
  const wid = (raw as Record<string, unknown>).weddingId
  if (wid === null || wid === undefined) return { weddingId: null }
  if (typeof wid === 'string' && /^[0-9a-f-]{36}$/i.test(wid)) {
    return { weddingId: wid }
  }
  return { weddingId: null }
}

function sanitizeRecent(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const u = sanitizeUtterance(item)
    if (u) out.push(u)
    if (out.length >= MAX_RECENT) break
  }
  return out
}

function extractMessageContent(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const choices = (body as Record<string, unknown>).choices
  if (!Array.isArray(choices) || !choices[0]) return null
  const msg = (choices[0] as Record<string, unknown>).message
  if (!msg || typeof msg !== 'object') return null
  const content = (msg as Record<string, unknown>).content
  return typeof content === 'string' ? content : null
}

function extractUsage(body: unknown): {
  prompt_tokens?: number
  completion_tokens?: number
} | null {
  if (!body || typeof body !== 'object') return null
  const usage = (body as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object') return null
  const u = usage as Record<string, unknown>
  return {
    prompt_tokens:
      typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined,
    completion_tokens:
      typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined,
  }
}

/** Sanitize OpenAI error payload for eval-only diagnostics. Never log secrets. */
function extractProviderErrorDiagnostics(
  openaiRes: Response,
  openaiBody: unknown,
): Record<string, unknown> {
  const header = (name: string): string | null => {
    const v = openaiRes.headers.get(name)
    return v && v.trim() ? v.trim() : null
  }
  let providerErrorType: string | null = null
  let providerErrorCode: string | null = null
  let providerErrorMessage: string | null = null
  if (openaiBody && typeof openaiBody === 'object') {
    const err = (openaiBody as Record<string, unknown>).error
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>
      providerErrorType = typeof e.type === 'string' ? e.type.slice(0, 80) : null
      providerErrorCode = typeof e.code === 'string' ? e.code.slice(0, 80) : null
      if (typeof e.message === 'string') {
        // strip any accidental key-like substrings
        providerErrorMessage = e.message
          .replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')
          .slice(0, 240)
      }
    }
  }
  return {
    providerStatus: openaiRes.status,
    providerErrorType,
    providerErrorCode,
    providerErrorMessage,
    providerRequestId:
      header('x-request-id') || header('x-openai-request-id'),
    retryAfter: header('retry-after'),
    rateLimitLimitRequests: header('x-ratelimit-limit-requests'),
    rateLimitRemainingRequests: header('x-ratelimit-remaining-requests'),
    rateLimitResetRequests: header('x-ratelimit-reset-requests'),
    rateLimitLimitTokens: header('x-ratelimit-limit-tokens'),
    rateLimitRemainingTokens: header('x-ratelimit-remaining-tokens'),
    rateLimitResetTokens: header('x-ratelimit-reset-tokens'),
  }
}

function isV4EvalAuthorized(
  body: Record<string, unknown>,
  evalAuthHeader: string | null,
): boolean {
  const expected =
    Deno.env.get('OURWED_V4_EVAL_SECRET')?.trim() ||
    Deno.env.get('BENCHMARK_TOKEN')?.trim() ||
    ''
  const providedBody =
    typeof body.evalAuth === 'string' ? body.evalAuth.trim() : ''
  const provided = (evalAuthHeader?.trim() || providedBody)
  return Boolean(expected && provided && provided === expected)
}

Deno.serve(async (req) => {
  activeCorsHeaders = buildRestrictedCorsHeaders(req, envCors, 'POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: activeCorsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ status: 'error', message: 'Method not allowed' }, 405)
  }

  const auth = await requireAuthenticatedUser(req)
  if (!auth.ok) {
    return jsonResponse(
      { status: 'error', message: 'Unauthorized', code: 'unauthorized' },
      auth.status,
    )
  }

  const apiKey = resolveApiKey()
  if (!apiKey) {
    return jsonResponse(
      {
        status: 'error',
        message:
          'Nie udało się teraz wykonać zapytania. Spróbuj ponownie.',
        code: 'missing_key',
      },
      500,
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse(
      { status: 'error', message: 'Invalid JSON', code: 'invalid_json' },
      400,
    )
  }

  // Prefer compact semantic protocol fields; tolerate legacy messages[last].content
  let utterance = sanitizeUtterance(body.utterance)
  if (!utterance && Array.isArray(body.messages)) {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const m = body.messages[i]
      if (!m || typeof m !== 'object') continue
      const row = m as Record<string, unknown>
      if (row.role === 'user' && typeof row.content === 'string') {
        utterance = sanitizeUtterance(row.content)
        if (utterance) break
      }
    }
  }
  if (!utterance) {
    return jsonResponse(
      { status: 'error', message: 'Missing utterance', code: 'invalid_request' },
      400,
    )
  }

  const v3Model = resolveAssistantModel()
  const mode = typeof body.mode === 'string' ? body.mode.trim() : ''

  // --- V4 interpret (TaskSpec only). Isolated from V3 planner path. ---
  if (mode === 'v4_interpret') {
    const evalAuthHeader = req.headers.get('x-ourwed-v4-eval')
    const modelResolved = resolveV4InterpretModel(
      body,
      resolveV4InterpreterModel(),
      evalAuthHeader,
    )
    if (
      typeof body.evalModel === 'string' &&
      body.evalModel.trim() &&
      modelResolved.error
    ) {
      return jsonResponse(
        {
          status: 'error',
          message: 'Eval model override rejected',
          code: modelResolved.error,
        },
        403,
      )
    }
    const v4Model = modelResolved.model

    const semanticContextSummary =
      body.semanticContextSummary &&
      typeof body.semanticContextSummary === 'object' &&
      !Array.isArray(body.semanticContextSummary)
        ? body.semanticContextSummary
        : null
    const locale =
      typeof body.locale === 'string' && body.locale.trim()
        ? body.locale.trim().slice(0, 16)
        : 'pl-PL'

    const userPayload = JSON.stringify({
      utterance,
      semanticContextSummary,
      locale,
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 28_000)
    const started = Date.now()

    try {
      const openaiRes = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: v4Model,
            temperature: 0,
            max_tokens: 800,
            messages: [
              { role: 'system', content: V4_INTERPRETER_SYSTEM_PROMPT },
              { role: 'user', content: userPayload },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'assistant_v4_task_spec',
                strict: true,
                schema: ASSISTANT_V4_TASKSPEC_JSON_SCHEMA,
              },
            },
          }),
        },
      )

      const openaiBody = await openaiRes.json().catch(() => null)
      const usage = extractUsage(openaiBody)

      if (!openaiRes.ok) {
        const providerDiag = extractProviderErrorDiagnostics(
          openaiRes,
          openaiBody,
        )
        console.info('[ai-assistant:v4]', {
          durationMs: Date.now() - started,
          status: 'provider_error',
          http: openaiRes.status,
          model: v4Model,
          evalOverride: modelResolved.evalOverride,
          usage,
          ...providerDiag,
        })
        const code =
          openaiRes.status === 429 ? 'provider_rate_limit' : 'provider_error'
        const evalAuthorized = isV4EvalAuthorized(body, evalAuthHeader)
        return jsonResponse(
          {
            status: 'error',
            message:
              'Nie udało się teraz wykonać zapytania. Spróbuj ponownie.',
            code,
            // Eval-only: expose sanitized OpenAI rate-limit diagnostics.
            // Never attached for normal Assistant UI requests.
            diagnostics: evalAuthorized
              ? {
                  model: v4Model,
                  evalOverride: modelResolved.evalOverride,
                  ...providerDiag,
                }
              : undefined,
          },
          200,
        )
      }

      const text = extractMessageContent(openaiBody)
      let parsedJson: unknown = null
      if (text) {
        try {
          parsedJson = JSON.parse(text)
        } catch {
          parsedJson = null
        }
      }

      const taskSpec = parseFlatV4TaskSpecPayload(parsedJson)
      if (!taskSpec) {
        console.info('[ai-assistant:v4]', {
          durationMs: Date.now() - started,
          status: 'malformed_model',
          model: v4Model,
          hasText: Boolean(text),
          usage,
        })
        return jsonResponse({
          status: 'error',
          message:
            'Nie udało się teraz wykonać zapytania. Spróbuj ponownie.',
          code: 'malformed_model',
        })
      }

      console.info('[ai-assistant:v4]', {
        durationMs: Date.now() - started,
        status: 'task_spec',
        op: taskSpec.op,
        model: v4Model,
        evalOverride: modelResolved.evalOverride,
        usage,
      })

      return jsonResponse({
        status: 'task_spec',
        taskSpec,
        // Model identity always returned for V4 interpret (routing audit / smoke).
        // Does not accept client model selection — server-resolved only.
        diagnostics: {
          model: v4Model,
          evalOverride: modelResolved.evalOverride,
          ...(Deno.env.get('OURWED_ASSISTANT_DIAGNOSTICS') === '1' ||
          modelResolved.evalOverride
            ? {
                durationMs: Date.now() - started,
                usage,
              }
            : {}),
        },
      })
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      console.info('[ai-assistant:v4]', {
        durationMs: Date.now() - started,
        status: aborted ? 'timeout' : 'exception',
        model: v4Model,
      })
      return jsonResponse({
        status: 'error',
        message: 'Nie udało się teraz wykonać zapytania. Spróbuj ponownie.',
        code: aborted ? 'timeout' : 'exception',
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  // --- V5 GoalSpec interpret (shadow / eval). Isolated from V3 + V4 TaskSpec. ---
  // MUST return inside this branch — never fall through to V3.
  if (mode === 'v5_goal_interpret') {
    const evalAuthHeader = req.headers.get('x-ourwed-v4-eval')
    const modelResolved = resolveV5InterpretModel(
      body,
      resolveGoalSpecInterpreterModel(),
      evalAuthHeader,
    )
    if (
      typeof body.evalModel === 'string' &&
      body.evalModel.trim() &&
      modelResolved.error
    ) {
      return jsonResponse(
        buildV5GoalSpecErrorResponse({
          code: modelResolved.error as
            | 'eval_auth_rejected'
            | 'eval_model_not_allowlisted',
          message: 'Eval model override rejected',
        }),
        403,
      )
    }
    const v5Model = modelResolved.model

    const semanticContextSummary = sanitizeV5SemanticContextSummary(
      body.semanticContextSummary,
    )
    const locale =
      typeof body.locale === 'string' && body.locale.trim()
        ? body.locale.trim().slice(0, 16)
        : 'pl-PL'

    const userPayload = JSON.stringify({
      utterance,
      semanticContextSummary,
      locale,
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 28_000)
    const started = Date.now()

    try {
      const openaiPayload = buildV5ChatCompletionRequestBody({
        model: v5Model,
        maxOutputTokens: 900,
        messages: [
          { role: 'system', content: V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT },
          { role: 'user', content: userPayload },
        ],
        jsonSchemaName: 'assistant_v5_goal_spec',
        jsonSchema: ASSISTANT_V5_GOALSPEC_JSON_SCHEMA,
      })

      const openaiRes = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(openaiPayload),
        },
      )

      const openaiBody = await openaiRes.json().catch(() => null)
      const usage = extractUsage(openaiBody)

      if (!openaiRes.ok) {
        const providerDiag = extractProviderErrorDiagnostics(
          openaiRes,
          openaiBody,
        )
        console.info('[ai-assistant:v5]', {
          durationMs: Date.now() - started,
          status: 'provider_error',
          http: openaiRes.status,
          model: v5Model,
          evalOverride: modelResolved.evalOverride,
          usage,
          ...providerDiag,
        })
        const code =
          openaiRes.status === 429 ? 'provider_rate_limit' : 'provider_error'
        const evalAuthorized = isV4EvalAuthorized(body, evalAuthHeader)
        return jsonResponse(
          buildV5GoalSpecErrorResponse({
            code,
            diagnostics: evalAuthorized
              ? {
                  model: v5Model,
                  evalOverride: modelResolved.evalOverride,
                  ...providerDiag,
                }
              : undefined,
          }),
          200,
        )
      }

      const text = extractMessageContent(openaiBody)
      let parsedJson: unknown = null
      if (text) {
        try {
          parsedJson = JSON.parse(text)
        } catch {
          parsedJson = null
        }
      }

      const goalSpec = parseFlatV5GoalSpecPayload(parsedJson)
      if (!goalSpec) {
        console.info('[ai-assistant:v5]', {
          durationMs: Date.now() - started,
          status: 'malformed_model',
          model: v5Model,
          hasText: Boolean(text),
          usage,
        })
        return jsonResponse(
          buildV5GoalSpecErrorResponse({ code: 'malformed_model' }),
          200,
        )
      }

      console.info('[ai-assistant:v5]', {
        durationMs: Date.now() - started,
        status: 'goal_spec',
        requestKind: goalSpec.requestKind,
        model: v5Model,
        evalOverride: modelResolved.evalOverride,
        usage,
      })

      return jsonResponse(
        buildV5GoalSpecSuccessResponse({
          goalSpec,
          model: v5Model,
          evalOverride: modelResolved.evalOverride,
          diagnosticsExtra:
            Deno.env.get('OURWED_ASSISTANT_DIAGNOSTICS') === '1' ||
            modelResolved.evalOverride
              ? {
                  durationMs: Date.now() - started,
                  usage,
                }
              : undefined,
        }),
      )
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      console.info('[ai-assistant:v5]', {
        durationMs: Date.now() - started,
        status: aborted ? 'timeout' : 'exception',
        model: v5Model,
      })
      return jsonResponse(
        buildV5GoalSpecErrorResponse({
          code: aborted ? 'timeout' : 'exception',
        }),
        200,
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  // --- V3 domain planner (unchanged) ---
  const pageContext = sanitizePageContext(body.pageContext)
  const sessionContext = sanitizeSessionContext(body.sessionContext)
  const recentUtterances = sanitizeRecent(body.recentUtterances)
  const workingContext =
    body.workingContext &&
    typeof body.workingContext === 'object' &&
    !Array.isArray(body.workingContext)
      ? body.workingContext
      : null

  const userPayload = JSON.stringify({
    utterance,
    pageContext,
    sessionContext,
    recentUtterances,
    workingContext,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 28_000)
  const started = Date.now()

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: v3Model,
        temperature: 0,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPayload },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'assistant_domain_request',
            strict: true,
            schema: ASSISTANT_SEMANTIC_JSON_SCHEMA,
          },
        },
      }),
    })

    const openaiBody = await openaiRes.json().catch(() => null)
    const usage = extractUsage(openaiBody)

    if (!openaiRes.ok) {
      console.info('[ai-assistant]', {
        durationMs: Date.now() - started,
        status: 'provider_error',
        http: openaiRes.status,
        usage,
      })
      const code =
        openaiRes.status === 429 ? 'provider_rate_limit' : 'provider_error'
      return jsonResponse(
        {
          status: 'error',
          message:
            'Nie udało się teraz wykonać zapytania. Spróbuj ponownie.',
          code,
        },
        200,
      )
    }

    const text = extractMessageContent(openaiBody)
    let parsedJson: unknown = null
    if (text) {
      try {
        parsedJson = JSON.parse(text)
      } catch {
        parsedJson = null
      }
    }

    const request = parseFlatSemanticPayload(parsedJson)
    if (!request) {
      const kindGuess =
        parsedJson && typeof parsedJson === 'object'
          ? String(
              (parsedJson as Record<string, unknown>).domainKind ??
                (parsedJson as Record<string, unknown>).kind ??
                '',
            )
          : ''
      console.info('[ai-assistant]', {
        durationMs: Date.now() - started,
        status: 'malformed_model',
        kindGuess: kindGuess || null,
        hasText: Boolean(text),
        usage,
      })
      return jsonResponse({
        status: 'error',
        message:
          'Nie udało się teraz wykonać zapytania. Spróbuj ponownie.',
        code: 'malformed_model',
      })
    }

    console.info('[ai-assistant]', {
      durationMs: Date.now() - started,
      status: 'domain',
      kind: request.kind,
      usage,
    })

    return jsonResponse({
      status: 'domain',
      request,
      diagnostics:
        Deno.env.get('OURWED_ASSISTANT_DIAGNOSTICS') === '1'
          ? { durationMs: Date.now() - started, usage }
          : undefined,
    })
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    console.info('[ai-assistant]', {
      durationMs: Date.now() - started,
      status: aborted ? 'timeout' : 'exception',
    })
    return jsonResponse({
      status: 'error',
      message: 'Nie udało się teraz wykonać zapytania. Spróbuj ponownie.',
      code: aborted ? 'timeout' : 'exception',
    })
  } finally {
    clearTimeout(timeout)
  }
})
