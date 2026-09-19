/**
 * V6-F1 — aggregate_collection: canonical finance only over snapshot members.
 */

import { weddingListLightService } from '@/lib/api/weddingListLightService'
import { getContractValue } from '@/lib/utils/commercial'
import { getRemainingToPay, getTotalPaid } from '@/lib/utils/finance'
import { v6CollectionStore } from '../collections/store'
import type { AggregateAction } from '../semantics/types'
import {
  getConcept,
  resolveAggregateConcept,
} from '../registry'
import {
  inspectConcept,
  WeddingReadContext,
  V6_CROSS_DOMAIN_CANDIDATE_CAP,
} from '../adapters'
import { toolFail, type V6ToolResult } from './errors'

export type AggregateCollectionSuccess = {
  kind: 'money_aggregate' | 'count_result'
  collectionHandle: string
  aggregation: 'count' | 'sum'
  measure: string | null
  value: number
  currency: 'PLN'
  provenance: 'canonical_finance' | 'collection_count'
  memberCount: number
}

export async function aggregateCollection(
  action: AggregateAction,
  input?: {
    /** Test seam */
    weddings?: Array<{
      id: string
      price: number
      payments?: import('@/types/wedding').Payment[]
    }>
  },
): Promise<V6ToolResult<AggregateCollectionSuccess>> {
  if (action.type !== 'Aggregate') {
    return toolFail('VALIDATION_ERROR', 'expected_aggregate_action')
  }
  if (!action.collection?.trim()) {
    return toolFail('VALIDATION_ERROR', 'collection_handle_missing')
  }

  const col = v6CollectionStore.get(action.collection)
  if (!col) {
    return toolFail('REFERENCE_RESOLUTION_ERROR', 'unknown_collection_handle')
  }

  v6CollectionStore.setActive(col.handle)

  if (action.aggregation === 'count') {
    return {
      ok: true,
      data: {
        kind: 'count_result',
        collectionHandle: col.handle,
        aggregation: 'count',
        measure: null,
        value: col.totalCount,
        currency: 'PLN',
        provenance: 'collection_count',
        memberCount: col.snapshotMemberIds.length,
      },
    }
  }

  if (action.aggregation !== 'sum') {
    return toolFail('UNSUPPORTED_CAPABILITY', 'aggregation_not_supported')
  }
  if (!action.measure) {
    return toolFail('VALIDATION_ERROR', 'sum_requires_measure')
  }

  const measure = action.measure
  const concept = resolveAggregateConcept(measure)
  if (
    !concept ||
    !(getConcept(concept).operations as readonly string[]).includes(
      'aggregate_sum',
    )
  ) {
    return toolFail('UNSUPPORTED_CAPABILITY', 'measure_not_supported')
  }

  const legacyMeasure =
    concept === 'FIN.CONTRACT_VALUE'
      ? 'contract_value'
      : concept === 'FIN.TOTAL_PAID'
        ? 'paid_amount'
        : concept === 'FIN.REMAINING_TO_PAY'
          ? 'remaining_amount'
          : null

  if (!legacyMeasure) {
    if (col.snapshotMemberIds.length > V6_CROSS_DOMAIN_CANDIDATE_CAP) {
      return toolFail(
        'UNSUPPORTED_CAPABILITY',
        `CANDIDATE_CAP_EXCEEDED:candidate_count:${col.snapshotMemberIds.length}`,
      )
    }
    try {
      const values = await Promise.all(
        col.snapshotMemberIds.map(async (weddingId) => {
          const inspected = await inspectConcept(
            new WeddingReadContext(weddingId),
            concept,
          )
          return inspected.value
        }),
      )
      if (!values.every((value) => typeof value === 'number')) {
        return toolFail('EXECUTION_ERROR', `non_numeric_measure:${concept}`)
      }
      return {
        ok: true,
        data: {
          kind: 'money_aggregate',
          collectionHandle: col.handle,
          aggregation: 'sum',
          measure,
          value: (values as number[]).reduce((sum, value) => sum + value, 0),
          currency: 'PLN',
          provenance: 'canonical_finance',
          memberCount: col.snapshotMemberIds.length,
        },
      }
    } catch {
      return toolFail('EXECUTION_ERROR', `aggregate_concept_failed:${concept}`)
    }
  }

  let weddings = input?.weddings
  if (!weddings) {
    try {
      weddings = await weddingListLightService.listWeddingsForList()
    } catch (e) {
      return toolFail(
        'EXECUTION_ERROR',
        e instanceof Error ? e.message : 'wedding_load_failed',
      )
    }
  }

  const byId = new Map(weddings.map((w) => [w.id, w]))
  let sum = 0
  for (const id of col.snapshotMemberIds) {
    const w = byId.get(id)
    if (!w) {
      return toolFail('STALE_COLLECTION', 'member_missing_for_aggregate')
    }
    if (legacyMeasure === 'contract_value') {
      sum += getContractValue(w)
    } else if (legacyMeasure === 'paid_amount') {
      sum += getTotalPaid(w.payments ?? [])
    } else {
      sum += getRemainingToPay(getContractValue(w), w.payments ?? [])
    }
  }

  return {
    ok: true,
    data: {
      kind: 'money_aggregate',
      collectionHandle: col.handle,
      aggregation: 'sum',
      measure,
      value: sum,
      currency: 'PLN',
      provenance: 'canonical_finance',
      memberCount: col.snapshotMemberIds.length,
    },
  }
}
