/**
 * Session-resource predicate evaluation (V7 first-class Session).
 * Does not share wedding payment/contract batch paths.
 */

import {
  V6_CROSS_DOMAIN_CANDIDATE_CAP as REGISTRY_CANDIDATE_CAP,
  getConcept,
  type ConceptKey,
} from '../registry'
import {
  loadSessionUniverseRows,
  type SessionCollectionRow,
} from '../execution/sessionUniverse'
import {
  SessionReadContext,
  type SessionReadContextOverrides,
} from './SessionReadContext'
import { inspectSessionConcept } from './sessionInspectAdapters'
import {
  compareConceptValue,
  type PredicateBatchResult,
} from './predicateBatch'
import type { ConceptScalarValue } from './types'

export const V6_SESSION_CANDIDATE_CAP = REGISTRY_CANDIDATE_CAP

export type SessionPredicateBatchOptions = {
  loadSessionUniverseRows?: () => Promise<SessionCollectionRow[]>
  sessionContextOptions?: SessionReadContextOverrides
}

type Predicate = {
  concept: ConceptKey
  cmp: string
  value: boolean | number | string | null
}

function supported(predicate: Predicate): boolean {
  const concept = getConcept(predicate.concept)
  if (concept.resource !== 'SESSION') return false
  if (
    !(concept.operations as readonly string[]).includes('filter') ||
    !('filterShape' in concept)
  ) {
    return false
  }
  const shapes = Array.isArray(concept.filterShape)
    ? concept.filterShape
    : [concept.filterShape]
  return (shapes as readonly string[]).includes(predicate.cmp)
}

function comparable(value: unknown): value is ConceptScalarValue {
  return (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function lightRowValue(
  row: SessionCollectionRow | undefined,
  concept: ConceptKey,
): ConceptScalarValue | undefined {
  if (!row) return undefined
  if (concept === 'SESSION.DATE') return row.date
  if (concept === 'SESSION.DISPLAY_NAME') return row.displayLabel
  if (concept === 'SESSION.TYPE') return row.sessionType
  if (concept === 'SESSION.LOCATION_SUMMARY') return row.locationSummary
  if (concept === 'SESSION.TOTAL_PRICE') return row.contractValue
  if (concept === 'SESSION.DEPOSIT_AMOUNT') return row.depositAmount
  if (concept === 'SESSION.TOTAL_PAID') return row.paidAmount
  if (concept === 'SESSION.REMAINING_TO_PAY') return row.remainingAmount
  if (concept === 'SESSION.HAS_LINKED_WEDDING') return row.hasLinkedWedding
  return undefined
}

export async function evaluateSessionConceptPredicates(
  sessionIds: string[],
  predicates: Predicate[],
  options: SessionPredicateBatchOptions = {},
): Promise<PredicateBatchResult> {
  if (sessionIds.length > V6_SESSION_CANDIDATE_CAP) {
    return {
      ok: false,
      code: 'CANDIDATE_CAP_EXCEEDED',
      detail: `candidate_count:${sessionIds.length}`,
    }
  }
  const unsupported = predicates.find((predicate) => !supported(predicate))
  if (unsupported) {
    return {
      ok: false,
      code: 'UNSUPPORTED_PREDICATE',
      detail: `${unsupported.concept}:${unsupported.cmp}`,
    }
  }
  if (predicates.length === 0) {
    return { ok: true, matchedIds: [...sessionIds] }
  }

  let candidates = [...sessionIds]
  let lightRows: Map<string, SessionCollectionRow> | null = null

  for (const predicate of predicates) {
    if (candidates.length === 0) break

    if (!lightRows) {
      const rows = await (
        options.loadSessionUniverseRows ?? loadSessionUniverseRows
      )()
      lightRows = new Map(rows.map((row) => [row.id, row]))
    }

    const checks = await Promise.all(
      candidates.map(async (sessionId) => {
        const fromLight = lightRowValue(
          lightRows?.get(sessionId),
          predicate.concept,
        )
        if (fromLight !== undefined) {
          return compareConceptValue(
            fromLight,
            predicate.cmp,
            predicate.value,
          )
        }
        const context = new SessionReadContext(
          sessionId,
          options.sessionContextOptions,
        )
        const inspected = await inspectSessionConcept(
          context,
          predicate.concept,
        )
        return (
          comparable(inspected.value) &&
          compareConceptValue(
            inspected.value,
            predicate.cmp,
            predicate.value,
          )
        )
      }),
    )
    candidates = candidates.filter((_id, index) => checks[index])
  }

  return { ok: true, matchedIds: candidates }
}
