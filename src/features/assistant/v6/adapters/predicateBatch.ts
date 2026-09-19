import { loadWeddingUniverseRows } from '../execution/weddingUniverse'
import {
  V6_CROSS_DOMAIN_CANDIDATE_CAP as REGISTRY_CANDIDATE_CAP,
  getConcept,
  type ConceptKey,
} from '../registry'
import { contractService } from '@/lib/api/contractService'
import { paymentService } from '@/lib/api/paymentService'
import { taskService, type StudioTask } from '@/lib/api/taskService'
import { weddingService } from '@/lib/api/weddingService'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import type { Payment, Wedding, WeddingContract } from '@/types/wedding'
import {
  WeddingReadContext,
  type WeddingReadContextOverrides,
} from './WeddingReadContext'
import { inspectConcept } from './inspectAdapters'
import type { ConceptScalarValue } from './types'

export const V6_CROSS_DOMAIN_CANDIDATE_CAP = REGISTRY_CANDIDATE_CAP

export type PredicateBatchOptions = {
  loadUniverseRows?: () => Promise<CollectionMoneyRow[]>
  loadWedding?: (weddingId: string) => Promise<Wedding | null>
  listPaymentsByWeddingIds?: (
    weddingIds: string[],
  ) => Promise<Map<string, Payment[]>>
  listContractsByWeddingIds?: (
    weddingIds: string[],
  ) => Promise<Map<string, WeddingContract | null>>
  listTasksForStudio?: () => Promise<StudioTask[]>
  contextOptions?: Omit<
    WeddingReadContextOverrides,
    'loadWedding' | 'seeded'
  >
}

type Predicate = {
  concept: ConceptKey
  cmp: string
  value: boolean | number | string | null
}

export type PredicateBatchResult =
  | { ok: true; matchedIds: string[] }
  | {
      ok: false
      code: 'CANDIDATE_CAP_EXCEEDED' | 'UNSUPPORTED_PREDICATE'
      detail: string
    }

