/**
 * Deterministic V4 Context Resolver — shadow / test only.
 * No LLM. No CRM capability execution. No V3 mutation.
 */

import {
  matchParticipantByNameQuery,
  matchParticipantByRoleLanguage,
  type AssistantParticipantCandidate,
} from '../../api/participants'
import { polishPersonSearchQueries } from '../../api/intentParse'
import { resolveAggregateDateRange } from '../../dates'
import {
  emptyQualifiers,
  type AssistantTaskSpec,
  type TaskPatch,
  type TaskReference,
} from '../taskSpec'
import { lookupTaskRequirement } from './requirements'
import { extractInheritedSemanticsFromDomainQuery } from '../domainQuery/extractInheritedSemantics'
import {
  type NeedsClarification,
  type NormalizedTemporalSemantic,
  type ResolvedTask,
  type ResolvedTaskResult,
  type V4SafeCandidate,
  type V4SafeParticipantRef,
  type V4SafeResourceRef,
  type V4ShadowContext,
} from './types'

function cloneSpec(spec: AssistantTaskSpec): AssistantTaskSpec {
  return {
    ...spec,
    resource: spec.resource ? { ...spec.resource } : null,
    participant: spec.participant ? { ...spec.participant } : null,
    temporal: spec.temporal ? { ...spec.temporal } : null,
    qualifiers: { ...spec.qualifiers },
    correction: spec.correction
      ? {
          targetSlot: spec.correction.targetSlot,
          patch: { ...spec.correction.patch },
        }
      : null,
    fieldSource: { ...spec.fieldSource },
  }
}

function applyPatch(
  base: AssistantTaskSpec,
  patch: TaskPatch,
): AssistantTaskSpec {
  const next = cloneSpec(base)
  if (patch.subject !== undefined && patch.subject !== null) {
    next.subject = patch.subject
  }
  if (patch.participant !== undefined && patch.participant !== null) {
    next.participant = patch.participant
  }
  if (patch.resource !== undefined && patch.resource !== null) {
    next.resource = patch.resource
  }
  if (patch.temporal !== undefined && patch.temporal !== null) {
    next.temporal = patch.temporal
  }
  if (patch.aspect !== undefined && patch.aspect !== null) {
    next.qualifiers.aspect = patch.aspect
  }
  if (patch.rank !== undefined && patch.rank !== null) {
    next.qualifiers.rank = patch.rank
  }
  if (patch.destination !== undefined && patch.destination !== null) {
    next.qualifiers.destination = patch.destination
  }
  return next
}

/** Merge inherit / correction onto previousTaskSpec. Explicit fields win. */
export function mergeTaskSpecWithContext(
  spec: AssistantTaskSpec,
  previous: AssistantTaskSpec | null,
): AssistantTaskSpec | { error: 'no_previous' } {
  if (spec.op === 'unsupported') return cloneSpec(spec)

  if (spec.op === 'correction') {
    if (!previous) return { error: 'no_previous' }
    const patch = spec.correction?.patch ?? {}
    const merged = applyPatch(previous, patch)
    if (
      previous.op === 'inherit' ||
      previous.op === 'correction' ||
      previous.op === 'unsupported'
    ) {
      merged.op = previous.subject ? 'get_location' : 'get'
    } else {
      merged.op = previous.op
    }
    merged.correction = null
    return merged
  }

  if (spec.op === 'inherit') {
    if (!previous) return { error: 'no_previous' }
    const merged = cloneSpec(previous)
    if (
      previous.op !== 'inherit' &&
      previous.op !== 'correction' &&
      previous.op !== 'unsupported'
    ) {
      merged.op = previous.op
    } else {
      merged.op = 'get_location'
    }
    // Explicit current fields override
    if (spec.participant) merged.participant = spec.participant
    if (spec.subject) merged.subject = spec.subject
    if (spec.resource) merged.resource = spec.resource
    if (spec.temporal) merged.temporal = spec.temporal
    if (spec.qualifiers.aspect) merged.qualifiers.aspect = spec.qualifiers.aspect
    if (spec.qualifiers.rank) merged.qualifiers.rank = spec.qualifiers.rank
    if (spec.qualifiers.destination) {
      merged.qualifiers.destination = spec.qualifiers.destination
    }
    merged.correction = null
    return merged
  }

  // Normal task: fill omitted slots from previous when fieldSource/inherit refs say so
  const merged = cloneSpec(spec)
  if (previous) {
    if (
      (!merged.resource || merged.resource.kind === 'inherit') &&
      previous.resource &&
      previous.resource.kind !== 'inherit'
    ) {
      if (
        merged.fieldSource.resource === 'inherit' ||
        merged.resource?.kind === 'inherit' ||
        !merged.resource
      ) {
        // Keep active_resource etc. if explicitly set
        if (!merged.resource || merged.resource.kind === 'inherit') {
          if (
            previous.resource.kind === 'active_resource' ||
            previous.resource.kind === 'active_collection' ||
            previous.resource.kind === 'explicit'
          ) {
            merged.resource = previous.resource
          } else if (!merged.resource) {
            merged.resource = { kind: 'active_resource' }
          }
        }
      }
    }
    if (!merged.subject && merged.fieldSource.subject === 'inherit') {
      merged.subject = previous.subject
    }
    if (
      (!merged.participant || merged.participant.kind === 'inherit') &&
      previous.participant &&
      (merged.fieldSource.participant === 'inherit' ||
        merged.participant?.kind === 'inherit')
    ) {
      merged.participant = previous.participant
    }
    if (
      (!merged.temporal || merged.temporal.kind === 'inherit') &&
      previous.temporal &&
      (merged.fieldSource.temporal === 'inherit' ||
        merged.temporal?.kind === 'inherit')
    ) {
      merged.temporal = previous.temporal
    }
  }
  return merged
}

