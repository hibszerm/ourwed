/**
 * Strict flat JSON Schema for V4 TaskSpec (OpenAI structured outputs).
 * Phase 2.5: correction patch* fields.
 */

export const ASSISTANT_V4_TASKSPEC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'op',
    'subject',
    'resourceKind',
    'resourceValue',
    'participantKind',
    'participantValue',
    'temporalPhrase',
    'temporalKind',
    'aspect',
    'rank',
    'destination',
    'titleHint',
    'unsupportedReason',
    'correctionTargetSlot',
    'patchSubject',
    'patchResourceKind',
    'patchResourceValue',
    'patchParticipantKind',
    'patchParticipantValue',
    'patchTemporalPhrase',
    'patchTemporalKind',
    'patchAspect',
    'patchRank',
    'patchDestination',
    'fieldSourceOp',
    'fieldSourceSubject',
    'fieldSourceResource',
    'fieldSourceParticipant',
    'fieldSourceTemporal',
  ],
  properties: {
    version: { type: 'number', enum: [1] },
    op: {
      type: 'string',
      enum: [
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
      ],
    },
    subject: {
      type: ['string', 'null'],
      enum: [
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
        null,
      ],
    },
    resourceKind: {
      type: ['string', 'null'],
      enum: [
        'explicit',
        'active_resource',
        'active_participant',
        'active_collection',
        'sequence_cursor',
        'temporal_schedule',
        'inherit',
        null,
      ],
    },
    resourceValue: { type: ['string', 'null'] },
    participantKind: {
      type: ['string', 'null'],
      enum: [
        'explicit',
        'active_resource',
        'active_participant',
        'active_collection',
        'sequence_cursor',
        'temporal_schedule',
        'inherit',
        null,
      ],
    },
    participantValue: { type: ['string', 'null'] },
    temporalPhrase: { type: ['string', 'null'] },
    temporalKind: {
      type: ['string', 'null'],
      enum: ['day', 'range', 'point', 'inherit', null],
    },
    aspect: {
      type: ['string', 'null'],
      enum: ['final_due', 'overview', null],
    },
    rank: {
      type: ['string', 'null'],
      enum: ['min', 'max', null],
    },
    destination: {
      type: ['string', 'null'],
      enum: ['preparations', 'ceremony', 'reception', null],
    },
    titleHint: { type: ['string', 'null'] },
    unsupportedReason: { type: ['string', 'null'] },
    correctionTargetSlot: {
      type: ['string', 'null'],
      enum: [
        'resource',
        'participant',
        'subject',
        'temporal',
        'metric',
        'scope',
        null,
      ],
    },
    patchSubject: {
      type: ['string', 'null'],
      enum: [
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
        null,
      ],
    },
    patchResourceKind: {
      type: ['string', 'null'],
      enum: [
        'explicit',
        'active_resource',
        'active_participant',
        'active_collection',
        'sequence_cursor',
        'temporal_schedule',
        'inherit',
        null,
      ],
    },
    patchResourceValue: { type: ['string', 'null'] },
    patchParticipantKind: {
      type: ['string', 'null'],
      enum: [
        'explicit',
        'active_resource',
        'active_participant',
        'active_collection',
        'sequence_cursor',
        'temporal_schedule',
        'inherit',
        null,
      ],
    },
    patchParticipantValue: { type: ['string', 'null'] },
    patchTemporalPhrase: { type: ['string', 'null'] },
    patchTemporalKind: {
      type: ['string', 'null'],
      enum: ['day', 'range', 'point', 'inherit', null],
    },
    patchAspect: {
      type: ['string', 'null'],
      enum: ['final_due', 'overview', null],
    },
    patchRank: {
      type: ['string', 'null'],
      enum: ['min', 'max', null],
    },
    patchDestination: {
      type: ['string', 'null'],
      enum: ['preparations', 'ceremony', 'reception', null],
    },
    fieldSourceOp: {
      type: 'string',
      enum: ['explicit', 'inherit', 'correction', 'omitted'],
    },
    fieldSourceSubject: {
      type: 'string',
      enum: ['explicit', 'inherit', 'correction', 'omitted'],
    },
    fieldSourceResource: {
      type: 'string',
      enum: ['explicit', 'inherit', 'correction', 'omitted'],
    },
    fieldSourceParticipant: {
      type: 'string',
      enum: ['explicit', 'inherit', 'correction', 'omitted'],
    },
    fieldSourceTemporal: {
      type: 'string',
      enum: ['explicit', 'inherit', 'correction', 'omitted'],
    },
  },
} as const

