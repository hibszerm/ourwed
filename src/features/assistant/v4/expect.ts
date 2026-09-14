/**
 * TaskSpec expectation matching for benchmark (deterministic scoring).
 */

import type {
  AssistantTaskSpec,
  TaskOperation,
  TaskReference,
  TaskSubject,
} from './taskSpec'
import { emptyQualifiers } from './taskSpec'

export type TaskSpecExpectation = {
  op?: TaskOperation | TaskOperation[]
  subject?: TaskSubject | TaskSubject[] | null
  /** For corrections: also checks correction.patch.subject */
  patchSubject?: TaskSubject | TaskSubject[] | null
  participantValue?: string | null
  participantKind?: TaskReference['kind'] | null
  resourceKind?: TaskReference['kind'] | null
  temporalPhraseIncludes?: string[]
  temporalKind?: 'day' | 'range' | 'point' | 'inherit' | null
  aspect?: 'final_due' | 'overview' | null
  rank?: 'min' | 'max' | null
  destination?: 'preparations' | 'ceremony' | 'reception' | null
  correctionSlot?:
    | 'resource'
    | 'participant'
    | 'subject'
    | 'temporal'
    | 'metric'
    | 'scope'
    | null
  fieldSourceOp?: AssistantTaskSpec['fieldSource']['op']
  requireInheritSignal?: boolean
  requireCorrection?: boolean
  requireExplicitSubject?: boolean
  /** Expected NOT correction (negative cases). */
  forbidCorrection?: boolean
}

export type FieldDiff = {
  field: string
  expected: string
  actual: string
}

export type MatchResult = {
  ok: boolean
  exactCore: boolean
  diffs: FieldDiff[]
  scores: {
    operation: boolean
    subject: boolean
    participant: boolean
    temporal: boolean
    correction: boolean
    ellipsis: boolean
    sequence: boolean
    explicitOverride: boolean
  }
}

function includesCi(hay: string | null | undefined, needle: string): boolean {
  if (!hay) return false
  return hay.toLowerCase().includes(needle.toLowerCase())
}

function matchOne<T>(actual: T, expected: T | T[] | undefined): boolean {
  if (expected === undefined) return true
  if (Array.isArray(expected)) return expected.includes(actual)
  return actual === expected
}

function participantValue(spec: AssistantTaskSpec): string | null {
  if (spec.participant?.kind === 'explicit') return spec.participant.value
  if (spec.correction?.patch.participant?.kind === 'explicit') {
    return spec.correction.patch.participant.value
  }
  return null
}

function patchSubject(spec: AssistantTaskSpec): TaskSubject | null {
  return spec.correction?.patch.subject ?? spec.subject
}

