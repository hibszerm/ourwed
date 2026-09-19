/**
 * V6-F1 — query_collection: create a root ConversationCollection.
 */

import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'
import {
  assertSnapshotSubset,
  v6CollectionStore,
  type ConversationCollection,
} from '../collections/store'
import { applySearchPlanAsync } from '../execution/applyOps'
import { tryCompileSearchToDomainQuery } from '../execution/compileToDomainQuery'
import { loadWeddingUniverseRows } from '../execution/weddingUniverse'
import type { SearchAction } from '../semantics/types'
import { toolFail, type V6ToolResult } from './errors'

export type QueryCollectionSuccess = {
  handle: string
  totalCount: number
  ordering: ConversationCollection['ordering']
  preview: ConversationCollection['preview']
  semanticSummary: {
    source: string
    temporal: SearchAction['relativeTemporal']
    sort: SearchAction['sort']
    slice: SearchAction['slice']
    filters: SearchAction['filters']
    conceptFilters: SearchAction['conceptFilters']
    excludePlace: SearchAction['excludePlace']
  }
  /** Internal IR hint for diagnostics — not conversational SoT. */
  domainQueryCompiled: boolean
}

export async function queryCollection(
  search: SearchAction,
  input?: {
    turnId?: string
    todayKey?: string
    /** Test seam — skip list-light when provided. */
    universeRows?: import('../../v4/capabilities/collection/executeCollectionQuery').CollectionMoneyRow[]
  },
): Promise<V6ToolResult<QueryCollectionSuccess>> {
  if (search.type !== 'Search') {
    return toolFail('VALIDATION_ERROR', 'expected_search_action')
  }
  if (search.source !== 'wedding') {
    return toolFail('UNSUPPORTED_CAPABILITY', 'source_not_wedding')
  }
  if (
    search.slice &&
    (!Number.isInteger(search.slice.limit) ||
      search.slice.limit < 1 ||
      search.slice.limit > 40)
  ) {
    return toolFail('VALIDATION_ERROR', 'slice_limit_invalid')
  }

  const todayKey = input?.todayKey ?? localCalendarDateKey()
  const turnId = input?.turnId ?? 'turn'

  let universe = input?.universeRows
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

  const applied = await applySearchPlanAsync(
    universe,
    {
      filters: search.filters,
      conceptFilters: search.conceptFilters,
      excludePlace: search.excludePlace,
      relativeTemporal: search.relativeTemporal,
      sort: search.sort,
      slice: search.slice,
    },
    todayKey,
  )
  if (!applied.ok) {
    return toolFail(applied.code, applied.detail)
  }

  const rows = applied.rows
  const memberIds = rows.map((r) => r.id)
  // Root search — subset of universe is always true; keep assert for symmetry.
  if (
    !assertSnapshotSubset(
      memberIds,
      universe.map((r) => r.id),
    )
  ) {
    return toolFail('EXECUTION_ERROR', 'snapshot_not_subset_of_universe')
  }

  const dq = tryCompileSearchToDomainQuery(search, todayKey)

  const col = v6CollectionStore.create({
    source: 'wedding',
    semanticDefinition: {
      source: 'wedding',
      filters: [...(search.filters ?? [])],
      conceptFilters: [...(search.conceptFilters ?? [])],
      excludePlaces: search.excludePlace ? [search.excludePlace] : [],
      relativeTemporal: search.relativeTemporal ?? null,
      sort: search.sort ?? applied.sort,
      slice: search.slice ?? null,
      transformOps: [],
    },
    ordering: search.sort ?? applied.sort,
    totalCount: memberIds.length,
    parentHandle: null,
    createdAtTurn: turnId,
    fetchedAt: new Date().toISOString(),
    snapshotMemberIds: memberIds,
    preview: rows.map((r, i) => ({
      displayName: r.displayLabel,
      date: r.date,
      ordinal: i + 1,
    })),
    lineage: [
      {
        parentHandle: null,
        opSummary: 'Search',
        atTurn: turnId,
      },
    ],
  })

  return {
    ok: true,
    data: {
      handle: col.handle,
      totalCount: col.totalCount,
      ordering: col.ordering,
      preview: col.preview,
      semanticSummary: {
        source: 'wedding',
        temporal: search.relativeTemporal ?? null,
        sort: search.sort ?? null,
        slice: search.slice ?? null,
        filters: search.filters,
        conceptFilters: search.conceptFilters,
        excludePlace: search.excludePlace,
      },
      domainQueryCompiled: dq != null,
    },
  }
}