const OPS = new Set([
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

const SUBJECTS = new Set([
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

const REF_KINDS = new Set([
  'explicit',
  'active_resource',
  'active_participant',
  'active_collection',
  'sequence_cursor',
  'temporal_schedule',
  'inherit',
])

const TEMPORAL_KINDS = new Set(['day', 'range', 'point', 'inherit'])
const FIELD_SOURCES = new Set([
  'explicit',
  'inherit',
  'correction',
  'omitted',
])
const CORRECTION_SLOTS = new Set([
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

function safeRefValue(v: string | null): string | null {
  if (!v) return null
  if (UUID_RE.test(v) || FORBIDDEN.test(v)) return null
  return v
}

/** Parse + validate flat V4 TaskSpec from model. */
export function parseFlatV4TaskSpecPayload(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (row.version !== 1) return null

  const op = asString(row.op)
  if (!op || !OPS.has(op)) return null

  const subjectRaw = asString(row.subject)
  const subject = subjectRaw && SUBJECTS.has(subjectRaw) ? subjectRaw : null

  const resourceKind = asString(row.resourceKind)
  const resourceValue = safeRefValue(asString(row.resourceValue))
  if (resourceKind && !REF_KINDS.has(resourceKind)) return null
  if (asString(row.resourceValue) && !resourceValue && resourceKind === 'explicit') {
    return null
  }

  const participantKind = asString(row.participantKind)
  const participantValue = safeRefValue(asString(row.participantValue))
  if (participantKind && !REF_KINDS.has(participantKind)) return null
  if (
    asString(row.participantValue) &&
    !participantValue &&
    participantKind === 'explicit'
  ) {
    return null
  }

  const temporalPhrase = asString(row.temporalPhrase)
  if (temporalPhrase && FORBIDDEN.test(temporalPhrase)) return null
  const temporalKind = asString(row.temporalKind)
  if (temporalKind && !TEMPORAL_KINDS.has(temporalKind)) return null

  const aspect = asString(row.aspect)
  if (aspect && aspect !== 'final_due' && aspect !== 'overview') return null
  const rank = asString(row.rank)
  if (rank && rank !== 'min' && rank !== 'max') return null
  const destination = asString(row.destination)
  if (
    destination &&
    destination !== 'preparations' &&
    destination !== 'ceremony' &&
    destination !== 'reception'
  ) {
    return null
  }

  const titleHint = asString(row.titleHint)
  if (titleHint && (UUID_RE.test(titleHint) || FORBIDDEN.test(titleHint))) {
    return null
  }

  const correctionTargetSlot = asString(row.correctionTargetSlot)
  if (correctionTargetSlot && !CORRECTION_SLOTS.has(correctionTargetSlot)) {
    return null
  }

  const patchSubjectRaw = asString(row.patchSubject)
  const patchSubject =
    patchSubjectRaw && SUBJECTS.has(patchSubjectRaw) ? patchSubjectRaw : null
  const patchResourceKind = asString(row.patchResourceKind)
  if (patchResourceKind && !REF_KINDS.has(patchResourceKind)) return null
  const patchResourceValue = safeRefValue(asString(row.patchResourceValue))
  const patchParticipantKind = asString(row.patchParticipantKind)
  if (patchParticipantKind && !REF_KINDS.has(patchParticipantKind)) return null
  const patchParticipantValue = safeRefValue(
    asString(row.patchParticipantValue),
  )
  const patchTemporalPhrase = asString(row.patchTemporalPhrase)
  if (patchTemporalPhrase && FORBIDDEN.test(patchTemporalPhrase)) return null
  const patchTemporalKind = asString(row.patchTemporalKind)
  if (patchTemporalKind && !TEMPORAL_KINDS.has(patchTemporalKind)) return null
  const patchAspect = asString(row.patchAspect)
  if (patchAspect && patchAspect !== 'final_due' && patchAspect !== 'overview') {
    return null
  }
  const patchRank = asString(row.patchRank)
  if (patchRank && patchRank !== 'min' && patchRank !== 'max') return null
  const patchDestination = asString(row.patchDestination)
  if (
    patchDestination &&
    patchDestination !== 'preparations' &&
    patchDestination !== 'ceremony' &&
    patchDestination !== 'reception'
  ) {
    return null
  }

  for (const key of [
    'fieldSourceOp',
    'fieldSourceSubject',
    'fieldSourceResource',
    'fieldSourceParticipant',
    'fieldSourceTemporal',
  ]) {
    const fs = asString(row[key])
    if (!fs || !FIELD_SOURCES.has(fs)) return null
  }

  return {
    version: 1,
    op,
    subject,
    resourceKind,
    resourceValue: resourceKind === 'explicit' ? resourceValue : null,
    participantKind,
    participantValue: participantKind === 'explicit' ? participantValue : null,
    temporalPhrase,
    temporalKind,
    aspect: aspect === 'final_due' || aspect === 'overview' ? aspect : null,
    rank: rank === 'min' || rank === 'max' ? rank : null,
    destination:
      destination === 'preparations' ||
      destination === 'ceremony' ||
      destination === 'reception'
        ? destination
        : null,
    titleHint: titleHint ? titleHint.slice(0, 120) : null,
    unsupportedReason: asString(row.unsupportedReason)?.slice(0, 80) ?? null,
    correctionTargetSlot,
    patchSubject,
    patchResourceKind,
    patchResourceValue:
      patchResourceKind === 'explicit' ? patchResourceValue : null,
    patchParticipantKind,
    patchParticipantValue:
      patchParticipantKind === 'explicit' ? patchParticipantValue : null,
    patchTemporalPhrase,
    patchTemporalKind,
    patchAspect:
      patchAspect === 'final_due' || patchAspect === 'overview'
        ? patchAspect
        : null,
    patchRank: patchRank === 'min' || patchRank === 'max' ? patchRank : null,
    patchDestination:
      patchDestination === 'preparations' ||
      patchDestination === 'ceremony' ||
      patchDestination === 'reception'
        ? patchDestination
        : null,
    fieldSourceOp: asString(row.fieldSourceOp),
    fieldSourceSubject: asString(row.fieldSourceSubject),
    fieldSourceResource: asString(row.fieldSourceResource),
    fieldSourceParticipant: asString(row.fieldSourceParticipant),
    fieldSourceTemporal: asString(row.fieldSourceTemporal),
  }
}
