/**
 * OurWed Assistant V4 — TaskSpec (user meaning, not execution).
 * Phase 2.5: correction patch + semantic context for shadow resolution.
 */

export const ASSISTANT_TASK_SPEC_VERSION = 1 as const

export type TaskOperation =
  | 'get'
  | 'get_time'
  | 'get_location'
  | 'get_amount'
  | 'get_distance'
  | 'count'
  | 'sum'
  | 'rank'
  | 'list'
  | 'get_next'
  | 'open'
  | 'prepare_create'
  | 'inherit'
  | 'correction'
  | 'unsupported'

export type TaskSubject =
  | 'wedding'
  | 'session'
  | 'assignment'
  | 'participant'
  | 'preparations'
  | 'ceremony'
  | 'reception'
  | 'day_plan'
  | 'payment'
  | 'remaining'
  | 'paid'
  | 'deposit'
  | 'contract_value'
  | 'task'
  | 'next_action'
  | 'route'
  | 'schedule'
  | 'unknown'

export type TaskReferenceKind =
  | 'explicit'
  | 'active_resource'
  | 'active_participant'
  | 'active_collection'
  | 'sequence_cursor'
  | 'temporal_schedule'
  | 'inherit'

export type TaskReference =
  | { kind: 'explicit'; value: string }
  | {
      kind:
        | 'active_resource'
        | 'active_participant'
        | 'active_collection'
        | 'sequence_cursor'
        | 'temporal_schedule'
        | 'inherit'
    }

export type TaskTemporalKind = 'day' | 'range' | 'point' | 'inherit'

export type TaskTemporal = {
  phrase: string | null
  kind: TaskTemporalKind | null
}

export type TaskCorrectionSlot =
  | 'resource'
  | 'participant'
  | 'subject'
  | 'temporal'
  | 'metric'
  | 'scope'

/** Typed qualifiers — no free-form Record. */
export type TaskQualifiers = {
  aspect: 'final_due' | 'overview' | null
  rank: 'min' | 'max' | null
  destination: 'preparations' | 'ceremony' | 'reception' | null
  titleHint: string | null
  unsupportedReason: string | null
}

export type TaskFieldSource = 'explicit' | 'inherit' | 'correction' | 'omitted'

/** Only changed slots — applied onto previousTaskSpec by Context Resolver. */
export type TaskPatch = {
  subject?: TaskSubject | null
  participant?: TaskReference | null
  resource?: TaskReference | null
  temporal?: TaskTemporal | null
  aspect?: TaskQualifiers['aspect']
  rank?: TaskQualifiers['rank']
  destination?: TaskQualifiers['destination']
}

export type TaskCorrection = {
  targetSlot: TaskCorrectionSlot | null
  /** Semantic replacement values. Empty object only when malformed. */
  patch: TaskPatch
}

export type AssistantTaskSpec = {
  version: typeof ASSISTANT_TASK_SPEC_VERSION
  op: TaskOperation
  subject: TaskSubject | null
  resource: TaskReference | null
  participant: TaskReference | null
  temporal: TaskTemporal | null
  qualifiers: TaskQualifiers
  correction: TaskCorrection | null
  fieldSource: {
    op: TaskFieldSource
    subject: TaskFieldSource
    resource: TaskFieldSource
    participant: TaskFieldSource
    temporal: TaskFieldSource
  }
}

/** Compact previous task for interpreter (no CRM). */
export type PreviousTaskSummary = {
  op: TaskOperation | null
  subject: TaskSubject | null
  participantValue?: string | null
  resourceKind?: TaskReferenceKind | null
  temporalPhrase?: string | null
  aspect?: TaskQualifiers['aspect']
  rank?: TaskQualifiers['rank']
  destination?: TaskQualifiers['destination']
}

/** Compact hint for multi-turn interpretation (synthetic / shadow). No CRM rows. */
export type TaskSpecSemanticContext = {
  activeResourceKind?: 'wedding' | 'session' | null
  activeParticipantHint?: string | null
  previousOp?: TaskOperation | null
  previousSubject?: TaskSubject | null
  currentTopic?: string | null
  hasSequenceContext?: boolean
  lastTemporalPhrase?: string | null
  /** Preferred over raw history for correction relation. */
  previousTask?: PreviousTaskSummary | null
}

export function emptyQualifiers(): TaskQualifiers {
  return {
    aspect: null,
    rank: null,
    destination: null,
    titleHint: null,
    unsupportedReason: null,
  }
}

export function emptyFieldSource(): AssistantTaskSpec['fieldSource'] {
  return {
    op: 'omitted',
    subject: 'omitted',
    resource: 'omitted',
    participant: 'omitted',
    temporal: 'omitted',
  }
}

export function emptyPatch(): TaskPatch {
  return {}
}

export function summarizeTaskSpec(
  spec: AssistantTaskSpec | null | undefined,
): PreviousTaskSummary | null {
  if (!spec) return null
  return {
    op: spec.op,
    subject: spec.subject,
    participantValue:
      spec.participant?.kind === 'explicit' ? spec.participant.value : null,
    resourceKind: spec.resource?.kind ?? null,
    temporalPhrase: spec.temporal?.phrase ?? null,
    aspect: spec.qualifiers.aspect,
    rank: spec.qualifiers.rank,
    destination: spec.qualifiers.destination,
  }
}
