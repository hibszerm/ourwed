/**
 * Runtime validation for Assistant V4 TaskSpec.
 * Phase 2.5: correction.patch support + tiny canonical normalizer.
 */

import {
  ASSISTANT_TASK_SPEC_VERSION,
  emptyFieldSource,
  emptyQualifiers,
  type AssistantTaskSpec,
  type TaskCorrection,
  type TaskCorrectionSlot,
  type TaskFieldSource,
  type TaskOperation,
  type TaskPatch,
  type TaskQualifiers,
  type TaskReference,
  type TaskSubject,
  type TaskTemporal,
  type TaskTemporalKind,
} from './taskSpec'

const OPS = new Set<TaskOperation>([
  'get',
  'get_time',
  'get_location',
  'get_amount',
  'get_distance',
  'count',
  'sum',
  'rank',
  'list',
  'get_next',
  'open',
  'prepare_create',
  'inherit',
  'correction',
  'unsupported',
])

const SUBJECTS = new Set<TaskSubject>([
  'wedding',
  'session',
  'assignment',
  'participant',
  'preparations',
  'ceremony',
  'reception',
  'day_plan',
  'payment',
  'remaining',
  'paid',
  'deposit',
  'contract_value',
  'task',
  'next_action',
  'route',
  'schedule',
  'unknown',
])

const TEMPORAL_KINDS = new Set<TaskTemporalKind>([
  'day',
  'range',
  'point',
  'inherit',
])

const FIELD_SOURCES = new Set<TaskFieldSource>([
  'explicit',
  'inherit',
  'correction',
  'omitted',
])

const CORRECTION_SLOTS = new Set<TaskCorrectionSlot>([
  'resource',
  'participant',
  'subject',
  'temporal',
  'metric',
  'scope',
])

const FORBIDDEN =
  /ownerId|userId|tenantId|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|service_role|get_wedding_|calculate_route|collection_query/i

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t.slice(0, 200) : null
}

function parseRef(raw: unknown): TaskReference | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const kind = asString(row.kind)
  if (
    kind === 'active_resource' ||
    kind === 'active_participant' ||
    kind === 'active_collection' ||
    kind === 'sequence_cursor' ||
    kind === 'temporal_schedule' ||
    kind === 'inherit'
  ) {
    return { kind }
  }
  if (kind === 'explicit') {
    const value = asString(row.value)
    if (!value) return null
    if (UUID_RE.test(value)) return null
    if (FORBIDDEN.test(value)) return null
    return { kind: 'explicit', value }
  }
  return null
}

function parseTemporal(raw: unknown): TaskTemporal | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const phrase = asString(row.phrase)
  const kindRaw = asString(row.kind)
  const kind =
    kindRaw && TEMPORAL_KINDS.has(kindRaw as TaskTemporalKind)
      ? (kindRaw as TaskTemporalKind)
      : null
  if (!phrase && !kind) return null
  if (phrase && FORBIDDEN.test(phrase)) return null
  return { phrase, kind }
}

function parseQualifiers(raw: unknown): TaskQualifiers {
  const q = emptyQualifiers()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return q
  const row = raw as Record<string, unknown>
  const aspect = asString(row.aspect)
  if (aspect === 'final_due' || aspect === 'overview') q.aspect = aspect
  const rank = asString(row.rank)
  if (rank === 'min' || rank === 'max') q.rank = rank
  const destination = asString(row.destination)
  if (
    destination === 'preparations' ||
    destination === 'ceremony' ||
    destination === 'reception'
  ) {
    q.destination = destination
  }
  const titleHint = asString(row.titleHint)
  if (titleHint && !FORBIDDEN.test(titleHint) && !UUID_RE.test(titleHint)) {
    q.titleHint = titleHint.slice(0, 120)
  }
  const unsupportedReason = asString(row.unsupportedReason)
  if (unsupportedReason) q.unsupportedReason = unsupportedReason.slice(0, 80)
  return q
}

function parseFieldSource(raw: unknown): AssistantTaskSpec['fieldSource'] {
  const base = emptyFieldSource()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const row = raw as Record<string, unknown>
  for (const key of [
    'op',
    'subject',
    'resource',
    'participant',
    'temporal',
  ] as const) {
    const v = asString(row[key])
    if (v && FIELD_SOURCES.has(v as TaskFieldSource)) {
      base[key] = v as TaskFieldSource
    }
  }
  return base
}

function parsePatch(raw: unknown): TaskPatch {
  const patch: TaskPatch = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return patch
  const row = raw as Record<string, unknown>
  const subject = asString(row.subject)
  if (subject && SUBJECTS.has(subject as TaskSubject)) {
    patch.subject = subject as TaskSubject
  }
  if (row.participant !== undefined) {
    const p = parseRef(row.participant)
    if (row.participant != null && p === null) {
      /* invalid — leave out */
    } else if (p) patch.participant = p
  }
  if (row.resource !== undefined) {
    const r = parseRef(row.resource)
    if (r) patch.resource = r
  }
  if (row.temporal !== undefined) {
    const t = parseTemporal(row.temporal)
    if (t) patch.temporal = t
  }
  const aspect = asString(row.aspect)
  if (aspect === 'final_due' || aspect === 'overview') patch.aspect = aspect
  const rank = asString(row.rank)
  if (rank === 'min' || rank === 'max') patch.rank = rank
  const destination = asString(row.destination)
  if (
    destination === 'preparations' ||
    destination === 'ceremony' ||
    destination === 'reception'
  ) {
    patch.destination = destination
  }
  return patch
}

