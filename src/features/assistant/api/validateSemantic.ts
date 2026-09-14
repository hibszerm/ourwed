/**
 * Runtime validation for AssistantSemanticRequest (Edge + client).
 * Malformed output must not execute tools.
 */

import type { AssistantSemanticRequest, PlaceRoleFilter } from '../types'

const KINDS = new Set([
  'wedding_finances',
  'wedding_places',
  'wedding_day_plan',
  'wedding_tasks',
  'wedding_next_action',
  'open_wedding',
  'open_session',
  'open_resource',
  'schedule',
  'prepare_create_wedding',
  'prepare_create_task',
  'aggregate',
  'unsupported',
  'unrecognized',
])

function isNullishString(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || typeof v === 'string'
}

function asStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

function hasForbiddenIdentity(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false
  for (const key of Object.keys(obj as object)) {
    if (/^(userId|ownerId|tenantId|user_id|owner_id|tenant_id)$/i.test(key)) {
      return true
    }
  }
  return false
}

function weddingResolver(raw: unknown): {
  personQuery: string | null
  dateHint: string | null
  weddingId?: string | null
} | null {
  if (!raw || typeof raw !== 'object' || hasForbiddenIdentity(raw)) return null
  const r = raw as Record<string, unknown>
  if (!isNullishString(r.personQuery) || !isNullishString(r.dateHint)) return null
  if (
    r.weddingId !== undefined &&
    r.weddingId !== null &&
    typeof r.weddingId !== 'string'
  ) {
    return null
  }
  return {
    personQuery: asStringOrNull(r.personQuery),
    dateHint: asStringOrNull(r.dateHint),
    weddingId: asStringOrNull(r.weddingId),
  }
}

/** Validate Edge/model semantic payload. Returns null if unsafe/malformed. */
export function validateAssistantSemanticRequest(
  raw: unknown,
): AssistantSemanticRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (hasForbiddenIdentity(raw)) return null
  const row = raw as Record<string, unknown>
  const kind = typeof row.kind === 'string' ? row.kind : ''
  if (!KINDS.has(kind)) return null

  switch (kind) {
    case 'unsupported':
    case 'unrecognized':
      return { kind }
    case 'schedule': {
      const datePhrase = asStringOrNull(row.datePhrase)
      if (!datePhrase) return null
      return { kind, datePhrase }
    }
    case 'aggregate': {
      const datePhrase = asStringOrNull(row.datePhrase)
      if (!datePhrase) return null
      const metricRaw = asStringOrNull(row.metric) ?? asStringOrNull(row.aggregateMetric)
      const scopeRaw = asStringOrNull(row.scope) ?? asStringOrNull(row.aggregateScope)
      const metric =
        metricRaw === 'count' ||
        metricRaw === 'contract_value' ||
        metricRaw === 'count_and_value'
          ? metricRaw
          : null
      const scope =
        scopeRaw === 'weddings' ||
        scopeRaw === 'sessions' ||
        scopeRaw === 'assignments'
          ? scopeRaw
          : null
      if (!metric || !scope) return null
      if (
        (metric === 'contract_value' || metric === 'count_and_value') &&
        scope !== 'weddings'
      ) {
        return null
      }
      return { kind: 'aggregate', metric, scope, datePhrase }
    }
    case 'prepare_create_wedding': {
      const partner1 = asStringOrNull(row.partner1)
      const partner2 = asStringOrNull(row.partner2)
      const date = asStringOrNull(row.date)
      if (!partner1 || !partner2 || !date) return null
      return { kind, partner1, partner2, date }
    }
    case 'prepare_create_task': {
      const title = asStringOrNull(row.title)
      if (!title) return null
      return {
        kind,
        title,
        duePhrase: asStringOrNull(row.duePhrase),
        weddingQuery: asStringOrNull(row.weddingQuery),
        weddingId: asStringOrNull(row.weddingId),
      }
    }
    case 'open_session': {
      if (!row.resolver || typeof row.resolver !== 'object') return null
      if (hasForbiddenIdentity(row.resolver)) return null
      const r = row.resolver as Record<string, unknown>
      return {
        kind,
        resolver: {
          personQuery: asStringOrNull(r.personQuery),
          sessionId: asStringOrNull(r.sessionId),
        },
      }
    }
    case 'wedding_places': {
      const resolver = weddingResolver(row.resolver)
      if (!resolver) return null
      const role = row.requestedRole
      const requestedRole: PlaceRoleFilter =
        role === 'preparations' ||
        role === 'bride_preparation' ||
        role === 'groom_preparation' ||
        role === 'ceremony' ||
        role === 'reception' ||
        role === 'all'
          ? role
          : 'all'
      const pk = asStringOrNull(row.participantKey)
      const participantKey =
        pk === 'p1' || pk === 'p2' ? pk : pk === null ? null : undefined
      const pr = asStringOrNull(row.participantRole)
      const participantRole =
        pr === 'bride' || pr === 'groom' ? pr : pr === null ? null : undefined
      return {
        kind,
        resolver,
        requestedRole,
        ...(participantKey !== undefined ? { participantKey } : {}),
        ...(participantRole !== undefined ? { participantRole } : {}),
      }
    }
    case 'wedding_day_plan': {
      const resolver = weddingResolver(row.resolver)
      if (!resolver) return null
      const f = row.focus
      const focus =
        f === 'ceremony' ||
        f === 'preparations' ||
        f === 'full' ||
        f === 'earliest'
          ? f
          : 'full'
      const pk = asStringOrNull(row.participantKey)
      const participantKey =
        pk === 'p1' || pk === 'p2' ? pk : pk === null ? null : undefined
      const pr = asStringOrNull(row.participantRole)
      const participantRole =
        pr === 'bride' || pr === 'groom' ? pr : pr === null ? null : undefined
      return {
        kind,
        resolver,
        focus,
        ...(participantKey !== undefined ? { participantKey } : {}),
        ...(participantRole !== undefined ? { participantRole } : {}),
      }
    }
    case 'wedding_finances': {
      const resolver = weddingResolver(row.resolver)
      if (!resolver) return null
      const a = row.financeAspect
      const financeAspect =
        a === 'remaining' ||
        a === 'paid' ||
        a === 'contract_value' ||
        a === 'overview'
          ? a
          : undefined
      return { kind, resolver, ...(financeAspect ? { financeAspect } : {}) }
    }
    case 'wedding_tasks':
    case 'wedding_next_action':
    case 'open_wedding':
    case 'open_resource': {
      const resolver = weddingResolver(row.resolver)
      if (!resolver) return null
      return { kind, resolver }
    }
    default:
      return null
  }
}

/** Ensure request payloads never include CRM blobs for the model. */
export function buildEdgeInterpretationPayload(input: {
  utterance: string
  pageContext?: { resourceType: 'wedding' | 'session'; resourceId: string } | null
  sessionContext?: { weddingId?: string | null } | null
  recentUtterances?: string[]
  workingContext?: Record<string, unknown> | null
}) {
  return {
    utterance: input.utterance.trim().slice(0, 500),
    pageContext: input.pageContext
      ? {
          resourceType: input.pageContext.resourceType,
          resourceId: input.pageContext.resourceId,
        }
      : null,
    sessionContext: input.sessionContext
      ? { weddingId: input.sessionContext.weddingId ?? null }
      : null,
    recentUtterances: (input.recentUtterances ?? [])
      .map((u) => u.trim().slice(0, 500))
      .filter(Boolean)
      .slice(-4),
    workingContext: input.workingContext ?? null,
  }
}
