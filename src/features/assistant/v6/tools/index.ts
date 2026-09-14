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
import { validateV6ToolArguments } from '../agent/validateToolArguments'

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

  if (
    call.name !== 'query_collection' &&
    call.name !== 'transform_collection' &&
    call.name !== 'aggregate_collection' &&
    call.name !== 'restore_collection'
  ) {
    return toolFail('VALIDATION_ERROR', 'unknown_tool')
  }

  const validated = validateV6ToolArguments(call.name, call.arguments)
  if (!validated.ok) {
    return toolFail('VALIDATION_ERROR', validated.detail)
  }
  const args = validated.value

  if (call.name === 'query_collection') {
    const search = args as unknown as SearchAction
    if (search?.type !== 'Search') {
      const coerced: SearchAction = {
        type: 'Search',
        source: (args.source as SearchAction['source']) ?? 'wedding',
        filters: args.filters as SearchAction['filters'],
        excludePlace: args.excludePlace as SearchAction['excludePlace'],
        relativeTemporal:
          args.relativeTemporal as SearchAction['relativeTemporal'],
        sort: args.sort as SearchAction['sort'],
        slice: args.slice as SearchAction['slice'],
      }
      return queryCollection(coerced, ctx)
    }
    return queryCollection(search, ctx)
  }

  if (call.name === 'transform_collection') {
    const parentHandle = String(args.parentHandle ?? '')
    const ops = args.ops as V6FilterOp[]
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
      collection: String(args.collection ?? ''),
      aggregation: args.aggregation as AggregateAction['aggregation'],
      measure: (args.measure as AggregateAction['measure']) ?? null,
    }
    return aggregateCollection(action)
  }

  if (call.name === 'restore_collection') {
    return restoreCollection({
      type: 'Restore',
      collection: String(args.collection ?? ''),
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
