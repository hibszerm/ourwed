/**
 * V7 Hybrid Direct Tool Agent — bounded native tool loop.
 * No TurnPlan. No semantic verifier. No ConversationCollection algebra.
 */

import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { V7ResourceSetStore } from '../resourceSet/store'
import type { V7SessionBinding } from '../resourceSet/types'
import { sanitizeV7UserText } from '../render/sanitize'
import {
  executeV7Tool,
  type V7ToolContext,
  type V7ToolDeps,
} from '../tools/execute'
import { V7_NATIVE_TOOLS } from './nativeTools'
import type { V7ProviderUsage } from './invokeStep'
import { buildV7SystemPrompt } from './prompt'
import { getActiveV7LatencyTrace } from '../diagnostics/latencyTrace'
import {
  copyForBlockedDisposition,
  isV7AllowedDisposition,
  isV7BlockedDisposition,
  parseV7TurnDisposition,
  V7_REPORT_TURN_SCOPE_TOOL,
  wrapV7ToolResultAsUntrustedData,
  type V7TurnDisposition,
} from './domainDisposition'

export const V7_DEFAULT_MODEL = 'gpt-5.6-terra'
export const V7_MAX_TOOL_CALLS_PER_TURN = 6

export type V7ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

export type V7LatencyMarks = {
  firstModelMs: number | null
  toolExecutionMs: number[]
  subsequentModelMs: number[]
  finalResponseMs: number | null
  totalMs: number
}

export type V7TurnResult = {
  ok: boolean
  userText: string
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>
  toolCallCount: number
  stoppedReason:
    | 'final'
    | 'tool_loop_exceeded'
    | 'provider_error'
    | 'empty'
    | 'domain_blocked'
  /** A1 — accepted turn disposition when known (null/absent = unknown). */
  disposition?: V7TurnDisposition | null
  latency: V7LatencyMarks
  model: string
}

export type V7AgentSession = {
  store: V7ResourceSetStore
  binding: V7SessionBinding
  deps?: V7ToolDeps
  /** Prior conversational turns (user + assistant text only for history). */
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  model?: string
  apiKey?: string
  todayKey?: string
  fetchImpl?: typeof fetch
  /**
   * Production canary: use Edge ai-assistant v7_agent_step (no browser OpenAI key).
   * Eval/local may omit and use direct OpenAI via apiKey.
   */
  transport?: 'direct' | 'edge'
}