function patchHasContent(patch: TaskPatch): boolean {
  return (
    patch.subject != null ||
    patch.participant != null ||
    patch.resource != null ||
    patch.temporal != null ||
    patch.aspect != null ||
    patch.rank != null ||
    patch.destination != null
  )
}

function buildCorrectionFromFields(input: {
  op: string
  correctionRaw: unknown
  subject: TaskSubject | null
  resource: TaskReference | null
  participant: TaskReference | null
  temporal: TaskTemporal | null
  qualifiers: TaskQualifiers
  flatPatch?: TaskPatch
}): TaskCorrection | null {
  const { op } = input
  let targetSlot: TaskCorrectionSlot | null = null
  let patch: TaskPatch = { ...(input.flatPatch ?? {}) }

  if (input.correctionRaw && typeof input.correctionRaw === 'object') {
    const c = input.correctionRaw as Record<string, unknown>
    const slot = asString(c.targetSlot)
    if (slot && CORRECTION_SLOTS.has(slot as TaskCorrectionSlot)) {
      targetSlot = slot as TaskCorrectionSlot
    }
    if (c.patch && typeof c.patch === 'object') {
      patch = { ...patch, ...parsePatch(c.patch) }
    }
  }

  // Fallback: top-level changed slots when model puts correction values there
  if (op === 'correction' && !patchHasContent(patch)) {
    if (input.subject) patch.subject = input.subject
    if (input.participant) patch.participant = input.participant
    if (input.resource) patch.resource = input.resource
    if (input.temporal) patch.temporal = input.temporal
    if (input.qualifiers.aspect) patch.aspect = input.qualifiers.aspect
    if (input.qualifiers.rank) patch.rank = input.qualifiers.rank
    if (input.qualifiers.destination) {
      patch.destination = input.qualifiers.destination
    }
  }

  if (op === 'correction') {
    if (!targetSlot) {
      if (patch.participant) targetSlot = 'participant'
      else if (patch.temporal) targetSlot = 'temporal'
      else if (patch.subject) {
        targetSlot =
          patch.subject === 'paid' ||
          patch.subject === 'remaining' ||
          patch.subject === 'deposit' ||
          patch.subject === 'contract_value' ||
          patch.subject === 'payment'
            ? 'metric'
            : 'subject'
      } else if (patch.resource) targetSlot = 'resource'
      else if (patch.destination) targetSlot = 'scope'
      else if (patch.rank) targetSlot = 'metric'
    }
    return { targetSlot, patch }
  }

  if (targetSlot || patchHasContent(patch)) {
    return { targetSlot, patch }
  }
  return null
}

/** Validate nested TaskSpec payload. */
export function validateAssistantTaskSpec(
  raw: unknown,
): AssistantTaskSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const version = row.version
  if (version !== 1 && version !== ASSISTANT_TASK_SPEC_VERSION) return null

  const op = asString(row.op)
  if (!op || !OPS.has(op as TaskOperation)) return null

  const subjectRaw = asString(row.subject)
  const subject =
    subjectRaw && SUBJECTS.has(subjectRaw as TaskSubject)
      ? (subjectRaw as TaskSubject)
      : null

  const resource = parseRef(row.resource)
  if (row.resource != null && resource === null) return null
  const participant = parseRef(row.participant)
  if (row.participant != null && participant === null) return null
  const temporal = parseTemporal(row.temporal)
  if (row.temporal != null && temporal === null) {
    const t = row.temporal
    if (typeof t === 'object' && t && ('phrase' in t || 'kind' in t)) {
      const phrase = (t as Record<string, unknown>).phrase
      const kind = (t as Record<string, unknown>).kind
      if (
        (typeof phrase === 'string' && phrase.trim()) ||
        (typeof kind === 'string' && kind.trim())
      ) {
        return null
      }
    }
  }
  const qualifiers = parseQualifiers(row.qualifiers)
  const flatPatch =
    row.patch && typeof row.patch === 'object'
      ? parsePatch(row.patch)
      : undefined

  const correction = buildCorrectionFromFields({
    op,
    correctionRaw: row.correction,
    subject,
    resource,
    participant,
    temporal,
    qualifiers,
    flatPatch,
  })

  // For correction ops, clear redundant top-level slots that live in patch
  let outSubject = subject
  let outResource = resource
  let outParticipant = participant
  let outTemporal = temporal
  let outQualifiers = qualifiers
  if (op === 'correction' && correction) {
    outSubject = null
    outResource = null
    outParticipant = null
    outTemporal = null
    outQualifiers = emptyQualifiers()
  }

  const spec: AssistantTaskSpec = {
    version: ASSISTANT_TASK_SPEC_VERSION,
    op: op as TaskOperation,
    subject: outSubject,
    resource: outResource,
    participant: outParticipant,
    temporal: outTemporal,
    qualifiers: outQualifiers,
    correction,
    fieldSource: parseFieldSource(row.fieldSource),
  }

  return normalizeAssistantTaskSpec(spec)
}

