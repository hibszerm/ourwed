/**
 * G6 — Migration adapter: ResolvedTask → GoalSpec.
 * Structural only. No utterance / regex / phrase parsing.
 * Temporary bridge while TaskSpec remains the live interpreter envelope.
 */

import type { ResolvedTask } from '../resolver/types'
import type { AssistantTaskSpec } from '../taskSpec'
import {
  emptyGoalSpec,
  type GoalAggregation,
  type GoalDialogueOp,
  type GoalRequestKind,
  type GoalSpec,
  type NamedEntityKindHint,
  type PlaceRoleHint,
} from './goalSpec'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'

function mapMeasure(subject: ResolvedTask['subject']): SemanticFieldId | null {
  if (subject === 'contract_value') return 'wedding.contract_value'
  if (subject === 'paid') return 'wedding.paid_amount'
  if (subject === 'remaining') return 'wedding.remaining_amount'
  return null
}

function mapAggregation(op: ResolvedTask['op']): GoalAggregation {
  if (op === 'count') return 'count'
  if (op === 'sum' || op === 'get_amount') return 'sum'
  if (op === 'list') return 'list'
  if (op === 'rank') return 'rank'
  return null
}

function mapDialogue(spec: AssistantTaskSpec): GoalDialogueOp {
  if (spec.op === 'correction') return 'correct'
  if (spec.op === 'inherit') return 'inherit'
  if (spec.fieldSource.resource === 'inherit') return 'inherit'
  return 'ask'
}

function mapSource(resolved: ResolvedTask): NamedEntityKindHint | null {
  if (resolved.collection?.resource === 'sessions') return 'session'
  if (resolved.subject === 'session') return 'session'
  if (resolved.subject === 'task') return 'task'
  if (resolved.subject === 'payment' || resolved.subject === 'deposit') {
    return 'payment'
  }
  return 'wedding'
}

function mapRequestKind(resolved: ResolvedTask): GoalRequestKind {
  if (resolved.op === 'unsupported') return 'unsupported'
  if (resolved.op === 'prepare_create') return 'prepare_action'
  if (resolved.op === 'open') return 'product_help'
  if (
    resolved.op === 'count' ||
    resolved.op === 'sum' ||
    resolved.op === 'list' ||
    resolved.op === 'rank' ||
    resolved.op === 'get_amount' ||
    resolved.op === 'get' ||
    resolved.op === 'get_location' ||
    resolved.op === 'get_time' ||
    resolved.op === 'inherit'
  ) {
    return 'domain_query'
  }
  return 'unsupported'
}

/**
 * Adapt post-resolution structured semantics into GoalSpec.
 * Uses ResolvedTask slots only — never raw text heuristics.
 */
export function adaptResolvedTaskToGoalSpec(resolved: ResolvedTask): GoalSpec {
  const spec = resolved.sourceTaskSpec
  const requestKind = mapRequestKind(resolved)
  const aggregation = mapAggregation(resolved.op)
  const measure = mapMeasure(resolved.subject)
  const source = mapSource(resolved)

  const filters = resolved.collection?.filters
  const locationQuery = filters?.locationQuery?.trim() || null
  const locationRole = filters?.locationRole ?? null
  const roleHint: PlaceRoleHint | null =
    locationRole === 'preparations' ||
    locationRole === 'ceremony' ||
    locationRole === 'reception'
      ? locationRole
      : null

  const relations: GoalSpec['relations'] = []
  if (locationQuery && locationQuery.length >= 2) {
    relations.push({
      relation: 'place',
      field: 'place.name',
      op: 'contains',
      value: {
        text: locationQuery,
        kindHint: 'venue',
        roleHint,
      },
    })
  }
  if (roleHint) {
    relations.push({
      relation: 'place',
      field: 'place.role',
      op: 'eq',
      value: roleHint,
    })
  }

  // titleHint on merged TaskSpec may still carry venue text when collection
  // filters were not yet projected — prefer filters; fall back structurally.
  const titleHint = resolved.qualifiers.titleHint?.trim() || null
  if (
    titleHint &&
    titleHint.length >= 2 &&
    !relations.some((r) => r.field === 'place.name')
  ) {
    const dest = resolved.qualifiers.destination
    relations.push({
      relation: 'place',
      field: 'place.name',
      op: 'contains',
      value: {
        text: titleHint,
        kindHint: 'venue',
        roleHint:
          dest === 'preparations' || dest === 'ceremony' || dest === 'reception'
            ? dest
            : null,
      },
    })
  }

  const from =
    resolved.temporal?.from ?? filters?.dateRange?.from ?? null
  const to = resolved.temporal?.to ?? filters?.dateRange?.to ?? null
  const expression = resolved.temporal?.phrase ?? null

  const temporal =
    expression || (from && to)
      ? {
          expression,
          resolvedRange: from && to ? { from, to } : null,
          // Post-resolution collection slice binds wedding.date when range exists.
          dateDimension:
            from && to ? ('wedding.date' as const) : null,
          dateDimensionAmbiguous: false,
        }
      : null

  const targets: GoalSpec['targets'] = []
  if (
    resolved.collection ||
    resolved.sourceTaskSpec.resource?.kind === 'active_collection' ||
    resolved.mergedTaskSpec.resource?.kind === 'active_collection' ||
    resolved.sourceTaskSpec.fieldSource.resource === 'inherit' ||
    resolved.mergedTaskSpec.fieldSource.resource === 'inherit'
  ) {
    targets.push({ kind: 'active_collection' })
  }
  if (resolved.resource) {
    targets.push({
      kind: 'bound',
      entityKind: 'wedding',
      id: resolved.resource.id,
    })
  }

  const ambiguities: GoalSpec['ambiguities'] = []
  if (aggregation === 'sum' && !measure) {
    ambiguities.push({
      slot: 'measure',
      reason: 'sum_requires_measure',
    })
  }

  const inheritance =
    targets.some((t) => t.kind === 'active_collection') ||
    spec.fieldSource.resource === 'inherit'
      ? {
          fromActiveCollection: true,
          fromPrevious: spec.fieldSource.op === 'inherit',
        }
      : null

  return emptyGoalSpec({
    requestKind,
    dialogue: mapDialogue(spec),
    source,
    targets,
    temporal,
    measure,
    aggregation:
      resolved.op === 'list'
        ? 'list'
        : aggregation,
    relations,
    ambiguities,
    correction:
      spec.correction && spec.correction.targetSlot
        ? {
            targetSlot: spec.correction.targetSlot,
            patch: { ...spec.correction.patch },
          }
        : null,
    inheritance,
    unsupportedReason: resolved.qualifiers.unsupportedReason,
  })
}
