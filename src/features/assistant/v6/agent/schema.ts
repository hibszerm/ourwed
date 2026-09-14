/**
 * V6-F1 / F1.1A — Structured agent step output schema (OpenAI strict:true).
 * Transport: toolCalls[].arguments is a JSON string; runtime parses + validates.
 */

import { parseAndValidateToolArguments } from './validateToolArguments'

export const ASSISTANT_V6_AGENT_STEP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'toolCalls', 'text', 'slot', 'reason', 'candidates'],
  properties: {
    status: {
      type: 'string',
      enum: ['tool_calls', 'final', 'clarify', 'unsupported'],
    },
    toolCalls: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'arguments'],
        properties: {
          id: { type: 'string' },
          name: {
            type: 'string',
            enum: [
              'query_collection',
              'transform_collection',
              'aggregate_collection',
              'restore_collection',
            ],
          },
          /** OpenAI strict: open objects forbidden — JSON-serialized tool args. */
          arguments: { type: 'string' },
        },
      },
    },
    text: { type: ['string', 'null'] },
    slot: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
    candidates: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
  },
} as const

export type V6ParsedAgentStep = {
  status: 'tool_calls' | 'final' | 'clarify' | 'unsupported'
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }> | null
  text?: string | null
  slot?: string | null
  reason?: string | null
  candidates?: Array<{ id: string; label: string }> | null
}

export function parseV6AgentStepPayload(raw: unknown):
  | { ok: true; value: V6ParsedAgentStep }
  | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not_object' }
  }
  const row = raw as Record<string, unknown>
  const status = row.status
  if (
    status !== 'tool_calls' &&
    status !== 'final' &&
    status !== 'clarify' &&
    status !== 'unsupported'
  ) {
    return { ok: false, reason: 'bad_status' }
  }

  if (status === 'tool_calls') {
    if (!Array.isArray(row.toolCalls) || row.toolCalls.length < 1) {
      return { ok: false, reason: 'tool_calls_required' }
    }
    const toolCalls: NonNullable<
      Exclude<V6ParsedAgentStep['toolCalls'], null | undefined>
    > = []
    for (const c of row.toolCalls) {
      if (!c || typeof c !== 'object') return { ok: false, reason: 'bad_call' }
      const call = c as Record<string, unknown>
      if (typeof call.id !== 'string' || typeof call.name !== 'string') {
        return { ok: false, reason: 'bad_call_fields' }
      }
      const args = parseAndValidateToolArguments(call.name, call.arguments)
      if (!args.ok) {
        return {
          ok: false,
          reason: `${args.reason}:${args.detail}`,
        }
      }
      toolCalls.push({
        id: call.id,
        name: call.name,
        arguments: args.value,
      })
    }
    return {
      ok: true,
      value: {
        status,
        toolCalls,
        text: null,
        slot: null,
        reason: null,
        candidates: null,
      },
    }
  }

  if (status === 'final') {
    return {
      ok: true,
      value: {
        status,
        toolCalls: null,
        text: typeof row.text === 'string' ? row.text : null,
        slot: null,
        reason: null,
        candidates: null,
      },
    }
  }

  if (status === 'clarify') {
    const reasonFromText =
      typeof row.text === 'string' && row.text.trim() ? row.text : null
    const reason =
      typeof row.reason === 'string' && row.reason.trim()
        ? row.reason
        : reasonFromText
    if (!reason) {
      return { ok: false, reason: 'clarify_incomplete' }
    }
    const slot =
      typeof row.slot === 'string' && row.slot.trim()
        ? row.slot
        : 'unspecified'
    return {
      ok: true,
      value: {
        status,
        toolCalls: null,
        text: typeof row.text === 'string' ? row.text : null,
        slot,
        reason,
        candidates: Array.isArray(row.candidates)
          ? (row.candidates as Array<{ id: string; label: string }>)
          : null,
      },
    }
  }

  if (typeof row.reason !== 'string') {
    return { ok: false, reason: 'unsupported_incomplete' }
  }
  return {
    ok: true,
    value: {
      status,
      toolCalls: null,
      text: null,
      slot: null,
      reason: row.reason,
      candidates: null,
    },
  }
}