function refFromFlat(
  kind: string | null,
  value: string | null,
): TaskReference | null {
  if (!kind) return null
  if (kind === 'explicit' && value) return { kind: 'explicit', value }
  if (
    kind === 'active_resource' ||
    kind === 'active_participant' ||
    kind === 'active_collection' ||
    kind === 'sequence_cursor' ||
    kind === 'temporal_schedule' ||
    kind === 'inherit'
  ) {
    return { kind }
  }
  return null
}

/** Normalize Edge flat TaskSpec JSON. */
export function parseFlatTaskSpecPayload(
  raw: unknown,
): AssistantTaskSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>

  const resource = refFromFlat(
    asString(row.resourceKind),
    asString(row.resourceValue),
  )
  const participant = refFromFlat(
    asString(row.participantKind),
    asString(row.participantValue),
  )
  const temporalPhrase = asString(row.temporalPhrase)
  const temporalKind = asString(row.temporalKind)
  const temporal =
    temporalPhrase || temporalKind
      ? {
          phrase: temporalPhrase,
          kind:
            temporalKind && TEMPORAL_KINDS.has(temporalKind as TaskTemporalKind)
              ? (temporalKind as TaskTemporalKind)
              : null,
        }
      : null

  const patch: TaskPatch = {}
  const patchSubject = asString(row.patchSubject)
  if (patchSubject && SUBJECTS.has(patchSubject as TaskSubject)) {
    patch.subject = patchSubject as TaskSubject
  }
  const patchResource = refFromFlat(
    asString(row.patchResourceKind),
    asString(row.patchResourceValue),
  )
  if (patchResource) patch.resource = patchResource
  const patchParticipant = refFromFlat(
    asString(row.patchParticipantKind),
    asString(row.patchParticipantValue),
  )
  if (patchParticipant) patch.participant = patchParticipant
  const pPhrase = asString(row.patchTemporalPhrase)
  const pKind = asString(row.patchTemporalKind)
  if (pPhrase || pKind) {
    patch.temporal = {
      phrase: pPhrase,
      kind:
        pKind && TEMPORAL_KINDS.has(pKind as TaskTemporalKind)
          ? (pKind as TaskTemporalKind)
          : null,
    }
  }
  const pAspect = asString(row.patchAspect)
  if (pAspect === 'final_due' || pAspect === 'overview') patch.aspect = pAspect
  const pRank = asString(row.patchRank)
  if (pRank === 'min' || pRank === 'max') patch.rank = pRank
  const pDest = asString(row.patchDestination)
  if (
    pDest === 'preparations' ||
    pDest === 'ceremony' ||
    pDest === 'reception'
  ) {
    patch.destination = pDest
  }

  const nested = {
    version: 1,
    op: row.op,
    subject: row.subject === 'null' || row.subject === null ? null : row.subject,
    resource,
    participant,
    temporal,
    qualifiers: {
      aspect: row.aspect,
      rank: row.rank,
      destination: row.destination,
      titleHint: row.titleHint,
      unsupportedReason: row.unsupportedReason,
    },
    patch,
    correction:
      row.correctionTargetSlot != null || asString(row.op) === 'correction'
        ? { targetSlot: row.correctionTargetSlot, patch }
        : null,
    fieldSource: {
      op: row.fieldSourceOp,
      subject: row.fieldSourceSubject,
      resource: row.fieldSourceResource,
      participant: row.fieldSourceParticipant,
      temporal: row.fieldSourceTemporal,
    },
  }

  return validateAssistantTaskSpec(nested)
}

/**
 * Tiny deterministic canonicalizer — schema equivalence only, no NL rewrite.
 * - missing resource on inherit/ellipsis → inherit ref when fieldSource says inherit
 * - get_next without resource → sequence_cursor
 */
export function normalizeAssistantTaskSpec(
  spec: AssistantTaskSpec,
): AssistantTaskSpec {
  const next = { ...spec, fieldSource: { ...spec.fieldSource }, qualifiers: { ...spec.qualifiers } }

  if (next.op === 'get_next' && !next.resource) {
    next.resource = { kind: 'sequence_cursor' }
    if (next.fieldSource.resource === 'omitted') {
      next.fieldSource.resource = 'explicit'
    }
  }

  if (
    (next.op === 'inherit' || next.fieldSource.resource === 'inherit') &&
    !next.resource
  ) {
    next.resource = { kind: 'inherit' }
  }

  if (
    next.op === 'inherit' &&
    next.fieldSource.subject === 'omitted' &&
    !next.subject
  ) {
    next.fieldSource.subject = 'inherit'
  }

  return next
}
