/**
 * S4A — Shadow resolve via GoalEnvelope (no production wiring).
 *
 * Path:
 * Legacy GoalSpec
 * → adaptGoalSpecToGoalEnvelope (no U4.7)
 * → if QueryGoal: project → bindGoalSpecWithClarification
 * → else: unsupported
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import { adaptGoalSpecToGoalEnvelope } from './adaptGoalSpecToGoalEnvelope'
import { isQueryGoal, type GoalEnvelope } from './goalEnvelope'
import type { GoalSpec } from './goalSpec'
import { projectQueryGoalToLegacyGoalSpec } from './projectQueryGoalToLegacyGoalSpec'
import {
  bindGoalSpecWithClarification,
} from './resumeGoalClarification'
import type { GoalBinderContext } from './binderTypes'

export type EnvelopeShadowResult =
  | {
      status: 'bound'
      envelope: GoalEnvelope
      query: DomainQuery
      measure: string | null
      source: string
    }
  | {
      status: 'needs_clarification'
      envelope: GoalEnvelope
      slot: string
    }
  | {
      status: 'unsupported'
      envelope: GoalEnvelope
      reason: string
    }

export function resolveViaGoalEnvelopeShadow(
  goal: GoalSpec,
  ctx?: {
    activeCollectionQuery?: DomainQuery | null
    activeResource?: GoalBinderContext['activeResource']
  },
): EnvelopeShadowResult {
  const envelope = adaptGoalSpecToGoalEnvelope(goal)

  if (!isQueryGoal(envelope)) {
    return {
      status: 'unsupported',
      envelope,
      reason: `envelope_${envelope.kind}`,
    }
  }

  const projected = projectQueryGoalToLegacyGoalSpec(envelope)
  const bound = bindGoalSpecWithClarification({
    goal: projected,
    activeCollectionQuery: ctx?.activeCollectionQuery ?? null,
    activeResource: ctx?.activeResource ?? null,
    storePending: false,
  })

  if (bound.status === 'bound') {
    return {
      status: 'bound',
      envelope,
      query: bound.query,
      measure: bound.goal.measure,
      source: bound.goal.source,
    }
  }
  if (bound.status === 'needs_clarification') {
    return {
      status: 'needs_clarification',
      envelope,
      slot: bound.request.slot,
    }
  }
  return {
    status: 'unsupported',
    envelope,
    reason: bound.reason,
  }
}
