/**
 * V6-F1.3 — Parse OpenAI native tool_calls or natural/structured outcomes.
 * No model-facing complete_turn. No alias normalizer.
 */

import {
  mapNativeAggregateArgs,
  mapNativeQueryArgs,
  mapNativeRestoreArgs,
  mapNativeTransformArgs,
  assertNoInventedVocabulary,
} from './mapNativeToolArgs'
import { V6_DOMAIN_TOOL_NAMES } from './nativeTools'
import {
  parseRequestedOperations,
  assessRequestedOperationsCapability,
  type V6RequestedOperations,
} from './requestedOperations'
import type { V6AgentStepResponse } from './protocol'

export type NativeOpenAIToolCall = {
  id: string
  type?: string
  function: {
    name: string
    arguments: string
  }
}

export type ParsedNativeToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
  requestedOperations: V6RequestedOperations
  rawArgs: Record<string, unknown>
}

function parseArgsObject(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'INVALID_TOOL_ARGUMENT_JSON:json_parse_failed' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'VALIDATION_ERROR:arguments_must_be_object' }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}

function parseOutcomeObject(raw: unknown): V6AgentStepResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const status = row.status
  if (status === 'final') {
    return {
      status: 'final',
      text: typeof row.text === 'string' ? row.text : undefined,
    }
  }
  if (status === 'clarify') {
    const reason =
      typeof row.reason === 'string' && row.reason.trim()
        ? row.reason
        : typeof row.text === 'string' && row.text.trim()
          ? row.text
          : null
    if (!reason) return null
    return {
      status: 'clarify',
      slot:
        typeof row.slot === 'string' && row.slot.trim()
          ? row.slot
          : 'unspecified',
      reason,
      candidates: Array.isArray(row.candidates)
        ? (row.candidates as Array<{ id: string; label: string }>)
        : undefined,
    }
  }
  if (status === 'unsupported') {
    if (typeof row.reason !== 'string' || !row.reason.trim()) return null
    return { status: 'unsupported', reason: row.reason }
  }
  return null
}

/**
 * Parse assistant message from native tools path.
 * @param options.allowPlainTextFinal — only after tool evidence exists.
 *   Zero-evidence free-form prose is rejected so Unsupported/Clarify must use
 *   structured outcome JSON (generic protocol — not phrase matching).
 */
export function parseV6NativeChatMessage(
  message: {
    content?: string | null
    tool_calls?: NativeOpenAIToolCall[] | null
  },
  options?: { allowPlainTextFinal?: boolean },
):
  | {
      ok: true
      response: V6AgentStepResponse
      toolCalls?: ParsedNativeToolCall[]
    }
  | { ok: false; reason: string } {
  const toolCalls = message.tool_calls
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    // Reject retired complete_turn if somehow still emitted
    if (toolCalls.some((c) => c.function?.name === 'complete_turn')) {
      return {
        ok: false,
        reason: 'VALIDATION_ERROR:complete_turn_retired',
      }
    }

    const mapped: ParsedNativeToolCall[] = []
    for (const call of toolCalls) {
      const name = call.function?.name
      if (
        !name ||
        !(V6_DOMAIN_TOOL_NAMES as readonly string[]).includes(name)
      ) {
        return {
          ok: false,
          reason: `VALIDATION_ERROR:unknown_tool:${String(name)}`,
        }
      }
      const args = parseArgsObject(call.function.arguments ?? '{}')
      if (!args.ok) return args
      const invented = assertNoInventedVocabulary(args.value)
      if (invented) {
        return { ok: false, reason: `${invented.reason}:${invented.detail}` }
      }

      const opsParsed = parseRequestedOperations(args.value.requested_operations)
      if (!opsParsed.ok) {
        return {
          ok: false,
          reason: `VALIDATION_ERROR:${opsParsed.detail}`,
        }
      }
      const cap = assessRequestedOperationsCapability(opsParsed.value)
      if (!cap.supported) {
        return {
          ok: true,
          response: {
            status: 'unsupported',
            reason: cap.detail,
          },
        }
      }

      const { requested_operations: _rop, ...toolArgs } = args.value

      if (name === 'query_collection') {
        const m = mapNativeQueryArgs(toolArgs)
        if (!m.ok) return { ok: false, reason: `${m.reason}:${m.detail}` }
        mapped.push({
          id: call.id,
          name,
          arguments: m.value as unknown as Record<string, unknown>,
          requestedOperations: opsParsed.value,
          rawArgs: args.value,
        })
      } else if (name === 'transform_collection') {
        const m = mapNativeTransformArgs(toolArgs)
        if (!m.ok) return { ok: false, reason: `${m.reason}:${m.detail}` }
        mapped.push({
          id: call.id,
          name,
          arguments: {
            parentHandle: m.value.parentHandle,
            ops: m.value.ops,
          },
          requestedOperations: opsParsed.value,
          rawArgs: args.value,
        })
      } else if (name === 'aggregate_collection') {
        const m = mapNativeAggregateArgs(toolArgs)
        if (!m.ok) return { ok: false, reason: `${m.reason}:${m.detail}` }
        mapped.push({
          id: call.id,
          name,
          arguments: m.value as unknown as Record<string, unknown>,
          requestedOperations: opsParsed.value,
          rawArgs: args.value,
        })
      } else {
        const m = mapNativeRestoreArgs(toolArgs)
        if (!m.ok) return { ok: false, reason: `${m.reason}:${m.detail}` }
        mapped.push({
          id: call.id,
          name,
          arguments: m.value as unknown as Record<string, unknown>,
          requestedOperations: opsParsed.value,
          rawArgs: args.value,
        })
      }
    }

    return {
      ok: true,
      response: {
        status: 'tool_calls',
        toolCalls: mapped.map((m) => ({
          id: m.id,
          name: m.name,
          arguments: m.arguments,
        })),
      },
      toolCalls: mapped,
    }
  }

  // No tool calls → outcome (structured JSON or plain final text)
  const content =
    typeof message.content === 'string' ? message.content.trim() : ''
  if (!content) {
    return { ok: false, reason: 'INTERPRETATION_ERROR:empty_native_response' }
  }

  // Try JSON outcome
  try {
    const asJson = JSON.parse(content)
    const outcome = parseOutcomeObject(asJson)
    if (outcome) return { ok: true, response: outcome }
  } catch {
    // plain text final
  }

  if (options?.allowPlainTextFinal === false) {
    return {
      ok: false,
      reason: 'INTERPRETATION_ERROR:structured_outcome_required',
    }
  }

  return {
    ok: true,
    response: { status: 'final', text: content },
  }
}
