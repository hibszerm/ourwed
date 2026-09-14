/**
 * V6-F1.4 — Deterministic TurnPlan executor (application advances steps).
 */

import {
  observationFromAggregate,
  observationFromQuery,
  observationFromTransform,
  type V6Observation,
} from '../observations/adapt'
import { queryCollection } from '../tools/queryCollection'
import { transformCollection } from '../tools/transformCollection'
import { aggregateCollection } from '../tools/aggregateCollection'
import { restoreCollection } from '../tools/restoreCollection'
import { checkPlanCompleteness } from './completeness'
import type {
  V6ExecutedStepRecord,
  V6PlanExecutionResult,
  V6TurnPlan,
} from './types'

export type ExecuteTurnPlanInput = {
  plan: V6TurnPlan
  turnId: string
  todayKey?: string
  universeRows?: import('../../v4/capabilities/collection/executeCollectionQuery').CollectionMoneyRow[]
  weddings?: Array<{
    id: string
    price: number
    payments?: import('@/types/wedding').Payment[]
  }>
}

function resolveInputHandle(
  step: {
    inputFromStep: string | null
    inputHandle: string | null
  },
  stepHandleById: Record<string, string>,
): string | null {
  if (step.inputFromStep) {
    return stepHandleById[step.inputFromStep] ?? null
  }
  return step.inputHandle
}

export async function executeTurnPlan(
  input: ExecuteTurnPlanInput,
): Promise<V6PlanExecutionResult> {
  const { plan } = input
  const executed: V6ExecutedStepRecord[] = []
  const stepHandleById: Record<string, string> = {}
  const aggregateByStepId: Record<string, V6Observation> = {}

  // Clarification / Unsupported: no business execution
  if (
    plan.output.kind === 'CLARIFICATION' ||
    plan.output.kind === 'UNSUPPORTED'
  ) {
    const completeness = checkPlanCompleteness({
      plan,
      executed,
      aggregateByStepId,
    })
    return {
      plan,
      executed,
      stepHandleById,
      aggregateByStepId,
      completeness,
    }
  }

  for (const step of plan.steps) {
    if (step.kind === 'SEARCH_COLLECTION') {
      const result = await queryCollection(step.search, {
        turnId: input.turnId,
        todayKey: input.todayKey,
        universeRows: input.universeRows,
      })
      if (!result.ok) {
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: result.code,
          detail: result.detail,
          toolName: 'query_collection',
          toolArgs: { ...step.search },
        })
        break
      }
      stepHandleById[step.id] = result.data.handle
      const observation = observationFromQuery(result.data)
      executed.push({
        stepId: step.id,
        kind: step.kind,
        ok: true,
        outputHandle: result.data.handle,
        observation,
        toolName: 'query_collection',
        toolArgs: { ...step.search },
      })
      continue
    }

    if (step.kind === 'TRANSFORM_COLLECTION') {
      const parentHandle = resolveInputHandle(step, stepHandleById)
      if (!parentHandle) {
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: 'REFERENCE_RESOLUTION_ERROR',
          detail: 'transform_parent_unresolved',
          toolName: 'transform_collection',
          toolArgs: { parentHandle: '', ops: step.ops },
        })
        break
      }
      const result = await transformCollection({
        parentHandle,
        ops: step.ops,
        turnId: input.turnId,
        todayKey: input.todayKey,
        universeRows: input.universeRows,
      })
      if (!result.ok) {
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: result.code,
          detail: result.detail,
          toolName: 'transform_collection',
          toolArgs: { parentHandle, ops: step.ops },
        })
        break
      }
      stepHandleById[step.id] = result.data.handle
      executed.push({
        stepId: step.id,
        kind: step.kind,
        ok: true,
        outputHandle: result.data.handle,
        observation: observationFromTransform(result.data),
        toolName: 'transform_collection',
        toolArgs: { parentHandle, ops: step.ops },
      })
      continue
    }

    if (step.kind === 'AGGREGATE_COLLECTION') {
      const collection = resolveInputHandle(step, stepHandleById)
      if (!collection) {
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: 'REFERENCE_RESOLUTION_ERROR',
          detail: 'aggregate_collection_unresolved',
          toolName: 'aggregate_collection',
          toolArgs: {
            type: 'Aggregate',
            collection: '',
            aggregation: step.aggregation,
            measure: step.measure,
          },
        })
        break
      }
      const result = await aggregateCollection(
        {
          type: 'Aggregate',
          collection,
          aggregation: step.aggregation,
          measure: step.measure,
        },
        { weddings: input.weddings },
      )
      if (!result.ok) {
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: result.code,
          detail: result.detail,
          toolName: 'aggregate_collection',
          toolArgs: {
            type: 'Aggregate',
            collection,
            aggregation: step.aggregation,
            measure: step.measure,
          },
        })
        break
      }
      const observation = observationFromAggregate(result.data)
      aggregateByStepId[step.id] = observation
      executed.push({
        stepId: step.id,
        kind: step.kind,
        ok: true,
        outputHandle: collection,
        observation,
        toolName: 'aggregate_collection',
        toolArgs: {
          type: 'Aggregate',
          collection,
          aggregation: step.aggregation,
          measure: step.measure,
        },
      })
      continue
    }

    if (step.kind === 'RESTORE_COLLECTION') {
      const result = restoreCollection({
        type: 'Restore',
        collection: step.inputHandle,
      })
      if (!result.ok) {
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: result.code,
          detail: result.detail,
          toolName: 'restore_collection',
          toolArgs: { type: 'Restore', collection: step.inputHandle },
        })
        break
      }
      stepHandleById[step.id] = result.data.handle
      executed.push({
        stepId: step.id,
        kind: step.kind,
        ok: true,
        outputHandle: result.data.handle,
        observation: {
          kind: 'collection_result',
          handle: result.data.handle,
          totalCount: result.data.totalCount,
          preview: result.data.preview,
        },
        toolName: 'restore_collection',
        toolArgs: { type: 'Restore', collection: step.inputHandle },
      })
    }
  }

  const completeness = checkPlanCompleteness({
    plan,
    executed,
    aggregateByStepId,
  })

  return {
    plan,
    executed,
    stepHandleById,
    aggregateByStepId,
    completeness,
  }
}
