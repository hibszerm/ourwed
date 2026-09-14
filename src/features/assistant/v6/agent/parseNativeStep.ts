/**
 * V6-F1.2 — Parse OpenAI native tool_calls / complete_turn into V6 step response.
 * No string-arguments agent-step schema. No alias normalizer.
 */

import {
  mapNativeAggregateArgs,
  mapNativeQueryArgs,
  mapNativeRestoreArgs,
  mapNativeTransformArgs,
  assertNoInventedVocabulary,
} from './mapNativeToolArgs'
import { V6_DOMAIN_TOOL_NAMES } from './nativeTools'
import type { V6AgentStepResponse } from './protocol'

export type NativeOpenAIToolCall = {
  id: string
  type?: string
  function: {
    name: string
    arguments: string // OpenAI still serializes FC args as JSON string at wire level
  }
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

/**
 * OpenAI function-calling still delivers `arguments` as a JSON string on the wire,
 * but the string is constrained by the tool's strict parameter schema at generation time
 * (unlike the previous unconstrained agent-step blob).
 */
export function parseV6NativeChatMessage(message: {
  content?: string | null
  tool_calls?: NativeOpenAIToolCall[] | null
}):
  | { ok: true; response: V6AgentStepResponse }
  | { ok: false; reason: string } {
  const toolCalls = message.tool_calls
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    // Protocol: at most one complete_turn; domain tools otherwise
    const complete = toolCalls.find((c) => c.function?.name === 'complete_turn')
    if (complete) {
      if (toolCalls.length > 1) {
        return {
          ok: false,
          reason: 'VALIDATION_ERROR:complete_turn_must_be_alone',
        }
      }
      const args = parseArgsObject(complete.function.arguments ?? '{}')
      if (!args.ok) return args
      const status = args.value.status
      if (status !== 'final' && status !== 'clarify' && status !== 'unsupported') {
        return { ok: false, reason: 'VALIDATION_ERROR:bad_complete_status' }
      }
      if (status === 'final') {
        return {
          ok: true,
          response: {
            status: 'final',
            text:
              typeof args.value.text === 'string' ? args.value.text : undefined,
          },
        }
      }
      if (status === 'clarify') {
        const reason =
          typeof args.value.reason === 'string'
            ? args.value.reason
            : typeof args.value.text === 'string'
              ? args.value.text
              : null
        if (!reason) {
          return { ok: false, reason: 'VALIDATION_ERROR:clarify_incomplete' }
        }
        return {
          ok: true,
          response: {
            status: 'clarify',
            slot:
              typeof args.value.slot === 'string' && args.value.slot.trim()
                ? args.value.slot
                : 'unspecified',
            reason,
            candidates: Array.isArray(args.value.candidates)
              ? (args.value.candidates as Array<{ id: string; label: string }>)
              : undefined,
          },
        }
      }
      if (typeof args.value.reason !== 'string') {
        return { ok: false, reason: 'VALIDATION_ERROR:unsupported_incomplete' }
      }
      return {
        ok: true,
        response: { status: 'unsupported', reason: args.value.reason },
      }
    }

    const mapped: Array<{
      id: string
      name: string
      arguments: Record<string, unknown>
    }> = []

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

      // Map to runtime executor shape (SearchAction fields / parentHandle / …)
      if (name === 'query_collection') {
        const m = mapNativeQueryArgs(args.value)
        if (!m.ok) return { ok: false, reason: `${m.reason}:${m.detail}` }
        mapped.push({
          id: call.id,
          name,
          arguments: m.value as unknown as Record<string, unknown>,
        })
      } else if (name === 'transform_collection') {
        const m = mapNativeTransformArgs(args.value)
        if (!m.ok) return { ok: false, reason: `${m.reason}:${m.detail}` }
        mapped.push({
          id: call.id,
          name,
          arguments: {
            parentHandle: m.value.parentHandle,
            ops: m.value.ops,
          },
        })
      } else if (name === 'aggregate_collection') {
        const m = mapNativeAggregateArgs(args.value)
        if (!m.ok) return { ok: false, reason: `${m.reason}:${m.detail}` }
        mapped.push({
          id: call.id,
          name,
          arguments: m.value as unknown as Record<string, unknown>,
        })
      } else {
        const m = mapNativeRestoreArgs(args.value)
        if (!m.ok) return { ok: false, reason: `${m.reason}:${m.detail}` }
        mapped.push({
          id: call.id,
          name,
          arguments: m.value as unknown as Record<string, unknown>,
        })
      }
    }

    return {
      ok: true,
      response: { status: 'tool_calls', toolCalls: mapped },
    }
  }

  // No tool calls — treat text content as final if present
  if (typeof message.content === 'string' && message.content.trim()) {
    return {
      ok: true,
      response: { status: 'final', text: message.content.trim() },
    }
  }

  return { ok: false, reason: 'INTERPRETATION_ERROR:empty_native_response' }
}
