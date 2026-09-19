/**
 * Session-resource inspect adapters (V7 first-class Session).
 * Wedding-scoped SESSION.HAS_ANY / COUNT / LIST stay on WeddingReadContext.
 */

import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import { getSessionLocationSummary } from '@/features/sessions/presentation/getSessionLocationSummary'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getRemainingToPay, getTotalPaid } from '@/lib/utils/finance'
import { toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { Session } from '@/types/session'
import {
  ALL_CONCEPT_KEYS,
  getConcept,
  type AdapterId,
  type ConceptKey,
} from '../registry'
import type { SessionReadContext } from './SessionReadContext'
import type { ConceptInspectValue, ConceptScalarValue } from './types'

export type SessionInspectAdapter = (
  ctx: SessionReadContext,
  conceptKey: ConceptKey,
) => Promise<ConceptInspectValue>

function scalar(
  conceptKey: ConceptKey,
  value: ConceptScalarValue,
  displayText?: string | null,
): ConceptInspectValue {
  return {
    value,
    filled: value !== null && !(typeof value === 'string' && !value.trim()),
    valueType: getConcept(conceptKey).returnType,
    ...(displayText !== undefined ? { displayText } : {}),
  }
}

async function sessionOrNull(ctx: SessionReadContext): Promise<Session | null> {
  return ctx.getSession()
}

function unsupported(
  conceptKey: ConceptKey,
): ConceptInspectValue {
  return {
    value: null,
    filled: false,
    valueType: getConcept(conceptKey).returnType,
    displayText: null,
  }
}

export const sessionInspectAdapters: Partial<
  Record<AdapterId, SessionInspectAdapter>
> = {
  'session.date': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    const date = session ? toLocalCalendarDateKey(session.date) : null
    return scalar(key, date)
  },
  'session.display_name': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    return scalar(key, session ? getSessionDisplayName(session) : null)
  },
  'session.type': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    if (!session) return scalar(key, null)
    const label = formatSessionType(session)
    return scalar(key, session.sessionType, label)
  },
  'session.start_time': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    return scalar(key, session?.startTime?.trim() || null)
  },
  'session.end_time': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    return scalar(key, session?.endTime?.trim() || null)
  },
  'session.location_summary': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    return scalar(
      key,
      session ? getSessionLocationSummary(session.location) ?? null : null,
    )
  },
  'session.total_price': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    if (!session) return scalar(key, null)
    const value = Number.isFinite(session.totalPrice)
      ? Math.max(0, session.totalPrice)
      : 0
    return scalar(key, value)
  },
  'session.deposit_amount': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    if (!session) return scalar(key, null)
    const value = Number.isFinite(session.depositAmount)
      ? Math.max(0, session.depositAmount)
      : 0
    return scalar(key, value)
  },
  'session.total_paid': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    if (!session) return scalar(key, null)
    return scalar(key, getTotalPaid(session.payments ?? []))
  },
  'session.remaining_to_pay': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    if (!session) return scalar(key, null)
    const contractValue = Number.isFinite(session.totalPrice)
      ? Math.max(0, session.totalPrice)
      : 0
    return scalar(
      key,
      getRemainingToPay(contractValue, session.payments ?? []),
    )
  },
  'session.has_linked_wedding': async (ctx, key) => {
    const session = await sessionOrNull(ctx)
    return scalar(key, Boolean(session?.linkedWeddingId))
  },
  'session.linked_wedding': async (_ctx, key) => unsupported(key),
}

export async function inspectSessionConcept(
  ctx: SessionReadContext,
  conceptKey: ConceptKey,
): Promise<ConceptInspectValue> {
  const concept = getConcept(conceptKey)
  if (concept.resource !== 'SESSION') {
    throw new Error(`Concept ${conceptKey} is not a SESSION resource concept`)
  }
  const adapter = sessionInspectAdapters[concept.adapterId]
  if (!adapter) {
    throw new Error(`Missing session inspect adapter: ${concept.adapterId}`)
  }
  return adapter(ctx, conceptKey)
}

for (const conceptKey of ALL_CONCEPT_KEYS) {
  const concept = getConcept(conceptKey)
  if (concept.resource !== 'SESSION') continue
  if (!sessionInspectAdapters[concept.adapterId]) {
    throw new Error(
      `Missing session inspect adapter coverage: ${concept.adapterId}`,
    )
  }
}

export async function linkedWeddingRelatedItems(
  ctx: SessionReadContext,
): Promise<
  Array<{ title: string; subtitle: string | null; meta: string | null }>
> {
  const wedding = await ctx.getLinkedWedding()
  if (!wedding) return []
  return [
    {
      title: getWeddingDisplayName(wedding),
      subtitle: wedding.date || null,
      meta: null,
    },
  ]
}
