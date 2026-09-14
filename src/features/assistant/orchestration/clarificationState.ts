/**
 * Structured clarification + loop guards for Assistant V3.1 / V3.1.1.
 * Option clicks are semantic patches — never re-parsed as new NL.
 */

import type { AssistantSemanticRequest, AssistantResponse } from '../types'
import type { AssistantQueryPlan } from '../api/queryPlanSchema'
import type { AssistantWorkingContext } from '../api/workingContext'
import {
  inferFinanceAspectFromUtterance,
  parseAssistantSemanticRequest,
} from '../api/intentParse'
import {
  matchParticipantByNameQuery,
  matchParticipantByRoleLanguage,
  type AssistantParticipantKey,
} from '../api/participants'
import { ASSISTANT_PARTICIPANT_AMBIGUOUS } from '../copy'

export type ClarificationSlot =
  | 'participant'
  | 'resource'
  | 'assignment'
  | 'placeScope'
  | 'date'
  | 'financeAspect'
  | 'entity_type'
  | 'other'

export type ClarificationSemanticPatch = {
  participantKey?: 'p1' | 'p2' | null
  participantRole?: 'bride' | 'groom' | null
  weddingId?: string | null
  sessionId?: string | null
  placeScope?:
    | 'preparations'
    | 'bride_preparation'
    | 'groom_preparation'
    | 'ceremony'
    | 'reception'
    | 'all'
    | null
  datePhrase?: string | null
  financeAspect?: 'remaining' | 'paid' | 'contract_value' | 'overview' | null
}

export type ClarificationOptionStructured = {
  id: string
  label: string
  /** Authoritative resolution — preferred. */
  semanticPatch?: ClarificationSemanticPatch | null
  resumeSemantic?: AssistantSemanticRequest | null
  resumePlan?: AssistantQueryPlan | null
}

export type PendingClarificationState = {
  /** Stable id for this clarification turn (stale / double-click guards). */
  id: string
  question: string
  slot: ClarificationSlot
  /** Original user goal utterance (bounded). */
  originalUtterance?: string | null
  goalType?: string | null
  /** Signature for loop detection. */
  signature: string
  options: ClarificationOptionStructured[]
  /** Depth within this goal. */
  depth: number
  /** Already resolved slots for this goal. */
  resolvedSlots: ClarificationSlot[]
  /** Base semantic to patch / resume after option pick. */
  resumeSemantic?: AssistantSemanticRequest | null
}

export const ASSISTANT_MAX_CLARIFICATION_DEPTH = 2

