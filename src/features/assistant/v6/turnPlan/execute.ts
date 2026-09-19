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
import { inspectWeddingPlaceDetail } from '../detail/inspectWeddingPlace'
import {
  inspectResourceConcepts,
  listRelated,
  type InspectResourceConceptsResult,
  type ListRelatedResult,
} from '../adapters'
import { V6_BUSINESS_CONCEPTS } from '../registry'
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
  /** Test seam for wedding place detail inspection. */
  inspectWeddingPlace?: typeof inspectWeddingPlaceDetail
  /** Test seams for CRA2 resource adapters. */
  inspectResource?: (input: {
    collectionHandle: string
    concepts: import('../registry').ConceptKey[]
  }) => Promise<InspectResourceConceptsResult>
  listRelatedResources?: (input: {
    collectionHandle: string
    relationKey: import('../registry').RelationKey
    limit?: number
  }) => Promise<ListRelatedResult>
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
      continue
    }

    if (step.kind === 'INSPECT_WEDDING') {
      const collectionHandle = resolveInputHandle(step, stepHandleById)
      if (!collectionHandle) {
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: 'REFERENCE_RESOLUTION_ERROR',
          detail: 'inspect_collection_unresolved',
          toolName: 'inspect_wedding',
          toolArgs: {
            detailSelector: step.detailSelector,
            collectionHandle: null,
          },
        })
        break
      }
      const inspect = input.inspectWeddingPlace ?? inspectWeddingPlaceDetail
      const result = await inspect({
        collectionHandle,
        selector: step.detailSelector,
      })
      if (!result.ok) {
        if (result.code === 'COLLECTION_AMBIGUOUS') {
          executed.push({
            stepId: step.id,
            kind: step.kind,
            ok: true,
            observation: {
              kind: 'clarification',
              slot: 'wedding',
              reason:
                'Doprecyzuj, o które zlecenie chodzi — w bieżącym zbiorze jest więcej niż jeden ślub.',
            },
            toolName: 'inspect_wedding',
            toolArgs: {
              detailSelector: step.detailSelector,
              collectionHandle,
            },
          })
          continue
        }
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: result.code,
          detail: result.detail,
          toolName: 'inspect_wedding',
          toolArgs: {
            detailSelector: step.detailSelector,
            collectionHandle,
          },
        })
        break
      }
      executed.push({
        stepId: step.id,
        kind: step.kind,
        ok: true,
        observation: result.observation,
        toolName: 'inspect_wedding',
        toolArgs: {
          detailSelector: step.detailSelector,
          collectionHandle,
        },
      })
      continue
    }

    if (step.kind === 'INSPECT_RESOURCE') {
      const collectionHandle = resolveInputHandle(step, stepHandleById)
      const toolArgs = {
        collectionHandle,
        concepts: step.concepts,
      }
      if (!collectionHandle) {
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: 'REFERENCE_RESOLUTION_ERROR',
          detail: 'inspect_resource_collection_unresolved',
          toolName: 'inspect_resource',
          toolArgs,
        })
        break
      }
      const result = await (
        input.inspectResource ?? inspectResourceConcepts
      )({ collectionHandle, concepts: step.concepts })
      if (!result.ok) {
        if (result.code === 'COLLECTION_AMBIGUOUS') {
          executed.push({
            stepId: step.id,
            kind: step.kind,
            ok: true,
            observation: {
              kind: 'clarification',
              slot: 'wedding',
              reason:
                'Doprecyzuj, o które zlecenie chodzi — w bieżącym zbiorze jest więcej niż jeden ślub.',
            },
            toolName: 'inspect_resource',
            toolArgs,
          })
          continue
        }
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: result.code,
          detail: result.detail,
          toolName: 'inspect_resource',
          toolArgs,
        })
        break
      }
      executed.push({
        stepId: step.id,
        kind: step.kind,
        ok: true,
        observation: {
          kind: 'resource_detail',
          resource: result.observation.resource,
          weddingDisplayName: result.observation.weddingDisplayName,
          values: result.observation.values.map((value) => ({
            ...value,
            value:
              value.value == null ||
              typeof value.value === 'string' ||
              typeof value.value === 'number' ||
              typeof value.value === 'boolean'
                ? value.value
                : (value.displayText ?? JSON.stringify(value.value)),
          })),
        },
        toolName: 'inspect_resource',
        toolArgs,
      })
      continue
    }

    if (step.kind === 'LIST_RELATED') {
      const collectionHandle = resolveInputHandle(step, stepHandleById)
      const toolArgs = {
        collectionHandle,
        relation: step.relation,
        limit: step.limit,
      }
      if (!collectionHandle) {
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: 'REFERENCE_RESOLUTION_ERROR',
          detail: 'list_related_collection_unresolved',
          toolName: 'list_related',
          toolArgs,
        })
        break
      }
      const result = await (
        input.listRelatedResources ?? listRelated
      )({
        collectionHandle,
        relationKey: step.relation,
        ...(step.limit == null ? {} : { limit: step.limit }),
      })
      if (!result.ok) {
        if (result.code === 'COLLECTION_AMBIGUOUS') {
          executed.push({
            stepId: step.id,
            kind: step.kind,
            ok: true,
            observation: {
              kind: 'clarification',
              slot: 'wedding',
              reason:
                'Doprecyzuj, o które zlecenie chodzi — w bieżącym zbiorze jest więcej niż jeden ślub.',
            },
            toolName: 'list_related',
            toolArgs,
          })
          continue
        }
        executed.push({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          code: result.code,
          detail: result.detail,
          toolName: 'list_related',
          toolArgs,
        })
        break
      }
      const relationDefinition = V6_BUSINESS_CONCEPTS.find(
        (concept) =>
          'relationKey' in concept && concept.relationKey === step.relation,
      )
      executed.push({
        stepId: step.id,
        kind: step.kind,
        ok: true,
        observation: {
          kind: 'related_list',
          relation: step.relation,
          relationLabel: relationDefinition?.polishLabel ?? step.relation,
          weddingDisplayName: result.weddingDisplayName,
          items: result.result.items,
          totalCount: result.result.totalCount,
          truncated: result.result.truncated,
        },
        toolName: 'list_related',
        toolArgs,
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
