/**
 * V7 session host (ResourceSet + history).
 * Tools execute client-side under RLS; LLM steps via Edge.
 * Presentation projection is additive — does not change V7 intelligence.
 */

import { authService } from '@/lib/api/authService'
import { V7ResourceSetStore } from './resourceSet/store'
import {
  runV7Turn as runV7AgentLoop,
  V7_DEFAULT_MODEL,
  type V7AgentSession,
  type V7TurnResult,
} from './agent/loop'
import { emitV7Diagnostic } from './diagnostics/emit'
import { getActiveV7LatencyTrace } from './diagnostics/latencyTrace'
import { isV7Enabled } from './canary/v7Gate'
import { projectV7PresentationTurn } from './presentation/projectV7Presentation'
import type { AssistantPresentationTurn } from './presentation/types'
import { ASSISTANT_API_FAILURE } from '../copy'

type HostSession = {
  open: boolean
  agent: V7AgentSession | null
  userId: string | null
}

const host: HostSession = {
  open: false,
  agent: null,
  userId: null,
}

export function setV7SessionOpen(open: boolean): void {
  host.open = open
  if (!open) {
    destroyV7Session()
  }
}

export function destroyV7Session(): void {
  host.agent?.store.close()
  host.agent = null
  host.userId = null
}

/** Whether a V7 agent session is live. */
export function isV7SessionActive(): boolean {
  return Boolean(host.agent && !host.agent.store.isClosed)
}

async function ensureSession(
  userId: string,
): Promise<V7AgentSession | null> {
  if (!isV7Enabled(userId)) return null
  if (host.agent && host.userId === userId && !host.agent.store.isClosed) {
    return host.agent
  }
  destroyV7Session()
  const store = new V7ResourceSetStore({
    sessionId: `v7-${userId.slice(0, 8)}-${Date.now()}`,
    tenantKey: userId,
  })
  host.userId = userId
  host.agent = {
    store,
    binding: store.binding,
    history: [],
    model: V7_DEFAULT_MODEL,
    transport: 'edge',
  }
  return host.agent
}

function unavailablePresentation(utterance: string): AssistantPresentationTurn {
  return {
    message: ASSISTANT_API_FAILURE,
    status: 'error',
    retryUtterance: utterance,
  }
}

function unavailableResult(): V7TurnResult {
  return {
    ok: false,
    userText: 'Asystent jest chwilowo niedostępny.',
    toolCalls: [],
    toolCallCount: 0,
    stoppedReason: 'provider_error',
    disposition: null,
    latency: {
      firstModelMs: null,
      toolExecutionMs: [],
      subsequentModelMs: [],
      finalResponseMs: null,
      totalMs: 0,
    },
    model: V7_DEFAULT_MODEL,
  }
}

export type V7TurnOutput = {
  result: V7TurnResult
  presentation: AssistantPresentationTurn
}

/**
 * Run one V7 turn + deterministic presentation projection.
 * Caller must have verified V7 visibility.
 */
export async function runV7Turn(input: {
  turnId: string
  utterance: string
}): Promise<V7TurnOutput> {
  const trace = getActiveV7LatencyTrace()
  trace?.mark('v7_host_enter')

  const user = await authService.getUser().catch(() => null)
  const userId = user?.id ?? null
  trace?.mark('host_auth_ready')
  if (!userId || !isV7Enabled(userId)) {
    const result = unavailableResult()
    return {
      result,
      presentation: unavailablePresentation(input.utterance),
    }
  }

  const reusedSession = Boolean(
    host.agent && host.userId === userId && !host.agent.store.isClosed,
  )
  const session = await ensureSession(userId)
  trace?.mark('session_ready', {
    reused: reusedSession,
  })
  if (!session) {
    const result = unavailableResult()
    return {
      result,
      presentation: unavailablePresentation(input.utterance),
    }
  }

  host.open = true
  const result = await runV7AgentLoop(session, input.utterance)
  // Diagnostics: counts/reasons only — never presentation refs/PII/UUIDs.
  emitV7Diagnostic({
    turnId: input.turnId,
    model: result.model,
    toolCallCount: result.toolCallCount,
    stoppedReason: result.stoppedReason,
    ok: result.ok,
    handleCount: session.store.listHandles().length,
    toolNames: result.toolCalls.map((t) => t.name),
    latencyMs: result.latency.totalMs,
  })

  trace?.mark('presentation_start')
  const presentation = projectV7PresentationTurn({
    result,
    store: session.store,
    binding: session.binding,
    utterance: input.utterance,
  })
  trace?.mark('presentation_done', {
    status: presentation.status ?? null,
  })

  return { result, presentation }
}
