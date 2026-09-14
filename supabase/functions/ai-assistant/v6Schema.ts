/**
 * V6-F1 — Edge agent step schema + parser.
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
  value: Record<string, unknown>
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
  }
  if (status === 'unsupported' && typeof row.reason !== 'string') {
    return { ok: false, reason: 'unsupported_incomplete' }
  }
  if (
    status === 'clarify' &&
    (typeof row.slot !== 'string' || typeof row.reason !== 'string')
  ) {
    return { ok: false, reason: 'clarify_incomplete' }
  }
  return { ok: true, value: row }
}