function candidateToParticipant(
  c: V4SafeCandidate,
): AssistantParticipantCandidate | null {
  const key = (c.ref === 'p2' ? 'p2' : 'p1') as 'p1' | 'p2'
  if (c.kind && c.kind !== 'participant') return null
  const role: 'bride' | 'groom' =
    c.role === 'groom' || c.role === 'bride'
      ? c.role
      : key === 'p2'
        ? 'groom'
        : 'bride'
  return {
    key,
    canonicalName: c.canonicalName ?? c.label,
    firstName: c.firstName ?? c.label.split(/\s+/)[0] ?? c.label,
    role,
  }
}

function bindParticipant(
  ref: TaskReference | null,
  ctx: V4ShadowContext,
):
  | { ok: true; value: V4SafeParticipantRef | null }
  | { ok: false; clarification: NeedsClarification['candidates']; reason: string }
{
  if (!ref) return { ok: true, value: null }
  if (ref.kind === 'active_participant') {
    if (!ctx.activeParticipant) {
      return { ok: false, clarification: [], reason: 'no_active_participant' }
    }
    return { ok: true, value: ctx.activeParticipant }
  }
  if (ref.kind === 'inherit') {
    return { ok: true, value: ctx.activeParticipant }
  }
  if (ref.kind !== 'explicit') {
    return { ok: true, value: null }
  }

  const query = ref.value
  const role = matchParticipantByRoleLanguage(query)
  if (role) {
    const hits = ctx.candidates.participants.filter((c) => c.role === role)
    if (hits.length === 1) {
      const h = hits[0]!
      return {
        ok: true,
        value: {
          key: h.ref,
          label: h.label,
          role: h.role ?? null,
        },
      }
    }
    if (hits.length > 1) {
      return {
        ok: false,
        clarification: hits.map((h) => ({
          ref: h.ref,
          label: h.label,
          semanticPatch: {
            participant: { kind: 'explicit', value: h.label },
          },
        })),
        reason: 'ambiguous_role',
      }
    }
  }

  const asCandidates: AssistantParticipantCandidate[] = []
  const keyMap = new Map<string, V4SafeCandidate>()
  for (const c of ctx.candidates.participants) {
    const mapped = candidateToParticipant(c)
    if (mapped) {
      asCandidates.push(mapped)
      keyMap.set(mapped.key, c)
    }
  }
  const hit = matchParticipantByNameQuery(asCandidates, query)
  if (hit) {
    const c = keyMap.get(hit)
    if (c) {
      return {
        ok: true,
        value: { key: c.ref, label: c.label, role: c.role ?? null },
      }
    }
  }

  // Direct label / morphology soft match (no alias dictionary)
  const q = query.toLowerCase()
  const qVariants = new Set(
    polishPersonSearchQueries(query).map((v) => v.toLowerCase()),
  )
  const soft = ctx.candidates.participants.filter((c) => {
    const label = c.label.toLowerCase()
    const first = (c.firstName ?? '').toLowerCase()
    const can = (c.canonicalName ?? '').toLowerCase()
    if (
      label.includes(q) ||
      q.includes(first) ||
      first.includes(q) ||
      can.includes(q) ||
      q.includes(label)
    ) {
      return true
    }
    const cVariants = new Set(
      [
        ...polishPersonSearchQueries(c.label),
        ...polishPersonSearchQueries(c.firstName ?? ''),
        ...polishPersonSearchQueries(c.canonicalName ?? ''),
      ]
        .filter(Boolean)
        .map((v) => v.toLowerCase()),
    )
    for (const v of qVariants) {
      if (cVariants.has(v)) return true
      // shared stem ≥3
      if (v.length >= 3) {
        for (const cv of cVariants) {
          if (cv.length >= 3 && (cv.startsWith(v.slice(0, 3)) || v.startsWith(cv.slice(0, 3)))) {
            return true
          }
        }
      }
    }
    return false
  })
  if (soft.length === 1) {
    const h = soft[0]!
    return {
      ok: true,
      value: { key: h.ref, label: h.label, role: h.role ?? null },
    }
  }
  if (soft.length > 1) {
    return {
      ok: false,
      clarification: soft.map((h) => ({
        ref: h.ref,
        label: h.label,
        semanticPatch: {
          participant: { kind: 'explicit', value: h.label },
        },
      })),
      reason: 'ambiguous_participant',
    }
  }

  return { ok: false, clarification: [], reason: 'participant_not_found' }
}

