/**
 * U4.2 — V5 GoalSpec OpenAI request construction.
 * Pure helpers (no Deno). Luna vs gpt-4.1 transport branching.
 */

export const V5_DEFAULT_GOALSPEC_MODEL = 'gpt-5.6-luna'

/** Models that require max_completion_tokens and must not force temperature:0. */
export function isLunaStyleChatModel(model: string): boolean {
  return model.trim() === 'gpt-5.6-luna'
}

export type V5ChatCompletionRequestInput = {
  model: string
  messages: Array<{ role: string; content: string }>
  jsonSchemaName: string
  jsonSchema: unknown
  /** Completion budget (maps to max_tokens or max_completion_tokens). */
  maxOutputTokens?: number
}

/**
 * Build chat.completions JSON body for V5 GoalSpec.
 * Does not include Authorization — caller attaches headers.
 */
export function buildV5ChatCompletionRequestBody(
  input: V5ChatCompletionRequestInput,
): Record<string, unknown> {
  const maxOutputTokens = input.maxOutputTokens ?? 900
  const base: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: input.jsonSchemaName,
        strict: true,
        schema: input.jsonSchema,
      },
    },
  }

  if (isLunaStyleChatModel(input.model)) {
    // Luna: max_tokens unsupported; temperature:0 rejected — omit temperature (API default).
    base.max_completion_tokens = maxOutputTokens
    return base
  }

  base.temperature = 0
  base.max_tokens = maxOutputTokens
  return base
}

/** Compact semantic context keys only (G8 privacy). */
export function sanitizeV5SemanticContextSummary(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  if (
    row.previousGoalSummary &&
    typeof row.previousGoalSummary === 'object' &&
    !Array.isArray(row.previousGoalSummary)
  ) {
    const prev = row.previousGoalSummary as Record<string, unknown>
    const summary: Record<string, unknown> = {}
    for (const key of [
      'requestKind',
      'source',
      'aggregation',
      'measure',
      'placeName',
      'temporalExpression',
    ] as const) {
      if (key in prev) {
        const v = prev[key]
        if (v === null || typeof v === 'string') summary[key] = v
      }
    }
    out.previousGoalSummary = summary
  } else if (row.previousGoalSummary === null) {
    out.previousGoalSummary = null
  }

  if (typeof row.hasActiveCollection === 'boolean') {
    out.hasActiveCollection = row.hasActiveCollection
  }

  if (
    row.pageResourceKind === 'wedding' ||
    row.pageResourceKind === 'session' ||
    row.pageResourceKind === null
  ) {
    out.pageResourceKind = row.pageResourceKind
  }

  return Object.keys(out).length ? out : null
}

/**
 * V5 success / typed error contracts for tests + Edge.
 * Never includes raw OpenAI body or chain-of-thought.
 */
export function buildV5GoalSpecSuccessResponse(input: {
  goalSpec: Record<string, unknown>
  model: string
  evalOverride?: boolean
  diagnosticsExtra?: Record<string, unknown>
}): {
  status: 'goal_spec'
  goalSpec: Record<string, unknown>
  diagnostics: Record<string, unknown>
} {
  return {
    status: 'goal_spec',
    goalSpec: input.goalSpec,
    diagnostics: {
      model: input.model,
      evalOverride: Boolean(input.evalOverride),
      ...(input.diagnosticsExtra ?? {}),
    },
  }
}

export function buildV5GoalSpecErrorResponse(input: {
  code:
    | 'provider_error'
    | 'provider_rate_limit'
    | 'malformed_model'
    | 'timeout'
    | 'exception'
    | 'invalid_request'
    | 'eval_auth_rejected'
    | 'eval_model_not_allowlisted'
  message?: string
  diagnostics?: Record<string, unknown>
}): {
  status: 'error'
  message: string
  code: string
  diagnostics?: Record<string, unknown>
} {
  return {
    status: 'error',
    message:
      input.message ??
      'Nie udało się teraz wykonać zapytania. Spróbuj ponownie.',
    code: input.code,
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
  }
}
