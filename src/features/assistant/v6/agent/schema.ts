/**
 * V6-F1 — Structured agent step output schema (client mirror + Edge).
 */

export const ASSISTANT_V6_AGENT_STEP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
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
          arguments: {
            type: 'object',
            additionalProperties: true,
          },
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

export function parseV6AgentStepPayload(raw: unknown): {
  ok: true
  value: {
    status: 'tool_calls' | 'final' | 'clarify' | 'unsupported'
    toolCalls?: Array<{
      id: string
      name: string
      arguments: Record<string, unknown>
    }>
    text?: string | null
    slot?: string | null
    reason?: string | null
    candidates?: Array<{ id: string; label: string }> | null
  }
} | { ok: false; reason: string } {
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
    const toolCalls = []
    for (const c of row.toolCalls) {
      if (!c || typeof c !== 'object') return { ok: false, reason: 'bad_call' }
      const call = c as Record<string, unknown>
      if (typeof call.id !== 'string' || typeof call.name !== 'string') {
        return { ok: false, reason: 'bad_call_fields' }
      }
      if (!call.arguments || typeof call.arguments !== 'object') {
        return { ok: false, reason: 'bad_arguments' }
      }
      toolCalls.push({
        id: call.id,
        name: call.name,
        arguments: call.arguments as Record<string, unknown>,
      })
    }
    return { ok: true, value: { status, toolCalls } }
  }

  if (status === 'final') {
    return {
      ok: true,
      value: {
        status,
        text: typeof row.text === 'string' ? row.text : null,
      },
    }
  }

  if (status === 'clarify') {
    if (typeof row.slot !== 'string' || typeof row.reason !== 'string') {
      return { ok: false, reason: 'clarify_incomplete' }
    }
    return {
      ok: true,
      value: {
        status,
        slot: row.slot,
        reason: row.reason,
        candidates: Array.isArray(row.candidates)
          ? (row.candidates as Array<{ id: string; label: string }>)
          : null,
      },
    }
  }

  if (typeof row.reason !== 'string') {
    return { ok: false, reason: 'unsupported_incomplete' }
  }
  return { ok: true, value: { status, reason: row.reason } }
}
