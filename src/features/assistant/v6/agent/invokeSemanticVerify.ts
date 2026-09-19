/**
 * V6-RI2 — Client invoke for semantic verifier (Edge mode v6_semantic_verify).
 */

import type { V6CollectionSummary } from '../collections/summary'
import type { V6TurnPlan } from '../turnPlan/types'
import {
  parseSemanticVerifierWire,
  V6_SEMANTIC_VERIFIER_MODEL,
  type V6SemanticVerifierResult,
} from '../verification/semanticVerifier'

export type V6SemanticVerifyInvokeResult =
  | {
      ok: true
      result: V6SemanticVerifierResult
      latencyMs: number
      model: string
    }
  | {
      ok: false
      code:
        | 'VERIFICATION_TRANSPORT_ERROR'
        | 'VERIFICATION_SCHEMA_ERROR'
        | 'aborted'
      message: string
      latencyMs: number
      model?: string
    }

export async function invokeV6SemanticVerify(input: {
  utterance: string
  priorUtterances: string[]
  draftTurnPlan: V6TurnPlan
  collectionSummaries: V6CollectionSummary[]
  signal?: AbortSignal
}): Promise<V6SemanticVerifyInvokeResult> {
  if (input.signal?.aborted) {
    return {
      ok: false,
      code: 'aborted',
      message: 'aborted_before_invoke',
      latencyMs: 0,
    }
  }

  const started = Date.now()
  const body = {
    mode: 'v6_semantic_verify' as const,
    utterance: input.utterance,
    priorUtterances: input.priorUtterances,
    draftTurnPlan: input.draftTurnPlan,
    collectionSummaries: input.collectionSummaries,
  }

  try {
    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.functions.invoke('ai-assistant', {
      body,
    })
    const latencyMs = Date.now() - started

    if (input.signal?.aborted) {
      return {
        ok: false,
        code: 'aborted',
        message: 'aborted_after_invoke',
        latencyMs,
      }
    }

    if (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'invoke_failed'
      return {
        ok: false,
        code: 'VERIFICATION_TRANSPORT_ERROR',
        message,
        latencyMs,
        model: V6_SEMANTIC_VERIFIER_MODEL,
      }
    }

    if (!data || typeof data !== 'object') {
      return {
        ok: false,
        code: 'VERIFICATION_TRANSPORT_ERROR',
        message: 'empty_response',
        latencyMs,
        model: V6_SEMANTIC_VERIFIER_MODEL,
      }
    }

    const row = data as Record<string, unknown>
    const diagnostics =
      row.diagnostics && typeof row.diagnostics === 'object'
        ? (row.diagnostics as Record<string, unknown>)
        : undefined
    const model =
      typeof diagnostics?.model === 'string'
        ? diagnostics.model
        : V6_SEMANTIC_VERIFIER_MODEL

    if (row.status === 'error') {
      return {
        ok: false,
        code: 'VERIFICATION_TRANSPORT_ERROR',
        message: typeof row.message === 'string' ? row.message : 'provider_error',
        latencyMs,
        model,
      }
    }

    if (row.status !== 'semantic_verdict') {
      return {
        ok: false,
        code: 'VERIFICATION_TRANSPORT_ERROR',
        message: `unexpected_status:${String(row.status)}`,
        latencyMs,
        model,
      }
    }

    const parsed = parseSemanticVerifierWire(row.verdict)
    if (!parsed.ok) {
      return {
        ok: false,
        code: parsed.code,
        message: parsed.detail,
        latencyMs,
        model,
      }
    }

    return {
      ok: true,
      result: parsed.value,
      latencyMs,
      model,
    }
  } catch (e) {
    return {
      ok: false,
      code: 'VERIFICATION_TRANSPORT_ERROR',
      message: e instanceof Error ? e.message : 'invoke_threw',
      latencyMs: Date.now() - started,
      model: V6_SEMANTIC_VERIFIER_MODEL,
    }
  }
}
