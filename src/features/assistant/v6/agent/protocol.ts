/**
 * V6-F1 — Agent step protocol types (client↔Edge).
 * Designed so orchestration can later move server-side unchanged.
 */

import type { V6CollectionSummary } from '../collections/summary'
import type { V6ToolCall } from '../tools'

export const V6_MAX_TOOL_ROUNDS = 4

export type V6AgentStepRequest = {
  mode: 'v6_agent_step'
  utterance: string
  locale?: string
  round: number
  compactConversationContext?: {
    recentUtterances?: string[]
  }
  collectionSummaries: V6CollectionSummary[]
  previousToolResults?: Array<{
    toolCallId: string
    name: string
    result: unknown
  }>
}

export type V6AgentToolCallsResponse = {
  status: 'tool_calls'
  toolCalls: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
  diagnostics?: Record<string, unknown>
}

export type V6AgentFinalResponse = {
  status: 'final'
  text?: string
  observationRef?: string
  diagnostics?: Record<string, unknown>
}

export type V6AgentClarifyResponse = {
  status: 'clarify'
  slot: string
  reason: string
  candidates?: Array<{ id: string; label: string }>
  diagnostics?: Record<string, unknown>
}

export type V6AgentUnsupportedResponse = {
  status: 'unsupported'
  reason: string
  diagnostics?: Record<string, unknown>
}

export type V6AgentErrorResponse = {
  status: 'error'
  code: string
  message: string
  diagnostics?: Record<string, unknown>
}

export type V6AgentStepResponse =
  | V6AgentToolCallsResponse
  | V6AgentFinalResponse
  | V6AgentClarifyResponse
  | V6AgentUnsupportedResponse
  | V6AgentErrorResponse

export function normalizeToolCalls(
  raw: V6AgentToolCallsResponse['toolCalls'],
): V6ToolCall[] {
  return raw.map((c) => ({
    name: c.name as V6ToolCall['name'],
    arguments: c.arguments ?? {},
  }))
}