function bindResource(
  ref: TaskReference | null,
  ctx: V4ShadowContext,
  preferActive: boolean,
): V4SafeResourceRef | null {
  if (!ref) {
    return preferActive ? ctx.activeResource : null
  }
  if (ref.kind === 'active_resource' || ref.kind === 'inherit') {
    return ctx.activeResource
  }
  if (ref.kind === 'active_collection') {
    return null
  }
  if (ref.kind === 'explicit') {
    const q = ref.value.toLowerCase()
    const hits = [
      ...ctx.candidates.weddings,
      ...ctx.candidates.sessions,
    ].filter((c) => c.label.toLowerCase().includes(q))
    if (hits.length === 1) {
      const h = hits[0]!
      return {
        kind: h.kind === 'session' ? 'session' : 'wedding',
        id: h.ref,
        label: h.label,
      }
    }
    return null
  }
  return preferActive ? ctx.activeResource : null
}

/**
 * Resolve TaskSpec against shadow context.
 * Pure / deterministic.
 */
export function resolveTaskSpec(
  spec: AssistantTaskSpec,
  ctx: V4ShadowContext,
): ResolvedTaskResult {
  if (spec.op === 'unsupported') {
    return {
      status: 'unsupported',
      reason: spec.qualifiers.unsupportedReason ?? 'unsupported',
      sourceTaskSpec: spec,
    }
  }

  const mergedOrErr = mergeTaskSpecWithContext(spec, ctx.previousTaskSpec)
  if ('error' in mergedOrErr) {
    return {
      status: 'invalid_context',
      reason: 'inherit_or_correction_without_previous_task',
      sourceTaskSpec: spec,
    }
  }
  const merged = mergedOrErr
  const req = lookupTaskRequirement(merged.op, merged.subject)

  const isFinanceMetricSubject = (
    subject: typeof merged.subject,
  ): subject is 'remaining' | 'paid' | 'contract_value' =>
    subject === 'remaining' ||
    subject === 'paid' ||
    subject === 'contract_value'

  /**
   * Phase 3D.1 — metric-only aggregate follow-up on an active collection.
   * Explicit finance metric + collection scope → sum (not list inherit / get_amount).
   * Single-wedding get_amount + active_resource remains finance capability.
   */
  const collectionScopedFinance =
    isFinanceMetricSubject(merged.subject) &&
    (merged.resource?.kind === 'active_collection' ||
      (Boolean(ctx.activeCollection) &&
        (merged.resource?.kind === 'inherit' ||
          merged.fieldSource.resource === 'inherit' ||
          ((merged.op === 'sum' ||
            merged.op === 'rank' ||
            merged.op === 'list' ||
            merged.op === 'count' ||
            merged.op === 'inherit') &&
            merged.resource?.kind !== 'active_resource' &&
            merged.resource?.kind !== 'explicit'))))

  // Sequence
  if (req.sequenceRequired || merged.resource?.kind === 'sequence_cursor') {
    if (!ctx.sequenceCursor) {
      return {
        status: 'needs_clarification',
        missingSlot: 'sequence',
        candidates: [],
        resumeTask: merged,
        reason: 'no_sequence_cursor',
      }
    }
    return {
      status: 'resolved',
      op: 'get_next',
      subject: merged.subject,
      resource: ctx.activeResource,
      participant: ctx.activeParticipant,
      temporal: merged.temporal
        ? {
            phrase: merged.temporal.phrase,
            kind: merged.temporal.kind,
            from: ctx.temporalAnchor?.from ?? null,
            to: ctx.temporalAnchor?.to ?? null,
          }
        : null,
      qualifiers: merged.qualifiers,
      sequence: ctx.sequenceCursor,
      collection: null,
      sourceTaskSpec: spec,
      mergedTaskSpec: merged,
    }
  }

  // Collection ops — Phase 3D / G5: DomainQuery-native inheritance.
  // SoT: activeCollection.query. Legacy filters = transitional fallback only.
  // Phase 3D.1: finance-metric follow-ups on activeCollection also enter here
  // (including get_amount / inherit that would otherwise bind a single wedding).
  if (req.isCollection || collectionScopedFinance) {
    const resourceClass: 'weddings' | 'sessions' | 'assignments' =
      merged.subject === 'session'
        ? 'sessions'
        : ctx.activeCollection?.resource ?? 'weddings'

    const inherited = extractInheritedSemanticsFromDomainQuery(
      ctx.activeCollection?.query,
    )
    /** When DomainQuery identity exists, ignore stale legacy filters. */
    const hasDomainQueryIdentity = Boolean(ctx.activeCollection?.query)

    const explicitPhrase = merged.temporal?.phrase?.trim() || null
    const explicitRange = explicitPhrase
      ? resolveAggregateDateRange(explicitPhrase)
      : null

    const pageTemporal =
      ctx.temporalAnchor?.from && ctx.temporalAnchor?.to
        ? { from: ctx.temporalAnchor.from, to: ctx.temporalAnchor.to }
        : null

    // Explicit > DomainQuery > (legacy filters if no query) > page.
    const dateRange = explicitRange
      ? { from: explicitRange.from, to: explicitRange.to }
      : hasDomainQueryIdentity
        ? (inherited?.dateRange ?? pageTemporal)
        : ctx.activeCollection?.filters?.dateRange
          ? {
              from: ctx.activeCollection.filters.dateRange.from,
              to: ctx.activeCollection.filters.dateRange.to,
            }
          : pageTemporal

    const temporal: NormalizedTemporalSemantic | null =
      explicitPhrase || dateRange
        ? {
            phrase: explicitPhrase ?? ctx.temporalAnchor?.phrase ?? null,
            kind: explicitRange
              ? (merged.temporal?.kind ?? 'range')
              : 'inherit',
            from: dateRange?.from ?? null,
            to: dateRange?.to ?? null,
          }
        : null

    // Explicit titleHint replaces inherited location (no intersection).
    const explicitTitleHint = merged.qualifiers.titleHint?.trim() || null
    const locationQuery =
      explicitTitleHint && explicitTitleHint.length >= 2
        ? explicitTitleHint
        : hasDomainQueryIdentity
          ? (inherited?.locationQuery ?? null)
          : (ctx.activeCollection?.filters?.locationQuery ?? null)

    const dest = merged.qualifiers.destination
    const explicitRole =
      dest === 'preparations' || dest === 'ceremony' || dest === 'reception'
        ? dest
        : null
    const locationRole =
      explicitRole ??
      (hasDomainQueryIdentity
        ? inherited?.locationRole
        : ctx.activeCollection?.filters?.locationRole) ??
      (locationQuery ? ('any' as const) : null)

    // Measure: explicit subject wins; else inherit DomainQuery measure when useful.
    let subject = merged.subject
    if (
      !subject &&
      inherited?.measureSubject &&
      (merged.op === 'sum' ||
        merged.op === 'get_amount' ||
        merged.op === 'get' ||
        merged.op === 'inherit' ||
        collectionScopedFinance)
    ) {
      subject = inherited.measureSubject
    }

    // Resolved output slots for compiler / CQ baseline — not inheritance SoT.
    const collection: NonNullable<ResolvedTask['collection']> = {
      resource: resourceClass,
      label: ctx.activeCollection?.label,
      filters: {
        dateRange,
        locationQuery,
        locationRole,
      },
      memberIds: ctx.activeCollection?.memberIds,
      resultCount: ctx.activeCollection?.resultCount,
    }

    // Metric follow-up on a collection frame → sum (keep explicit sum/rank).
    let op = merged.op
    if (isFinanceMetricSubject(subject)) {
      if (op === 'rank') {
        // keep rank
      } else if (
        op === 'sum' ||
        op === 'list' ||
        op === 'count' ||
        op === 'get_amount' ||
        op === 'get' ||
        op === 'inherit'
      ) {
        op = 'sum'
      }
    }

    return {
      status: 'resolved',
      op,
      subject,
      resource: null,
      participant: null,
      temporal,
      qualifiers: merged.qualifiers,
      sequence: null,
      collection,
      sourceTaskSpec: spec,
      mergedTaskSpec: merged,
    }
  }

  // Schedule / assignment discovery
  if (req.scheduleDiscoveryIfUnbound) {
    const hasAssignmentBound = false // no assignment binding in Phase 2.5 shadow
    if (!hasAssignmentBound) {
      return {
        status: 'requires_discovery',
        discovery: {
          kind: 'schedule',
          temporal: merged.temporal
            ? { phrase: merged.temporal.phrase, kind: merged.temporal.kind }
            : {
                phrase: ctx.temporalAnchor?.phrase ?? null,
                kind: null,
                from: ctx.temporalAnchor?.from,
                to: ctx.temporalAnchor?.to,
              },
          constraints: { subject: merged.subject },
        },
        resumeTask: merged,
      }
    }
  }

  // Open without enough resource → discovery
  if (merged.op === 'open' && !ctx.activeResource) {
    const kind =
      merged.subject === 'session' ? 'session_search' : 'wedding_search'
    return {
      status: 'requires_discovery',
      discovery: {
        kind,
        constraints: {
          subject: merged.subject,
          personQuery:
            merged.participant?.kind === 'explicit'
              ? merged.participant.value
              : null,
        },
      },
      resumeTask: merged,
    }
  }

  // Participant binding
  const partBind = bindParticipant(merged.participant, ctx)
  if (!partBind.ok) {
    if (partBind.clarification.length > 0) {
      return {
        status: 'needs_clarification',
        missingSlot: 'participant',
        candidates: partBind.clarification,
        resumeTask: merged,
        reason: partBind.reason,
      }
    }
    return {
      status: 'needs_clarification',
      missingSlot: 'participant',
      candidates: [],
      resumeTask: merged,
      reason: partBind.reason,
    }
  }

  if (req.participantRequired && !partBind.value) {
    return {
      status: 'needs_clarification',
      missingSlot: 'participant',
      candidates: ctx.candidates.participants.map((c) => ({
        ref: c.ref,
        label: c.label,
        semanticPatch: {
          participant: { kind: 'explicit' as const, value: c.label },
        },
      })),
      resumeTask: merged,
      reason: 'participant_required',
    }
  }

  // Resource binding
  const resource = bindResource(
    merged.resource,
    ctx,
    Boolean(req.preferActiveResource),
  )

  if (req.preferActiveResource && !resource && merged.op !== 'prepare_create') {
    // Explicit ceremony/finance etc. with no active resource → discovery, not false clarification for workday
    if (
      merged.participant?.kind === 'explicit' ||
      merged.resource?.kind === 'explicit'
    ) {
      return {
        status: 'requires_discovery',
        discovery: {
          kind:
            merged.subject === 'session' ? 'session_search' : 'wedding_search',
          constraints: {
            subject: merged.subject,
            personQuery:
              merged.participant?.kind === 'explicit'
                ? merged.participant.value
                : null,
          },
        },
        resumeTask: merged,
      }
    }
    return {
      status: 'needs_clarification',
      missingSlot: 'resource',
      candidates: ctx.candidates.weddings.map((c) => ({
        ref: c.ref,
        label: c.label,
        semanticPatch: {
          resource: { kind: 'explicit' as const, value: c.label },
        },
      })),
      resumeTask: merged,
      reason: 'no_active_resource',
    }
  }

  const resolved: ResolvedTask = {
    status: 'resolved',
    op: merged.op,
    subject: merged.subject,
    resource,
    participant: partBind.value,
    temporal: merged.temporal
      ? {
          phrase: merged.temporal.phrase,
          kind: merged.temporal.kind,
          from: ctx.temporalAnchor?.from ?? null,
          to: ctx.temporalAnchor?.to ?? null,
        }
      : ctx.temporalAnchor
        ? {
            phrase: ctx.temporalAnchor.phrase ?? null,
            kind: null,
            from: ctx.temporalAnchor.from,
            to: ctx.temporalAnchor.to,
          }
        : null,
    qualifiers: merged.qualifiers ?? emptyQualifiers(),
    sequence: null,
    collection: ctx.activeCollection,
    sourceTaskSpec: spec,
    mergedTaskSpec: merged,
  }

  return resolved
}
