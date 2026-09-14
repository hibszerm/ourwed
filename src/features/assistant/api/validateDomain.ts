/**
 * Validate AssistantDomainRequest from Edge / model.
 */

import { validateAssistantQueryPlan } from './queryPlanSchema'
import { validateAssistantSemanticRequest } from './validateSemantic'
import { validateAssistantAgentPlan } from '../orchestration/validateAgentPlan'
import type {
  AssistantClarificationOption,
  AssistantDomainRequest,
  AssistantSemanticRequest,
} from '../types'
import { ASSISTANT_UNSUPPORTED } from '../copy'

const FORBIDDEN =
  /^(userId|ownerId|tenantId|user_id|owner_id|tenant_id)$/i

function hasForbidden(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false
  for (const key of Object.keys(obj as object)) {
    if (FORBIDDEN.test(key)) return true
  }
  return false
}

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

export function validateAssistantDomainRequest(
  raw: unknown,
): AssistantDomainRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (hasForbidden(raw)) return null
  const row = raw as Record<string, unknown>
  const kind = asString(row.kind)
  if (!kind) return null

  if (kind === 'direct') {
    const semantic = validateAssistantSemanticRequest(row.semantic)
    if (!semantic) return null
    return { kind: 'direct', semantic }
  }

  if (kind === 'query_plan') {
    const plan = validateAssistantQueryPlan(
      row.plan && typeof row.plan === 'object'
        ? { kind: 'query_plan', ...(row.plan as object) }
        : { kind: 'query_plan', ...row },
    )
    if (!plan) return null
    return { kind: 'query_plan', plan }
  }

  if (kind === 'clarification') {
    const question = asString(row.question)
    if (!question) return null
    const optionsRaw = row.options
    const options: AssistantClarificationOption[] = []
    if (Array.isArray(optionsRaw)) {
      for (const item of optionsRaw.slice(0, 6)) {
        if (!item || typeof item !== 'object') continue
        if (hasForbidden(item)) continue
        const o = item as Record<string, unknown>
        const id = asString(o.id)
        const label = asString(o.label)
        if (!id || !label) continue
        const plan = o.plan
          ? validateAssistantQueryPlan({
              kind: 'query_plan',
              ...(o.plan as object),
            })
          : null
        const semantic = o.semantic
          ? validateAssistantSemanticRequest(o.semantic)
          : null
        let semanticPatch: AssistantClarificationOption['semanticPatch'] = null
        if (o.semanticPatch && typeof o.semanticPatch === 'object') {
          const p = o.semanticPatch as Record<string, unknown>
          const pk = asString(p.participantKey)
          semanticPatch = {
            participantKey: pk === 'p1' || pk === 'p2' ? pk : null,
            participantRole:
              asString(p.participantRole) === 'bride' ||
              asString(p.participantRole) === 'groom'
                ? (asString(p.participantRole) as 'bride' | 'groom')
                : null,
            weddingId: asString(p.weddingId),
            sessionId: asString(p.sessionId),
            placeScope: asString(p.placeScope) as never,
            datePhrase: asString(p.datePhrase),
            financeAspect: asString(p.financeAspect) as never,
          }
        }
        options.push({
          id,
          label,
          plan: plan ?? null,
          semantic: semantic ?? null,
          semanticPatch,
        })
      }
    }
    return { kind: 'clarification', question, options }
  }

  if (kind === 'unsupported') {
    const reasonRaw = asString(row.reason)
    const reason =
      reasonRaw === 'data_not_tracked' ||
      reasonRaw === 'capability' ||
      reasonRaw === 'write' ||
      reasonRaw === 'missing_data'
        ? reasonRaw
        : undefined
    return {
      kind: 'unsupported',
      reason,
      message: asString(row.message) ?? undefined,
    }
  }

  if (kind === 'plan') {
    const plan = validateAssistantAgentPlan(raw)
    if (!plan) return null
    return {
      kind: 'plan',
      goal: plan.goal,
      steps: plan.steps,
    }
  }

  // Legacy: raw AssistantSemanticRequest without domain wrapper
  const asSemantic = validateAssistantSemanticRequest(raw)
  if (asSemantic) {
    if (asSemantic.kind === 'unsupported') {
      return { kind: 'unsupported', reason: 'capability' }
    }
    return { kind: 'direct', semantic: asSemantic }
  }

  return null
}

/** Convert deprecated aggregate semantic → QueryPlan. */
export function aggregateSemanticToQueryPlan(
  semantic: Extract<AssistantSemanticRequest, { kind: 'aggregate' }>,
): import('./queryPlanSchema').AssistantQueryPlan {
  if (semantic.metric === 'count') {
    return {
      kind: 'query_plan',
      resource: semantic.scope,
      operation: 'count',
      filters: { dateRange: { phrase: semantic.datePhrase } },
    }
  }
  if (semantic.metric === 'contract_value') {
    return {
      kind: 'query_plan',
      resource: 'weddings',
      operation: 'sum',
      field: 'contractValue',
      filters: { dateRange: { phrase: semantic.datePhrase } },
    }
  }
  // count_and_value → sum with count shown in money result
  return {
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'sum',
    field: 'contractValue',
    filters: { dateRange: { phrase: semantic.datePhrase } },
  }
}

export function unsupportedMessage(
  req: Extract<AssistantDomainRequest, { kind: 'unsupported' }>,
): string {
  if (req.message) return req.message
  if (req.reason === 'data_not_tracked') {
    return 'OurWed nie przechowuje obecnie takich danych.'
  }
  if (req.reason === 'write') {
    return ASSISTANT_UNSUPPORTED
  }
  return ASSISTANT_UNSUPPORTED
}