export function createClarificationId(): string {
  return `cl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function clarificationSignature(input: {
  slot: ClarificationSlot
  goalType?: string | null
  optionIds: string[]
}): string {
  return [
    input.slot,
    input.goalType ?? '',
    [...input.optionIds].sort().join(','),
  ].join('|')
}

export function wouldLoopClarification(input: {
  pending: PendingClarificationState | null | undefined
  nextSignature: string
  nextSlot: ClarificationSlot
}): boolean {
  if (!input.pending) return false
  if (input.pending.signature === input.nextSignature) return true
  if (
    input.pending.resolvedSlots.includes(input.nextSlot) &&
    input.nextSlot !== 'other'
  ) {
    return true
  }
  if (input.pending.depth >= ASSISTANT_MAX_CLARIFICATION_DEPTH) return true
  return false
}

/** True when an option can resume without re-parsing its label as NL. */
export function optionCanResume(
  opt: ClarificationOptionStructured | {
    resumeSemantic?: unknown
    resumePlan?: unknown
    semantic?: unknown
    plan?: unknown
    semanticPatch?: ClarificationSemanticPatch | null
    label?: string
  },
): boolean {
  if (isNumberedPlaceholderLabel(
    typeof opt === 'object' && opt && 'label' in opt
      ? String((opt as { label?: string }).label ?? '')
      : '',
  )) {
    // Numbered placeholders ("Maks 1") are never authoritative alone.
    // They may still resume if a complete patch/semantic with weddingId exists.
  }

  const resume =
    (opt.resumeSemantic as AssistantSemanticRequest | null | undefined) ??
    (('semantic' in opt
      ? (opt.semantic as AssistantSemanticRequest | null | undefined)
      : null) ??
      null)
  if (resume) {
    if (!semanticResumeIsComplete(resume, opt.semanticPatch ?? null)) {
      // fall through to patch-only check
    } else {
      return true
    }
  }
  if (opt.resumePlan || ('plan' in opt && opt.plan)) return true
  const patch = opt.semanticPatch
  if (!patch) return false
  // Participant-only patch without wedding is incomplete for places resume
  if (patch.participantKey && !patch.weddingId && !patch.sessionId) {
    return false
  }
  return Boolean(
    patch.participantKey ||
      patch.participantRole ||
      patch.weddingId ||
      patch.sessionId ||
      patch.placeScope ||
      patch.datePhrase ||
      patch.financeAspect,
  )
}

export function isNumberedPlaceholderLabel(label: string): boolean {
  return /^.+\s+\d{1,2}$/u.test(label.trim())
}

function semanticResumeIsComplete(
  resume: AssistantSemanticRequest,
  patch: ClarificationSemanticPatch | null | undefined,
): boolean {
  if (
    resume.kind === 'wedding_places' ||
    resume.kind === 'wedding_day_plan' ||
    resume.kind === 'wedding_finances' ||
    resume.kind === 'wedding_tasks' ||
    resume.kind === 'wedding_next_action' ||
    resume.kind === 'open_wedding' ||
    resume.kind === 'open_resource'
  ) {
    const wid =
      resume.resolver?.weddingId ?? patch?.weddingId ?? null
    if (!wid) return false
  }
  return true
}

export function filterResumableOptions<
  T extends ClarificationOptionStructured | {
    resumeSemantic?: unknown
    resumePlan?: unknown
    semantic?: unknown
    plan?: unknown
    semanticPatch?: ClarificationSemanticPatch | null
    label?: string
  },
>(options: T[]): T[] {
  return options.filter((o) => optionCanResume(o))
}

type PlaceScope =
  | 'preparations'
  | 'bride_preparation'
  | 'groom_preparation'
  | 'ceremony'
  | 'reception'
  | 'all'

function asPlaceScope(raw: string | null | undefined): PlaceScope | null {
  if (
    raw === 'preparations' ||
    raw === 'bride_preparation' ||
    raw === 'groom_preparation' ||
    raw === 'ceremony' ||
    raw === 'reception' ||
    raw === 'all'
  ) {
    return raw
  }
  return null
}

/** Build resume semantic from lastResolvedRequest + activeResource. */
export function buildGoalResumeSemantic(
  ctx: AssistantWorkingContext,
): AssistantSemanticRequest | null {
  const weddingId =
    ctx.activeResource?.kind === 'wedding' ? ctx.activeResource.id : null
  const goal = ctx.lastResolvedRequest?.goalType
  const placeScope =
    asPlaceScope(ctx.lastResolvedRequest?.placeScope ?? null) ??
    asPlaceScope(ctx.lastDirectContext?.placeScope ?? null) ??
    asPlaceScope(ctx.discourseFocus?.placeScope ?? null) ??
    'preparations'
  const participantKey =
    ctx.lastResolvedRequest?.participantKey ??
    ctx.activeParticipant?.participantKey ??
    ctx.discourseFocus?.participantKey ??
    null
  const financeAspect =
    (ctx.lastResolvedRequest?.financeAspect as
      | 'remaining'
      | 'paid'
      | 'contract_value'
      | 'overview'
      | null
      | undefined) ??
    ctx.discourseFocus?.financeAspect ??
    'overview'

  if (!weddingId && goal !== 'schedule' && goal !== 'collection') {
    return null
  }

  const resolver = {
    personQuery: null as string | null,
    dateHint: null as string | null,
    weddingId,
  }

  switch (goal) {
    case 'places':
      return {
        kind: 'wedding_places',
        resolver,
        requestedRole: placeScope,
        participantKey,
        participantRole: null,
      }
    case 'day_plan':
      return {
        kind: 'wedding_day_plan',
        resolver,
        focus:
          (ctx.lastResolvedRequest?.dayPlanFocus as
            | 'ceremony'
            | 'preparations'
            | 'full'
            | 'earliest'
            | null
            | undefined) ?? 'full',
        participantKey,
        participantRole: null,
      }
    case 'finances':
      return {
        kind: 'wedding_finances',
        resolver,
        financeAspect:
          financeAspect === 'remaining' ||
          financeAspect === 'paid' ||
          financeAspect === 'contract_value' ||
          financeAspect === 'overview'
            ? financeAspect
            : 'overview',
      }
    case 'tasks':
      return { kind: 'wedding_tasks', resolver }
    case 'next_action':
      return { kind: 'wedding_next_action', resolver }
    case 'open':
      return { kind: 'open_wedding', resolver }
    case 'schedule': {
      const phrase =
        ctx.temporalAnchor?.phrase ||
        (ctx.temporalAnchor?.from ? ctx.temporalAnchor.from : null) ||
        'dziś'
      return { kind: 'schedule', datePhrase: phrase }
    }
    default:
      if (weddingId) {
        return {
          kind: 'wedding_places',
          resolver,
          requestedRole: placeScope,
          participantKey,
          participantRole: null,
        }
      }
      return null
  }
}

/** Temporal first-person workday / schedule discovery signals (semantic class, not phrase map). */
export function looksLikeTemporalWorkdayGoal(utterance: string): boolean {
  const t = utterance.trim().toLowerCase()
  if (!t) return false
  // Named participant prep / places — not schedule discovery
  if (
    /szykuje|przygotow|ceremon|sala|wesel[eu]|ogarnia|ubiera/.test(t) &&
    !/\bjad[eę]\b/.test(t)
  ) {
    return false
  }
  // Collection / finance counts
  if (/\bile\b/.test(t) && /\b(wesel|sesj|zlecen|warto[sś]|wpłat|wisz)/.test(t)) {
    return false
  }
  const hasTemporal =
    /\b(dzi[sś]|dzisiaj|jutro|pojutrze|sobot|niedziel|weekend)\b/i.test(t) ||
    /\b\d{1,2}[./]\d{1,2}\b/.test(t)
  const firstPersonWork =
    /\b(jad[eę]|jadę|zaczynam|robi[eę]|lece|lecę|ruszam|jestem)\b/i.test(t) ||
    /co mam|gdzie mam|jak wygl[aą]da|mam co[sś]|plan na/i.test(t)
  const whereGo =
    /\bgdzie\b/i.test(t) &&
    /\b(jad|dzi[sś]|jutro|sobot|b[eę]d)/i.test(t)
  return (hasTemporal && firstPersonWork) || whereGo
}

export function isPrematureEntityTypeClarification(input: {
  question: string
  optionLabels: string[]
  utterance: string
}): boolean {
  if (!looksLikeTemporalWorkdayGoal(input.utterance)) return false
  const q = input.question.toLowerCase()
  const labels = input.optionLabels.map((l) => l.toLowerCase())
  const asksEntityType =
    /[sś]lub/.test(q) && /osob/.test(q)
  const optionsAreEntityType =
    labels.some((l) => /[sś]lub/.test(l)) &&
    labels.some((l) => /osob/.test(l))
  return asksEntityType || optionsAreEntityType
}

export function applySemanticPatchToRequest(
  base: AssistantSemanticRequest | null,
  patch: ClarificationSemanticPatch,
  goalHint?: string | null,
  defaultPlaceScope?: PlaceScope | null,
): AssistantSemanticRequest | null {
  if (base) {
    if (
      base.kind === 'wedding_places' ||
      base.kind === 'wedding_day_plan' ||
      base.kind === 'wedding_finances' ||
      base.kind === 'wedding_tasks' ||
      base.kind === 'wedding_next_action' ||
      base.kind === 'open_wedding' ||
      base.kind === 'open_resource'
    ) {
      const resolver = {
        ...base.resolver,
        weddingId: patch.weddingId ?? base.resolver.weddingId,
        personQuery:
          patch.weddingId != null ? null : base.resolver.personQuery,
      }
      if (base.kind === 'wedding_places') {
        return {
          ...base,
          resolver,
          participantKey:
            patch.participantKey !== undefined
              ? patch.participantKey
              : base.participantKey,
          participantRole:
            patch.participantRole !== undefined
              ? patch.participantRole
              : base.participantRole,
          requestedRole: patch.placeScope ?? base.requestedRole,
        }
      }
      if (base.kind === 'wedding_day_plan') {
        return {
          ...base,
          resolver,
          participantKey:
            patch.participantKey !== undefined
              ? patch.participantKey
              : base.participantKey,
          participantRole:
            patch.participantRole !== undefined
              ? patch.participantRole
              : base.participantRole,
        }
      }
      if (base.kind === 'wedding_finances') {
        return {
          ...base,
          resolver,
          financeAspect: patch.financeAspect ?? base.financeAspect,
        }
      }
      return { ...base, resolver } as AssistantSemanticRequest
    }
    if (base.kind === 'schedule' && patch.datePhrase) {
      return { kind: 'schedule', datePhrase: patch.datePhrase }
    }
  }

  if (patch.datePhrase && looksLikeTemporalWorkdayGoal(goalHint ?? '')) {
    return { kind: 'schedule', datePhrase: patch.datePhrase }
  }
  if (patch.weddingId && patch.placeScope) {
    return {
      kind: 'wedding_places',
      resolver: {
        personQuery: null,
        dateHint: null,
        weddingId: patch.weddingId,
      },
      requestedRole: patch.placeScope,
      participantKey: patch.participantKey ?? null,
      participantRole: patch.participantRole ?? null,
    }
  }
  if (patch.participantKey && patch.weddingId) {
    const scope =
      patch.placeScope ||
      defaultPlaceScope ||
      asPlaceScope(
        typeof goalHint === 'string' ? goalHint : null,
      ) ||
      'preparations'
    return {
      kind: 'wedding_places',
      resolver: {
        personQuery: null,
        dateHint: null,
        weddingId: patch.weddingId,
      },
      requestedRole: scope,
      participantKey: patch.participantKey,
      participantRole: patch.participantRole ?? null,
    }
  }
  return null
}

function utterancePersonQueryCandidates(utterance: string): string[] {
  const t = utterance.trim()
  if (!t) return []
  const out: string[] = [t]
  const tokens = t.split(/\s+/).filter(Boolean)
  for (const tok of tokens) {
    const cleaned = tok.replace(/^[„"'(]+|[.,!?;:"')]+$/g, '')
    if (cleaned.length < 2) continue
    // Skip very common function words — not a phrase intent map
    if (
      /^(a|i|o|u|w|z|na|do|nie|mi|się|sie|jest|ma|mam|gdzie|ile|co)$/i.test(
        cleaned,
      )
    ) {
      continue
    }
    out.push(cleaned)
    // Light Polish genitive: Bartka→Bartek, Marka→Marek (morphology, not intent map)
    if (/[bcdfghjklmnpqrstvwxyz]ka$/i.test(cleaned) && cleaned.length > 4) {
      out.push(`${cleaned.slice(0, -2)}ek`)
    }
  }
  return out
}

export type DeterministicParticipantCorrectionResult =
  | { kind: 'semantic'; semantic: AssistantSemanticRequest }
  | {
      kind: 'clarification'
      response: Extract<AssistantResponse, { kind: 'clarification' }>
      pending: PendingClarificationState
    }
  | null

/**
 * Local repair when pendingCorrection / places|day_plan participant miss
 * and the utterance names an active-wedding participant.
 */
export function tryDeterministicParticipantCorrection(input: {
  utterance: string
  workingContext: AssistantWorkingContext
}): DeterministicParticipantCorrectionResult {
  const ctx = input.workingContext
  const utterance = input.utterance.trim()
  if (!utterance) return null

  const pending = ctx.pendingCorrection
  const goalPlacesLike =
    pending?.missingSlot === 'participant' ||
    ctx.lastResolvedRequest?.goalType === 'places' ||
    ctx.lastResolvedRequest?.goalType === 'day_plan'

  if (!goalPlacesLike) return null

  // Prefer explicit pendingCorrection; otherwise only when last goal needed a participant
  const needsParticipant =
    pending?.missingSlot === 'participant' ||
    ctx.pendingClarification?.slot === 'participant' ||
    (pending == null &&
      (ctx.lastResolvedRequest?.goalType === 'places' ||
        ctx.lastResolvedRequest?.goalType === 'day_plan') &&
      !ctx.lastResolvedRequest?.participantKey &&
      !ctx.activeParticipant)

  // Corrections with pendingCorrection always eligible; without it require miss signal
  if (!pending && !needsParticipant) {
    // Still allow when last goal was places/day_plan (ellipsis name repair)
    // or an open participant clarification is awaiting a typed correction.
    if (
      ctx.pendingClarification?.slot !== 'participant' &&
      ctx.lastResolvedRequest?.goalType !== 'places' &&
      ctx.lastResolvedRequest?.goalType !== 'day_plan'
    ) {
      return null
    }
  }

  const resource = ctx.activeResource
  if (resource?.kind !== 'wedding' || !resource.participants?.length) {
    return null
  }

  const weddingId = pending?.weddingId || resource.id
  const placeScope =
    asPlaceScope(pending?.placeScope ?? null) ??
    asPlaceScope(ctx.lastResolvedRequest?.placeScope ?? null) ??
    asPlaceScope(ctx.lastDirectContext?.placeScope ?? null) ??
    'preparations'

  const candidates = resource.participants
  const matchedKeys = new Set<AssistantParticipantKey>()

  const roleHit = matchParticipantByRoleLanguage(utterance)
  if (roleHit) {
    const byRole = candidates.find((c) => c.role === roleHit)
    if (byRole) matchedKeys.add(byRole.key)
  }

  for (const q of utterancePersonQueryCandidates(utterance)) {
    const hit = matchParticipantByNameQuery(candidates, q)
    if (hit === 'ambiguous') {
      for (const c of candidates) matchedKeys.add(c.key)
      break
    }
    if (hit) matchedKeys.add(hit)
  }

  // Token containment: participant first/canonical appears in utterance
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
  const uttNorm = norm(utterance)
  for (const c of candidates) {
    const forms = [c.firstName, c.canonicalName].map(norm).filter(Boolean)
    if (forms.some((f) => f.length >= 2 && uttNorm.includes(f))) {
      matchedKeys.add(c.key)
    }
  }

  if (matchedKeys.size === 0) return null

  const goalType =
    pending?.goalType ?? ctx.lastResolvedRequest?.goalType ?? 'places'
  const dayPlanFocus =
    (ctx.lastResolvedRequest?.dayPlanFocus as
      | 'ceremony'
      | 'preparations'
      | 'full'
      | 'earliest'
      | null
      | undefined) ??
    ctx.lastDirectContext?.dayPlanFocus ??
    null

  const prepFamily =
    placeScope === 'preparations' ||
    placeScope === 'bride_preparation' ||
    placeScope === 'groom_preparation'

  const dayPlanPrep =
    goalType === 'day_plan' &&
    (dayPlanFocus === 'preparations' ||
      placeScope === 'preparations' ||
      placeScope === 'bride_preparation' ||
      placeScope === 'groom_preparation' ||
      ctx.discourseFocus?.dayPlanStage === 'preparations' ||
      ctx.discourseFocus?.dayPlanStage === 'bride_preparation' ||
      ctx.discourseFocus?.dayPlanStage === 'groom_preparation')

  // Participant replacement only for prep-compatible frames (not ceremony/reception).
  if (!prepFamily && !dayPlanPrep && pending?.missingSlot !== 'participant') {
    return null
  }

  const utteranceLower = utterance.toLowerCase()
  const wantsTime = /\bo\s+kt[oó]rej\b/i.test(utteranceLower)
  const wantsLocation = /\bgdzie\b/i.test(utteranceLower)
  const resumeAsDayPlan =
    wantsTime ||
    (dayPlanPrep && !wantsLocation) ||
    (goalType === 'day_plan' &&
      (dayPlanFocus === 'preparations' || prepFamily) &&
      !wantsLocation)

  /**
   * Always re-scope to preparations when binding a (possibly new) participant.
   * Never keep a stale bride_preparation / groom_preparation role from the
   * previous turn — that would ignore the explicit participant replacement.
   */
  const buildSemantic = (
    key: AssistantParticipantKey,
  ): AssistantSemanticRequest => {
    if (resumeAsDayPlan) {
      return {
        kind: 'wedding_day_plan',
        resolver: {
          personQuery: null,
          dateHint: null,
          weddingId,
        },
        focus: 'preparations',
        participantKey: key,
        participantRole: null,
      }
    }
    return {
      kind: 'wedding_places',
      resolver: {
        personQuery: null,
        dateHint: null,
        weddingId,
      },
      requestedRole: 'preparations',
      participantKey: key,
      participantRole: null,
    }
  }

  if (matchedKeys.size === 1) {
    const key = [...matchedKeys][0]!
    return { kind: 'semantic', semantic: buildSemantic(key) }
  }

  const options = candidates
    .filter((c) => matchedKeys.has(c.key))
    .map((c) => ({
      id: c.key,
      label: c.canonicalName,
      semantic: buildSemantic(c.key),
      semanticPatch: {
        participantKey: c.key,
        weddingId,
        placeScope: 'preparations' as const,
      } as ClarificationSemanticPatch,
      resumeSemantic: buildSemantic(c.key),
    }))

  const signature = clarificationSignature({
    slot: 'participant',
    goalType: pending?.goalType ?? ctx.lastResolvedRequest?.goalType ?? 'places',
    optionIds: options.map((o) => o.id),
  })

  const pendingState: PendingClarificationState = {
    id: createClarificationId(),
    question: ASSISTANT_PARTICIPANT_AMBIGUOUS,
    slot: 'participant',
    originalUtterance: utterance,
    goalType: pending?.goalType ?? ctx.lastResolvedRequest?.goalType ?? 'places',
    signature,
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      semanticPatch: o.semanticPatch,
      resumeSemantic: o.resumeSemantic,
    })),
    depth: 1,
    resolvedSlots: [],
    resumeSemantic: buildGoalResumeSemantic(ctx) ?? buildSemantic('p1'),
  }

  return {
    kind: 'clarification',
    response: {
      kind: 'clarification',
      question: ASSISTANT_PARTICIPANT_AMBIGUOUS,
      options: options.map((o) => ({
        id: o.id,
        label: o.label,
        semantic: o.semantic,
        semanticPatch: o.semanticPatch,
      })),
    },
    pending: pendingState,
  }
}

/**
 * Phase 3D.1 — activeCollection + finance metric follow-up → QueryPlan sum.
 *
 * Structural rule (not a phrase table):
 * when a valid activeCollection exists and the utterance is a wedding_finances
 * metric ask without naming a single wedding/person, execute collection sum
 * against the inherited filters.
 */
export function tryDeterministicCollectionFinanceFollowUp(input: {
  utterance: string
  workingContext: AssistantWorkingContext
}): AssistantQueryPlan | null {
  const ctx = input.workingContext
  const collection = ctx.activeCollection
  if (!collection) return null

  const utterance = input.utterance.trim()
  if (!utterance) return null

  const parsed = parseAssistantSemanticRequest(utterance)
  // Temporal-only replacement ("a we wrześniu?") is not a finance follow-up.
  if (parsed.kind !== 'wedding_finances') {
    // Still allow when local cues are finance-metric even if parse drifts.
    const aspectOnly = inferFinanceAspectFromUtterance(utterance)
    if (!aspectOnly) return null
  }

  if (parsed.kind === 'wedding_finances') {
    if (parsed.resolver.personQuery?.trim()) return null
    if (parsed.resolver.weddingId?.trim()) return null
  }

  const aspect =
    (parsed.kind === 'wedding_finances' ? parsed.financeAspect : null) ??
    inferFinanceAspectFromUtterance(utterance)
  if (aspect !== 'remaining' && aspect !== 'paid' && aspect !== 'contract_value') {
    return null
  }

  const field =
    aspect === 'paid'
      ? ('paidAmount' as const)
      : aspect === 'remaining'
        ? ('remainingAmount' as const)
        : ('contractValue' as const)

  return {
    kind: 'query_plan',
    resource: collection.resource,
    operation: 'sum',
    field,
    filters: {
      useActiveCollection: true,
    },
    target: 'active_collection',
  }
}

/**
 * Rewrite a resolved wedding_finances semantic into collection sum when
 * activeCollection is the correct scope (no explicit single-wedding binding).
 */
export function weddingFinancesToCollectionSumPlan(input: {
  semantic: Extract<AssistantSemanticRequest, { kind: 'wedding_finances' }>
  workingContext: AssistantWorkingContext
  utterance?: string | null
}): AssistantQueryPlan | null {
  const collection = input.workingContext.activeCollection
  if (!collection) return null
  if (input.semantic.resolver.personQuery?.trim()) return null
  if (input.semantic.resolver.weddingId?.trim()) return null

  const aspect =
    input.semantic.financeAspect ??
    inferFinanceAspectFromUtterance(input.utterance ?? null)
  if (aspect !== 'remaining' && aspect !== 'paid' && aspect !== 'contract_value') {
    return null
  }

  const field =
    aspect === 'paid'
      ? ('paidAmount' as const)
      : aspect === 'remaining'
        ? ('remainingAmount' as const)
        : ('contractValue' as const)

  return {
    kind: 'query_plan',
    resource: collection.resource,
    operation: 'sum',
    field,
    filters: { useActiveCollection: true },
    target: 'active_collection',
  }
}

