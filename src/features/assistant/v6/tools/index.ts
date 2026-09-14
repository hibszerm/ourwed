/**
 * V6-F1 — Tool dispatcher (read-only).
 */

import type { AggregateAction, SearchAction } from '../semantics/types'
import { aggregateCollection } from './aggregateCollection'
import { queryCollection } from './queryCollection'
import { restoreCollection } from './restoreCollection'
import { transformCollection } from './transformCollection'
import type { V6FilterOp } from '../semantics/types'
import type { V6ToolResult } from './errors'
import { toolFail } from './errors'

export type V6ToolName =
  | 'query_collection'
  | 'transform_collection'
  | 'aggregate_collection'
  | 'restore_collection'
  | 'prepare_action'

export type V6ToolCall = {
  name: V6ToolName
  arguments: Record<string, unknown>
}

export async function executeV6Tool(
  call: V6ToolCall,
  ctx?: { turnId?: string; todayKey?: string },
): Promise<V6ToolResult<unknown>> {
  if (call.name === 'prepare_action') {
    return toolFail('UNSUPPORTED_CAPABILITY', 'prepare_action_disabled_f1')
  }

  if (call.name === 'query_collection') {
    const search = call.arguments as unknown as SearchAction
    if (search?.type !== 'Search') {
      // Allow bare search payload without type tag from model
      const coerced: SearchAction = {
        type: 'Search',
        source: (call.arguments.source as SearchAction['source']) ?? 'wedding',
        filters: call.arguments.filters as SearchAction['filters'],
        excludePlace: call.arguments.excludePlace as SearchAction['excludePlace'],
        relativeTemporal:
          call.arguments.relativeTemporal as SearchAction['relativeTemporal'],
        sort: call.arguments.sort as SearchAction['sort'],
        slice: call.arguments.slice as SearchAction['slice'],
      }
      return queryCollection(coerced, ctx)
    }
    return queryCollection(search, ctx)
  }

  if (call.name === 'transform_collection') {
    const parentHandle = String(call.arguments.parentHandle ?? '')
    const ops = call.arguments.ops as V6FilterOp[]
    return transformCollection({
      parentHandle,
      ops,
      turnId: ctx?.turnId,
      todayKey: ctx?.todayKey,
    })
  }

  if (call.name === 'aggregate_collection') {
    const action: AggregateAction = {
      type: 'Aggregate',
      collection: String(call.arguments.collection ?? ''),
      aggregation: call.arguments.aggregation as AggregateAction['aggregation'],
      measure: (call.arguments.measure as AggregateAction['measure']) ?? null,
    }
    return aggregateCollection(action)
  }

  if (call.name === 'restore_collection') {
    return restoreCollection({
      type: 'Restore',
      collection: String(call.arguments.collection ?? ''),
    })
  }

  return toolFail('VALIDATION_ERROR', 'unknown_tool')
}

export {
  queryCollection,
  transformCollection,
  aggregateCollection,
  restoreCollection,
}
