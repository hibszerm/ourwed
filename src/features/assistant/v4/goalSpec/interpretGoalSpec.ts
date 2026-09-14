/**
 * G8 — Direct GoalSpec interpreter (Edge mode=v5_goal_interpret).
 * Shadow/eval only. Never mutates WorkingContext / activeCollection.
 * Does NOT receive TaskSpec or ResolvedTask.
 */

import {
  parseFlatGoalSpecPayload,
  validateGoalSpec,
} from './goalSpecSchema'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import type { GoalSpec } from './goalSpec'

export type GoalInterpretSemanticContext = {
  /** Compact prior-turn summary — never CRM dumps. */
  previousGoalSummary?: {
    requestKind?: string | null
    source?: string | null
    aggregation?: string | null
    measure?: string | null
    placeName?: string | null
    temporalExpression?: string | null
  } | null
  hasActiveCollection?: boolean
  pageResourceKind?: 'wedding' | 'session' | null
}

export type GoalInterpretResult =
  | {
      ok: true
      goalSpec: GoalSpec
      latencyMs: number
      model?: string
    }
  | {
      ok: false
      error: string
      code?:
        | 'empty_utterance'
        | 'aborted'
        | 'invoke_error'
        | 'empty_response'
        | 'schema_error'
        | 'provider_error'
        | 'unsupported'
      latencyMs: number
    }

type InvokeFn = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: unknown }>

const defaultInvoke: InvokeFn = async (functionName, options) => {
  const { supabase } = await import('@/lib/supabase')
  return supabase.functions.invoke(functionName, options)
}

function asErrorCode(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const code = (data as Record<string, unknown>).code
  return typeof code === 'string' ? code : undefined
}

/**
 * Interpret utterance → GoalSpec via Edge v5_goal_interpret.
 * Optional inject for local OpenAI / fixture harness.
 */
export async function interpretGoalSpec(input: {
  userText: string
  semanticContext?: GoalInterpretSemanticContext | null
  locale?: string
  signal?: AbortSignal
  invoke?: InvokeFn
  /** Test/harness: skip Edge and use provided flat/raw GoalSpec payload. */
  fixturePayload?: unknown
  todayLocalDateKey?: string
}): Promise<GoalInterpretResult> {
  const utterance = input.userText.trim().slice(0, 500)
  if (!utterance) {
    return { ok: false, error: 'empty_utterance', code: 'empty_utterance', latencyMs: 0 }
  }

  const started = Date.now()

  if (input.fixturePayload !== undefined) {
    const parsed = parseFlatGoalSpecPayload(input.fixturePayload)
    if (!parsed || !validateGoalSpec(parsed)) {
      return {
        ok: false,
        error: 'schema_error',
        code: 'schema_error',
        latencyMs: Date.now() - started,
      }
    }
    return {
      ok: true,
      goalSpec: normalizeGoalSpecTemporal(parsed, input.todayLocalDateKey),
      latencyMs: Date.now() - started,
      model: 'fixture',
    }
  }

  const invoke = input.invoke ?? defaultInvoke
  try {
    if (input.signal?.aborted) {
      return { ok: false, error: 'aborted', code: 'aborted', latencyMs: 0 }
    }

    const { data, error } = await invoke('ai-assistant', {
      body: {
        mode: 'v5_goal_interpret',
        utterance,
        locale: input.locale ?? 'pl-PL',
        semanticContextSummary: input.semanticContext ?? null,
      },
    })

    const latencyMs = Date.now() - started
    if (input.signal?.aborted) {
      return { ok: false, error: 'aborted', code: 'aborted', latencyMs }
    }
    if (error) {
      return {
        ok: false,
        error: 'invoke_error',
        code: asErrorCode(data) === 'provider_error' ? 'provider_error' : 'invoke_error',
        latencyMs,
      }
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'empty_response', latencyMs }
    }
    const row = data as Record<string, unknown>
    if (row.status === 'error') {
      const code = asErrorCode(data)
      return {
        ok: false,
        error: typeof row.message === 'string' ? row.message : 'edge_error',
        code:
          code === 'malformed_model'
            ? 'schema_error'
            : code === 'provider_error' || code === 'provider_rate_limit'
              ? 'provider_error'
              : 'invoke_error',
        latencyMs,
      }
    }
    if (row.status !== 'goal_spec') {
      return { ok: false, error: 'unexpected_status', latencyMs }
    }

    const goalSpec =
      row.goalSpec && typeof row.goalSpec === 'object'
        ? (row.goalSpec as GoalSpec)
        : parseFlatGoalSpecPayload(row.goalSpecFlat ?? row.payload)
    if (!goalSpec || !validateGoalSpec(goalSpec)) {
      return {
        ok: false,
        error: 'schema_error',
        code: 'schema_error',
        latencyMs,
      }
    }

    const diagnostics =
      row.diagnostics && typeof row.diagnostics === 'object'
        ? (row.diagnostics as Record<string, unknown>)
        : null

    return {
      ok: true,
      goalSpec: normalizeGoalSpecTemporal(goalSpec, input.todayLocalDateKey),
      latencyMs,
      model: typeof diagnostics?.model === 'string' ? diagnostics.model : undefined,
    }
  } catch {
    return {
      ok: false,
      error: 'invoke_error',
      code: 'invoke_error',
      latencyMs: Date.now() - started,
    }
  }
}