function comparable(value: unknown): value is ConceptScalarValue {
  return (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

/** Generic string normalize for contains — accents stripped, pl-PL lowercased. */
function normalizeContainsText(raw: string): string {
  return raw
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

const CONTAINS_STOP = new Set(['i', 'and', 'or', 'oraz', 'a', 'z', 'ze', 'w', 'we'])

function containsTokens(raw: string): string[] {
  return normalizeContainsText(raw)
    .split(/[\s,/|&+\-–—]+/)
    .map((t) => t.replace(/[^a-z0-9]+/gi, ''))
    .filter((t) => t.length >= 3 && !CONTAINS_STOP.has(t))
}

function tokensSoftMatch(expectedToken: string, actualToken: string): boolean {
  if (expectedToken === actualToken) return true
  if (actualToken.includes(expectedToken) || expectedToken.includes(actualToken)) {
    return true
  }

  // Light generic stem: drop common inflectional endings (not a synonym dictionary).
  const stem = (t: string): string => {
    if (t.length >= 6 && /(iej|ego|emu|ymi|ych)$/.test(t)) return t.slice(0, -3)
    if (t.length >= 5 && /(ach|ami|owi|owie)$/.test(t)) return t.slice(0, -3)
    if (t.length >= 4 && /[aeiouy]$/.test(t)) return t.slice(0, -1)
    return t
  }
  const es = stem(expectedToken)
  const as = stem(actualToken)
  if (es.length >= 3 && es === as) return true
  if (es.length >= 3 && (as.startsWith(es) || es.startsWith(as))) return true

  // Shared prefix covers remaining near-inflection pairs.
  const n = Math.min(expectedToken.length, actualToken.length)
  if (n < 4) return false
  let shared = 0
  while (shared < n && expectedToken[shared] === actualToken[shared]) shared += 1
  const need = Math.max(
    3,
    Math.floor(Math.min(expectedToken.length, actualToken.length) * 0.65),
  )
  return shared >= need
}

/**
 * contains: exact substring (legacy) OR every significant expected token soft-matches
 * some actual token. Generic; no synonym maps / Host routers.
 */
export function stringContainsMatch(actual: string, expected: string): boolean {
  const aNorm = normalizeContainsText(actual)
  const eNorm = normalizeContainsText(expected)
  if (!eNorm) return false
  if (aNorm.includes(eNorm)) return true

  const eTokens = containsTokens(expected)
  if (eTokens.length === 0) return false
  const aTokens = containsTokens(actual)
  if (aTokens.length === 0) return false

  return eTokens.every((et) => aTokens.some((at) => tokensSoftMatch(et, at)))
}

export function compareConceptValue(
  actual: ConceptScalarValue,
  cmp: string,
  expected: boolean | number | string | null,
): boolean {
  if (cmp === 'eq') return actual === expected
  if (cmp === 'neq') return actual !== expected
  if (cmp === 'contains') {
    return (
      typeof actual === 'string' &&
      typeof expected === 'string' &&
      stringContainsMatch(actual, expected)
    )
  }
  if (actual == null || expected == null) return false
  const sameOrderedType =
    (typeof actual === 'number' && typeof expected === 'number') ||
    (typeof actual === 'string' && typeof expected === 'string')
  if (!sameOrderedType) return false
  const order =
    typeof actual === 'number' && typeof expected === 'number'
      ? actual - expected
      : String(actual).localeCompare(String(expected))
  if (cmp === 'gt') return order > 0
  if (cmp === 'gte') return order >= 0
  if (cmp === 'lt') return order < 0
  if (cmp === 'lte') return order <= 0
  return false
}

function supported(predicate: Predicate): boolean {
  const concept = getConcept(predicate.concept)
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

function predicateRank(predicate: Predicate): number {
  if (
    predicate.concept === 'FIN.CONTRACT_VALUE' ||
    predicate.concept === 'FIN.TOTAL_PAID' ||
    predicate.concept === 'FIN.REMAINING_TO_PAY'
  ) {
    return 0
  }
  if (predicate.concept === 'WEDDING.STATUS') return 1
  if (predicate.concept === 'FIN.DEPOSIT_PAID') return 2
  if (predicate.concept === 'CONTRACT.SIGNED') return 3
  return getConcept(predicate.concept).costClass === 'expensive' ? 10 : 5
}

function lightRowValue(
  row: CollectionMoneyRow | undefined,
  concept: ConceptKey,
): ConceptScalarValue | undefined {
  if (!row) return undefined
  if (concept === 'FIN.CONTRACT_VALUE') return row.contractValue
  if (concept === 'FIN.TOTAL_PAID') return row.paidAmount
  if (concept === 'FIN.REMAINING_TO_PAY') return row.remainingAmount
  if (concept === 'WEDDING.DATE') return row.date
  if (concept === 'WEDDING.DISPLAY_NAME') return row.displayLabel
  return undefined
}

export async function evaluateConceptPredicates(
  weddingIds: string[],
  predicates: Predicate[],
  options: PredicateBatchOptions = {},
): Promise<PredicateBatchResult> {
  if (weddingIds.length > V6_CROSS_DOMAIN_CANDIDATE_CAP) {
    return {
      ok: false,
      code: 'CANDIDATE_CAP_EXCEEDED',
      detail: `candidate_count:${weddingIds.length}`,
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
    return { ok: true, matchedIds: [...weddingIds] }
  }

  const ordered = [...predicates].sort(
    (a, b) => predicateRank(a) - predicateRank(b),
  )
  let candidates = [...weddingIds]
  let lightRows: Map<string, CollectionMoneyRow> | null = null
  let payments: Map<string, Payment[]> | null = null
  let contracts: Map<string, WeddingContract | null> | null = null
  let tasks: Map<string, StudioTask[]> | null = null
  const weddings = new Map<string, Promise<Wedding | null>>()

  const loadWedding = (id: string): Promise<Wedding | null> => {
    const current = weddings.get(id)
    if (current) return current
    const promise = (options.loadWedding ?? weddingService.getById)(id)
    weddings.set(id, promise)
    return promise
  }

  for (const predicate of ordered) {
    if (candidates.length === 0) break
    const adapterId = getConcept(predicate.concept).adapterId

    if (
      !lightRows &&
      (predicate.concept === 'FIN.CONTRACT_VALUE' ||
        predicate.concept === 'FIN.TOTAL_PAID' ||
        predicate.concept === 'FIN.REMAINING_TO_PAY' ||
        predicate.concept === 'WEDDING.DATE' ||
        predicate.concept === 'WEDDING.DISPLAY_NAME')
    ) {
      const rows = await (
        options.loadUniverseRows ?? loadWeddingUniverseRows
      )()
      lightRows = new Map(rows.map((row) => [row.id, row]))
    }
    const lightRowsCoverMoneyPredicate =
      (predicate.concept === 'FIN.TOTAL_PAID' ||
        predicate.concept === 'FIN.REMAINING_TO_PAY') &&
      candidates.every(
        (id) =>
          lightRowValue(lightRows?.get(id), predicate.concept) !== undefined,
      )
    if (
      !payments &&
      !lightRowsCoverMoneyPredicate &&
      ((adapterId.startsWith('fin.') &&
        adapterId !== 'fin.contract_value' &&
        adapterId !== 'fin.agreed_deposit' &&
        adapterId !== 'fin.remaining_after_deposit' &&
        adapterId !== 'fin.final_payment_due_date' &&
        adapterId !== 'fin.currency') ||
        adapterId === 'contract.readiness')
    ) {
      payments = await (
        options.listPaymentsByWeddingIds ?? paymentService.listByWeddingIds
      )(candidates)
    }
    if (!contracts && adapterId.startsWith('contract.')) {
      contracts = await (
        options.listContractsByWeddingIds ?? contractService.listByWeddingIds
      )(candidates)
    }
    if (!tasks && adapterId.startsWith('task.')) {
      const all = await (
        options.listTasksForStudio ?? taskService.listForStudio
      )()
      const candidateSet = new Set(candidates)
      tasks = new Map(candidates.map((id) => [id, []]))
      for (const task of all) {
        if (!task.weddingId || !candidateSet.has(task.weddingId)) continue
        const list = tasks.get(task.weddingId) ?? []
        list.push(task)
        tasks.set(task.weddingId, list)
      }
    }

    const checks = await Promise.all(
      candidates.map(async (weddingId) => {
        const fromLight = lightRowValue(
          lightRows?.get(weddingId),
          predicate.concept,
        )
        if (fromLight !== undefined) {
          return compareConceptValue(
            fromLight,
            predicate.cmp,
            predicate.value,
          )
        }
        const context = new WeddingReadContext(weddingId, {
          ...options.contextOptions,
          loadWedding,
          seeded: {
            ...(payments
              ? { payments: payments.get(weddingId) ?? [] }
              : {}),
            ...(contracts
              ? { contract: contracts.get(weddingId) ?? null }
              : {}),
            ...(tasks ? { tasks: tasks.get(weddingId) ?? [] } : {}),
          },
        })
        const inspected = await inspectConcept(context, predicate.concept)
        const actual =
          predicate.concept === 'CONTRACT.READINESS' &&
          inspected.value &&
          typeof inspected.value === 'object' &&
          typeof inspected.value.overall === 'string'
            ? inspected.value.overall
            : inspected.value
        return (
          comparable(actual) &&
          compareConceptValue(
            actual,
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
