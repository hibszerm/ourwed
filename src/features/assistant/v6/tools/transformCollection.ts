/**
 * V6-F1 — transform_collection: derive child from parent SNAPSHOT membership.
 * Hard invariant: child.snapshotMemberIds ⊆ parent.snapshotMemberIds
 */

import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import {
  assertSnapshotSubset,
  v6CollectionStore,
  type ConversationCollection,
} from '../collections/store'
import { applyTransformOps } from '../execution/applyOps'
import {
  loadWeddingUniverseRows,
  rowsByIds,
} from '../execution/weddingUniverse'
import type { V6FilterOp } from '../semantics/types'
import { toolFail, type V6ToolResult } from './errors'

export type TransformCollectionInput = {
  parentHandle: string
  ops: V6FilterOp[]
  turnId?: string
  todayKey?: string
  /** Test seam — skip list-light when provided. */
  universeRows?: import('../../v4/capabilities/collection/executeCollectionQuery').CollectionMoneyRow[]
}

export type TransformCollectionSuccess = {
  handle: string
  parentHandle: string
  totalCount: number
  ordering: ConversationCollection['ordering']
  preview: ConversationCollection['preview']
  semanticSummary: {
    ops: V6FilterOp[]
    parentHandle: string
  }
}

function summarizeOps(ops: V6FilterOp[]): string {
  return ops.map((o) => o.op).join('+')
}

export async function transformCollection(
  input: TransformCollectionInput,
): Promise<V6ToolResult<TransformCollectionSuccess>> {
  if (!input.parentHandle?.trim()) {
    return toolFail('VALIDATION_ERROR', 'parent_handle_missing')
  }
  if (!Array.isArray(input.ops) || input.ops.length === 0) {
    return toolFail('VALIDATION_ERROR', 'ops_required')
  }

  const parent = v6CollectionStore.get(input.parentHandle)
  if (!parent) {
    return toolFail('REFERENCE_RESOLUTION_ERROR', 'unknown_collection_handle')
  }

  const todayKey = input.todayKey ?? localCalendarDateKey()
  const turnId = input.turnId ?? 'turn'

  let universe = input.universeRows
  if (!universe) {
    try {
      universe = await loadWeddingUniverseRows()
    } catch (e) {
      return toolFail(
        'EXECUTION_ERROR',
        e instanceof Error ? e.message : 'universe_load_failed',
      )
    }
  }

  // Membership-constrained: start from parent snapshot order, not rematerialize.
  const baseRows = rowsByIds(universe, parent.snapshotMemberIds)
  if (baseRows.length !== parent.snapshotMemberIds.length) {
    // Some members missing from current universe — fail closed (stale), do not widen.
    return toolFail('STALE_COLLECTION', 'parent_members_missing_from_universe')
  }

  const applied = applyTransformOps(baseRows, input.ops, todayKey)
  if (!applied.ok) {
    return toolFail(applied.code, applied.detail)
  }

  const childIds = applied.rows.map((r) => r.id)
  if (!assertSnapshotSubset(childIds, parent.snapshotMemberIds)) {
    return toolFail('EXECUTION_ERROR', 'child_not_subset_of_parent_snapshot')
  }

  const def = parent.semanticDefinition
  const nextFilters = [...def.filters]
  const nextExcludes = [...def.excludePlaces]
  let nextTemporal = def.relativeTemporal
  let nextSort = applied.sort ?? def.sort
  let nextSlice = def.slice

  for (const op of input.ops) {
    if (op.op === 'Filter') nextFilters.push(op.place)
    if (op.op === 'Exclude' && op.by === 'place_contains' && op.placeValue) {
      nextExcludes.push({
        field: 'place.name',
        op: 'contains',
        value: op.placeValue,
        role: op.placeRole ?? 'any',
      })
    }
    if (op.op === 'RelativeTemporal') nextTemporal = op.temporal
    if (op.op === 'Sort') nextSort = op.sort
    if (op.op === 'Slice') nextSlice = op.slice
  }

  const col = v6CollectionStore.create({
    source: parent.source,
    semanticDefinition: {
      source: parent.source,
      filters: nextFilters,
      excludePlaces: nextExcludes,
      relativeTemporal: nextTemporal,
      sort: nextSort,
      slice: nextSlice,
      transformOps: [...def.transformOps, ...input.ops],
    },
    ordering: nextSort,
    totalCount: childIds.length,
    parentHandle: parent.handle,
    createdAtTurn: turnId,
    fetchedAt: new Date().toISOString(),
    snapshotMemberIds: childIds,
    preview: applied.rows.map((r, i) => ({
      displayName: r.displayLabel,
      date: r.date,
      ordinal: i + 1,
    })),
    lineage: [
      ...parent.lineage,
      {
        parentHandle: parent.handle,
        opSummary: summarizeOps(input.ops),
        atTurn: turnId,
      },
    ],
  })

  return {
    ok: true,
    data: {
      handle: col.handle,
      parentHandle: parent.handle,
      totalCount: col.totalCount,
      ordering: col.ordering,
      preview: col.preview,
      semanticSummary: {
        ops: input.ops,
        parentHandle: parent.handle,
      },
    },
  }
}