export function matchTaskSpecExpectation(
  actual: AssistantTaskSpec,
  expected: TaskSpecExpectation,
): MatchResult {
  const diffs: FieldDiff[] = []

  const operation = matchOne(actual.op, expected.op)
  if (!operation && expected.op !== undefined) {
    diffs.push({
      field: 'op',
      expected: Array.isArray(expected.op)
        ? expected.op.join('|')
        : String(expected.op),
      actual: actual.op,
    })
  }

  // Phase 2.7: ellipsis inherit ≡ explicit get_* when inherit signal required
  let operationEffective = operation
  if (
    !operationEffective &&
    expected.requireInheritSignal &&
    actual.op === 'inherit' &&
    expected.op !== undefined
  ) {
    const ops = Array.isArray(expected.op) ? expected.op : [expected.op]
    if (
      ops.some((o) =>
        [
          'get',
          'get_location',
          'get_time',
          'get_amount',
          'get_distance',
          'inherit',
        ].includes(o),
      )
    ) {
      operationEffective = true
      for (let i = diffs.length - 1; i >= 0; i--) {
        if (diffs[i]?.field === 'op') diffs.splice(i, 1)
      }
    }
  }

  const subject = matchOne(
    actual.op === 'correction' ? patchSubject(actual) : actual.subject,
    expected.subject as TaskSubject | TaskSubject[] | null | undefined,
  )
  if (!subject && expected.subject !== undefined) {
    diffs.push({
      field: 'subject',
      expected: Array.isArray(expected.subject)
        ? expected.subject.map(String).join('|')
        : String(expected.subject),
      actual: String(
        actual.op === 'correction' ? patchSubject(actual) : actual.subject,
      ),
    })
  }

  if (expected.patchSubject !== undefined) {
    if (!matchOne(patchSubject(actual), expected.patchSubject)) {
      diffs.push({
        field: 'patchSubject',
        expected: Array.isArray(expected.patchSubject)
          ? expected.patchSubject.map(String).join('|')
          : String(expected.patchSubject),
        actual: String(patchSubject(actual)),
      })
    }
  }

  if (expected.forbidCorrection) {
    if (actual.op === 'correction') {
      diffs.push({
        field: 'op',
        expected: 'not_correction',
        actual: 'correction',
      })
    }
  }

  let participant = true
  if (expected.participantValue != null) {
    const pv = participantValue(actual)
    participant = Boolean(
      pv && includesCi(pv, expected.participantValue),
    )
    if (!participant) {
      diffs.push({
        field: 'participantValue',
        expected: expected.participantValue,
        actual: pv ?? 'null',
      })
    }
  }
  if (expected.participantKind != null) {
    const pk = actual.participant?.kind ?? null
    if (pk !== expected.participantKind) {
      participant = false
      diffs.push({
        field: 'participantKind',
        expected: expected.participantKind,
        actual: String(pk),
      })
    }
  }

  if (expected.resourceKind != null) {
    const rk = actual.resource?.kind ?? null
    const softNext =
      expected.resourceKind === 'sequence_cursor' &&
      (rk === 'sequence_cursor' || rk === 'inherit')
    if (rk !== expected.resourceKind && !softNext) {
      diffs.push({
        field: 'resourceKind',
        expected: expected.resourceKind,
        actual: String(rk),
      })
    }
  }

  let temporal = true
  if (expected.temporalPhraseIncludes?.length) {
    const phrase = actual.temporal?.phrase ?? ''
    temporal = expected.temporalPhraseIncludes.some((p) =>
      includesCi(phrase, p),
    )
    if (!temporal) {
      diffs.push({
        field: 'temporalPhrase',
        expected: expected.temporalPhraseIncludes.join('|'),
        actual: phrase || 'null',
      })
    }
  }
  if (expected.temporalKind !== undefined) {
    if (actual.temporal?.kind !== expected.temporalKind) {
      temporal = false
      diffs.push({
        field: 'temporalKind',
        expected: String(expected.temporalKind),
        actual: String(actual.temporal?.kind ?? null),
      })
    }
  }

  if (expected.aspect !== undefined) {
    if (actual.qualifiers.aspect !== expected.aspect) {
      diffs.push({
        field: 'aspect',
        expected: String(expected.aspect),
        actual: String(actual.qualifiers.aspect),
      })
    }
  }
  if (expected.rank !== undefined) {
    if (actual.qualifiers.rank !== expected.rank) {
      diffs.push({
        field: 'rank',
        expected: String(expected.rank),
        actual: String(actual.qualifiers.rank),
      })
    }
  }
  if (expected.destination !== undefined) {
    const destActual = actual.qualifiers.destination
    const destOk =
      destActual === expected.destination ||
      // Phase 2.7 one-endpoint: destination optional when subject already is that endpoint
      (expected.destination != null &&
        destActual == null &&
        actual.op === 'get_distance' &&
        actual.subject === expected.destination)
    if (!destOk) {
      diffs.push({
        field: 'destination',
        expected: String(expected.destination),
        actual: String(destActual),
      })
    }
  }

  let correction = true
  if (expected.requireCorrection) {
    correction = actual.op === 'correction'
    if (!correction) {
      diffs.push({
        field: 'correction',
        expected: 'correction',
        actual: actual.op,
      })
    }
  }
  if (expected.forbidCorrection && actual.op === 'correction') {
    correction = false
  }
  if (expected.correctionSlot !== undefined) {
    const slot = actual.correction?.targetSlot ?? null
    const softMetric =
      expected.correctionSlot === 'metric' &&
      (slot === 'metric' || slot === 'subject')
    const softSubjectResource =
      expected.correctionSlot === 'subject' &&
      (slot === 'subject' || slot === 'resource') &&
      (actual.correction?.patch.subject != null ||
        expected.patchSubject === undefined ||
        matchOne(
          actual.correction?.patch.subject ?? null,
          expected.patchSubject as never,
        ))
    if (slot !== expected.correctionSlot && !softMetric && !softSubjectResource) {
      correction = false
      diffs.push({
        field: 'correctionSlot',
        expected: String(expected.correctionSlot),
        actual: String(slot),
      })
    }
  }

  // Soft temporal on correction patch
  if (
    expected.temporalPhraseIncludes?.length &&
    actual.op === 'correction' &&
    !temporal
  ) {
    const phrase = actual.correction?.patch.temporal?.phrase ?? ''
    temporal = expected.temporalPhraseIncludes.some((p) =>
      includesCi(phrase, p),
    )
    if (temporal) {
      // remove prior temporal diff if any
      for (let i = diffs.length - 1; i >= 0; i--) {
        if (diffs[i]?.field === 'temporalPhrase') diffs.splice(i, 1)
      }
    }
  }

  let ellipsis = true
  if (expected.requireInheritSignal) {
    ellipsis =
      actual.op === 'inherit' ||
      actual.fieldSource.op === 'inherit' ||
      actual.fieldSource.subject === 'inherit' ||
      actual.fieldSource.resource === 'inherit' ||
      actual.resource?.kind === 'inherit' ||
      actual.participant?.kind === 'inherit'
    if (!ellipsis) {
      diffs.push({
        field: 'ellipsis',
        expected: 'inherit signal',
        actual: `${actual.op}/${actual.fieldSource.op}`,
      })
    }
  }

  // Sequence intent: pure get_next must be get_next.
  // When get_next is one of several allowed ops (e.g. "gdzie potem" → get_location|get_next),
  // any allowed op counts — location-of-next is still sequence discourse.
  const sequence =
    expected.op === 'get_next'
      ? actual.op === 'get_next'
      : Array.isArray(expected.op) && expected.op.includes('get_next')
        ? matchOne(actual.op, expected.op)
        : true

  let explicitOverride = true
  if (expected.requireExplicitSubject) {
    explicitOverride =
      actual.fieldSource.subject === 'explicit' ||
      (actual.subject != null &&
        matchOne(actual.subject, expected.subject as TaskSubject | null | undefined))
    if (expected.op && !matchOne(actual.op, expected.op)) {
      explicitOverride = false
    }
  }

  if (expected.fieldSourceOp) {
    if (actual.fieldSource.op !== expected.fieldSourceOp) {
      diffs.push({
        field: 'fieldSourceOp',
        expected: expected.fieldSourceOp,
        actual: actual.fieldSource.op,
      })
    }
  }

  const resourceOk =
    expected.resourceKind === undefined ||
    (actual.resource?.kind ?? null) === expected.resourceKind
  const aspectOk =
    expected.aspect === undefined ||
    actual.qualifiers.aspect === expected.aspect
  const rankOk =
    expected.rank === undefined || actual.qualifiers.rank === expected.rank
  const destOk =
    expected.destination === undefined ||
    actual.qualifiers.destination === expected.destination ||
    (expected.destination != null &&
      actual.qualifiers.destination == null &&
      actual.op === 'get_distance' &&
      actual.subject === expected.destination)

  const exactCore =
    operationEffective &&
    subject &&
    participant &&
    temporal &&
    correction &&
    ellipsis &&
    resourceOk &&
    aspectOk &&
    rankOk &&
    destOk &&
    diffs.length === 0

  return {
    ok: exactCore,
    exactCore,
    diffs,
    scores: {
      operation: operationEffective,
      subject,
      participant,
      temporal,
      correction,
      ellipsis,
      sequence,
      explicitOverride,
    },
  }
}

/** Build a minimal full TaskSpec for schema tests. */
export function makeTaskSpec(
  partial: Partial<AssistantTaskSpec> & Pick<AssistantTaskSpec, 'op'>,
): AssistantTaskSpec {
  return {
    version: 1,
    op: partial.op,
    subject: partial.subject ?? null,
    resource: partial.resource ?? null,
    participant: partial.participant ?? null,
    temporal: partial.temporal ?? null,
    qualifiers: partial.qualifiers ?? emptyQualifiers(),
    correction: partial.correction ?? null,
    fieldSource: partial.fieldSource ?? {
      op: 'explicit',
      subject: partial.subject ? 'explicit' : 'omitted',
      resource: 'omitted',
      participant: 'omitted',
      temporal: 'omitted',
    },
  }
}