type OpenAIChoiceMessage = {
  role?: string
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

async function callModel(input: {
  session: V7AgentSession
  model: string
  messages: V7ChatMessage[]
  allowTools?: boolean
}): Promise<{
  ok: boolean
  message: OpenAIChoiceMessage | null
  error?: string
  latencyMs: number
  model: string
  edgeOpenaiMs: number | null
  usage: V7ProviderUsage | null
}> {
  const allowTools = input.allowTools !== false
  const useEdge =
    input.session.transport === 'edge' ||
    (!input.session.apiKey &&
      !input.session.fetchImpl &&
      typeof window !== 'undefined')

  if (useEdge) {
    const { invokeV7AgentStep } = await import('./invokeStep')
    const step = await invokeV7AgentStep({
      messages: input.messages,
      tools: V7_NATIVE_TOOLS,
      allowTools,
    })
    if (!step.ok) {
      return {
        ok: false,
        message: null,
        error: step.error,
        latencyMs: step.latencyMs,
        model: input.model,
        edgeOpenaiMs: step.edgeOpenaiMs,
        usage: step.usage,
      }
    }
    return {
      ok: true,
      message: step.message,
      latencyMs: step.latencyMs,
      model: step.model,
      edgeOpenaiMs: step.edgeOpenaiMs,
      usage: step.usage,
    }
  }

  const apiKey =
    input.session.apiKey ?? process.env.OPENAI_API_KEY?.trim() ?? ''
  const fetchImpl = input.session.fetchImpl ?? fetch
  if (!apiKey) {
    return {
      ok: false,
      message: null,
      error: 'missing_openai_key',
      latencyMs: 0,
      model: input.model,
      edgeOpenaiMs: null,
      usage: null,
    }
  }

  const t0 = Date.now()
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  }
  // GPT-5.6 family (Sol/Luna/Terra): bake-off-compatible chat.completions config
  if (input.model.startsWith('gpt-5.6')) {
    body.max_completion_tokens = 1200
    body.reasoning_effort = 'none'
    // 2K.9-L3 — same stable key as Edge v7_agent_step (routing only).
    body.prompt_cache_key = 'ourwed-v7-golden-a1-domain-v1'
  } else {
    body.temperature = 0
    body.max_tokens = 1200
  }
  if (allowTools) {
    body.tools = V7_NATIVE_TOOLS
    body.tool_choice = 'auto'
  }

  let lastError = 'fetch_failed'
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as {
        choices?: Array<{ message?: OpenAIChoiceMessage }>
        error?: { message?: string; code?: string; type?: string }
        usage?: Record<string, unknown>
      }
      const usage = readDirectUsage(json)
      if (res.status === 429 || /rate limit/i.test(json?.error?.message ?? '')) {
        lastError = json?.error?.message ?? `http_${res.status}`
        const waitMs = 800 * (attempt + 1) + Math.floor(Math.random() * 400)
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      if (!res.ok) {
        return {
          ok: false,
          message: null,
          error: json?.error?.message ?? `http_${res.status}`,
          latencyMs: Date.now() - t0,
          model: input.model,
          edgeOpenaiMs: null,
          usage,
        }
      }
      return {
        ok: true,
        message: json.choices?.[0]?.message ?? null,
        latencyMs: Date.now() - t0,
        model: input.model,
        edgeOpenaiMs: null,
        usage,
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'fetch_failed'
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  return {
    ok: false,
    message: null,
    error: lastError,
    latencyMs: Date.now() - t0,
    model: input.model,
    edgeOpenaiMs: null,
    usage: null,
  }
}

/** Direct-path usage: only include fields OpenAI actually returned. */
function readDirectUsage(json: {
  usage?: Record<string, unknown>
}): V7ProviderUsage | null {
  const u = json.usage
  if (!u || typeof u !== 'object') return null
  const out: V7ProviderUsage = {}
  if (typeof u.prompt_tokens === 'number') out.promptTokens = u.prompt_tokens
  if (typeof u.completion_tokens === 'number') {
    out.completionTokens = u.completion_tokens
  }
  const details = u.prompt_tokens_details
  if (details && typeof details === 'object') {
    const d = details as Record<string, unknown>
    if (typeof d.cached_tokens === 'number') out.cachedTokens = d.cached_tokens
    if (typeof d.cache_write_tokens === 'number') {
      out.cacheWriteTokens = d.cache_write_tokens
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function usageAuditFields(usage: V7ProviderUsage | null | undefined): {
  promptTokens?: number
  cachedTokens?: number
  cacheWriteTokens?: number
  completionTokens?: number
} {
  if (!usage) return {}
  const out: {
    promptTokens?: number
    cachedTokens?: number
    cacheWriteTokens?: number
    completionTokens?: number
  } = {}
  if (typeof usage.promptTokens === 'number') out.promptTokens = usage.promptTokens
  if (typeof usage.cachedTokens === 'number') out.cachedTokens = usage.cachedTokens
  if (typeof usage.cacheWriteTokens === 'number') {
    out.cacheWriteTokens = usage.cacheWriteTokens
  }
  if (typeof usage.completionTokens === 'number') {
    out.completionTokens = usage.completionTokens
  }
  return out
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return {}
  }
}

function finishBlockedTurn(input: {
  session: V7AgentSession
  userUtterance: string
  disposition: V7TurnDisposition | null
  recorded: V7TurnResult['toolCalls']
  toolCallCount: number
  latency: V7LatencyMarks
  model: string
  totalStart: number
}): V7TurnResult {
  const userText = copyForBlockedDisposition(input.disposition)
  input.session.history.push({ role: 'user', content: input.userUtterance })
  input.session.history.push({ role: 'assistant', content: userText })
  input.latency.totalMs = Date.now() - input.totalStart
  return {
    ok: true,
    userText,
    toolCalls: input.recorded,
    toolCallCount: input.toolCallCount,
    stoppedReason: 'domain_blocked',
    disposition: input.disposition,
    latency: input.latency,
    model: input.model,
  }
}

/**
 * Run one user turn through the V7 hybrid direct-tool agent.
 */
export async function runV7Turn(
  session: V7AgentSession,
  userUtterance: string,
): Promise<V7TurnResult> {
  const totalStart = Date.now()
  let model =
    session.model ??
    process.env.V7_MODEL?.trim() ??
    V7_DEFAULT_MODEL
  const todayKey = session.todayKey ?? localCalendarDateKey()

  const latency: V7LatencyMarks = {
    firstModelMs: null,
    toolExecutionMs: [],
    subsequentModelMs: [],
    finalResponseMs: null,
    totalMs: 0,
  }

  const toolCtx: V7ToolContext = {
    store: session.store,
    binding: session.binding,
    deps: {
      ...(session.deps ?? {}),
      todayKey,
    },
    blockBusinessTools: false,
  }

  const system = buildV7SystemPrompt({
    todayKey,
    availableHandles: session.store.listHandles(),
  })

  const messages: V7ChatMessage[] = [
    { role: 'system', content: system },
    ...session.history.map((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: userUtterance },
  ]

  const recorded: V7TurnResult['toolCalls'] = []
  let toolCallCount = 0
  let firstModel = true
  /** A1 — disposition accepted for this turn (null = unknown → fail closed). */
  let acceptedDisposition: V7TurnDisposition | null = null
  let scopeNudgeUsed = false
  const trace = getActiveV7LatencyTrace()
  trace?.mark('agent_loop_start')

  while (toolCallCount < V7_MAX_TOOL_CALLS_PER_TURN) {
    if (!firstModel) {
      const handles = session.store.listHandles()
      messages[0] = {
        role: 'system',
        content: buildV7SystemPrompt({
          todayKey,
          availableHandles: handles,
        }),
      }
    }

    const llmIdx = trace?.markLlmStart() ?? 0
    const call = await callModel({
      session,
      model,
      messages,
      allowTools: true,
    })
    model = call.model || model
    if (firstModel) {
      latency.firstModelMs = call.latencyMs
      firstModel = false
    } else {
      latency.subsequentModelMs.push(call.latencyMs)
    }

    if (!call.ok || !call.message) {
      latency.totalMs = Date.now() - totalStart
      if (process.env.V7_DEBUG_PROVIDER === '1') {
        console.error('[v7 provider]', call.error, {
          toolCallCount,
          messages: messages.length,
        })
      }
      return {
        ok: false,
        userText: 'Nie udało się dokończyć odpowiedzi. Spróbuj ponownie.',
        toolCalls: recorded,
        toolCallCount,
        stoppedReason: 'provider_error',
        disposition: acceptedDisposition,
        latency,
        model,
      }
    }

    const msg = call.message
    const toolCalls = msg.tool_calls ?? []

    if (toolCalls.length === 0) {
      // A1 — free prose without an allowed disposition is a domain backdoor.
      if (!isV7AllowedDisposition(acceptedDisposition)) {
        if (!scopeNudgeUsed && toolCallCount === 0) {
          scopeNudgeUsed = true
          if (trace && llmIdx > 0) {
            trace.markLlmEnd(llmIdx, {
              roundtripMs: call.latencyMs,
              edgeOpenaiMs: call.edgeOpenaiMs,
              ...usageAuditFields(call.usage),
              kind: 'grounding_retry_continue',
              toolNames: null,
              toolCount: 0,
            })
          }
          messages.push({
            role: 'assistant',
            content: msg.content ?? null,
          })
          messages.push({
            role: 'user',
            content:
              'Wymagane: wywołaj report_turn_scope(domain=…) w tej turze. Bez tego nie wolno odpowiadać merytorycznie. Dla pytań poza OurWed użyj domain=off_topic i nic więcej.',
          })
          trace?.mark('llm_grounding_retry', {
            continueReason: 'scope_disposition_required',
          })
          continue
        }
        if (trace && llmIdx > 0) {
          trace.markLlmEnd(llmIdx, {
            roundtripMs: call.latencyMs,
            edgeOpenaiMs: call.edgeOpenaiMs,
            ...usageAuditFields(call.usage),
            kind: 'final_content',
            toolNames: null,
            toolCount: 0,
          })
        }
        latency.finalResponseMs = call.latencyMs
        return finishBlockedTurn({
          session,
          userUtterance,
          disposition: acceptedDisposition,
          recorded,
          toolCallCount,
          latency,
          model,
          totalStart,
        })
      }

      const alreadyRetried = messages.some(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('Wymagane wywołanie narzędzia'),
      )
      if (!alreadyRetried && toolCallCount === 0) {
        if (trace && llmIdx > 0) {
          trace.markLlmEnd(llmIdx, {
            roundtripMs: call.latencyMs,
            edgeOpenaiMs: call.edgeOpenaiMs,
            ...usageAuditFields(call.usage),
            kind: 'grounding_retry_continue',
            toolNames: null,
            toolCount: 0,
          })
        }
        messages.push({
          role: 'user',
          content:
            'Wymagane wywołanie narzędzia w tej turze dla faktów CRM (liczby, kwoty, ranking, telefony, statusy). Nie odpowiadaj z pamięci — użyj tools.',
        })
        trace?.mark('llm_grounding_retry', { continueReason: 'grounding_retry' })
        continue
      }
      if (trace && llmIdx > 0) {
        trace.markLlmEnd(llmIdx, {
          roundtripMs: call.latencyMs,
          edgeOpenaiMs: call.edgeOpenaiMs,
            ...usageAuditFields(call.usage),
          kind: 'final_content',
          toolNames: null,
          toolCount: 0,
        })
      }
      const raw = (msg.content ?? '').trim()
      const userText = sanitizeV7UserText(
        raw ||
          'Nie jestem pewien, jak pomóc z tym pytaniem. Możesz sprecyzować?',
      )
      session.history.push({ role: 'user', content: userUtterance })
      session.history.push({ role: 'assistant', content: userText })
      latency.finalResponseMs = call.latencyMs
      latency.totalMs = Date.now() - totalStart
      trace?.mark('agent_loop_done', {
        stoppedReason: 'final',
        toolCallCount,
      })
      return {
        ok: true,
        userText,
        toolCalls: recorded,
        toolCallCount,
        stoppedReason: 'final',
        disposition: acceptedDisposition,
        latency,
        model,
      }
    }

    if (trace && llmIdx > 0) {
      const names = toolCalls.map((t) => t.function.name)
      trace.markLlmEnd(llmIdx, {
        roundtripMs: call.latencyMs,
        edgeOpenaiMs: call.edgeOpenaiMs,
            ...usageAuditFields(call.usage),
        kind: 'tools',
        toolNames: names.join(','),
        toolCount: names.length,
      })
    }

    // A1 — resolve disposition from this batch before executing business tools.
    let batchDisposition: V7TurnDisposition | null = null
    let sawScopeTool = false
    for (const tc of toolCalls) {
      if (tc.function.name !== V7_REPORT_TURN_SCOPE_TOOL) continue
      sawScopeTool = true
      batchDisposition = parseV7TurnDisposition(parseArgs(tc.function.arguments))
      break
    }

    if (sawScopeTool && batchDisposition === null) {
      // Malformed disposition → fail closed, no business tools.
      toolCtx.blockBusinessTools = true
      acceptedDisposition = null
    } else if (isV7BlockedDisposition(batchDisposition)) {
      toolCtx.blockBusinessTools = true
      acceptedDisposition = batchDisposition
    } else if (isV7AllowedDisposition(batchDisposition)) {
      toolCtx.blockBusinessTools = false
      acceptedDisposition = batchDisposition
    } else if (!isV7AllowedDisposition(acceptedDisposition)) {
      // Business tools without an allowed disposition this turn → block them.
      // Still execute report_turn_scope if somehow ordered later (already handled).
      toolCtx.blockBusinessTools = true
    }

    messages.push({
      role: 'assistant',
      content: msg.content ?? null,
      tool_calls: toolCalls,
    })

    for (const tc of toolCalls) {
      if (toolCallCount >= V7_MAX_TOOL_CALLS_PER_TURN) break
      toolCallCount += 1
      const name = tc.function.name
      const args = parseArgs(tc.function.arguments)
      const toolIdx = trace?.markToolStart(name) ?? 0
      const tExec = Date.now()
      const result = await executeV7Tool(toolCtx, name, args)
      const toolMs = Date.now() - tExec
      latency.toolExecutionMs.push(toolMs)
      if (trace && toolIdx > 0) {
        trace.markToolEnd(toolIdx, name, toolMs)
      }
      recorded.push({ name, args, result })
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name,
        content: wrapV7ToolResultAsUntrustedData(result),
      })
    }

    if (isV7BlockedDisposition(acceptedDisposition) || (sawScopeTool && batchDisposition === null)) {
      return finishBlockedTurn({
        session,
        userUtterance,
        disposition: acceptedDisposition,
        recorded,
        toolCallCount,
        latency,
        model,
        totalStart,
      })
    }

    // Business tools proposed without any allowed disposition → fail closed.
    const businessAttempted = toolCalls.some(
      (t) => t.function.name !== V7_REPORT_TURN_SCOPE_TOOL,
    )
    if (businessAttempted && !isV7AllowedDisposition(acceptedDisposition)) {
      return finishBlockedTurn({
        session,
        userUtterance,
        disposition: acceptedDisposition,
        recorded,
        toolCallCount,
        latency,
        model,
        totalStart,
      })
    }
  }

  // Tool-loop exceeded: only allow model summary if disposition was allowed.
  if (!isV7AllowedDisposition(acceptedDisposition)) {
    return finishBlockedTurn({
      session,
      userUtterance,
      disposition: acceptedDisposition,
      recorded,
      toolCallCount,
      latency,
      model,
      totalStart,
    })
  }

  const llmFinalIdx = trace?.markLlmStart() ?? 0
  const finalCall = await callModel({
    session,
    model,
    messages: [
      ...messages,
      {
        role: 'user',
        content:
          'Osiągnięto limit narzędzi w tej turze. Podsumuj naturalnie po polsku to, co już wiesz z narzędzi, albo poproś o doprecyzowanie. Bez nazw narzędzi.',
      },
    ],
    allowTools: false,
  })
  if (trace && llmFinalIdx > 0) {
    trace.markLlmEnd(llmFinalIdx, {
      roundtripMs: finalCall.latencyMs,
      edgeOpenaiMs: finalCall.edgeOpenaiMs,
      ...usageAuditFields(finalCall.usage),
      kind: 'final_content',
      toolNames: null,
      toolCount: 0,
    })
  }
  latency.subsequentModelMs.push(finalCall.latencyMs)
  latency.finalResponseMs = finalCall.latencyMs
  const raw =
    finalCall.message?.content?.trim() ||
    'Potrzebuję trochę więcej szczegółów, żeby dokończyć.'
  const userText = sanitizeV7UserText(raw)
  session.history.push({ role: 'user', content: userUtterance })
  session.history.push({ role: 'assistant', content: userText })
  latency.totalMs = Date.now() - totalStart
  trace?.mark('agent_loop_done', {
    stoppedReason: 'tool_loop_exceeded',
    toolCallCount,
  })
  return {
    ok: true,
    userText,
    toolCalls: recorded,
    toolCallCount,
    stoppedReason: 'tool_loop_exceeded',
    disposition: acceptedDisposition,
    latency,
    model: finalCall.model || model,
  }
}

