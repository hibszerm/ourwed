/**
 * Phase 2.6 — End-state / functional equivalence scoring (diagnostic layer).
 * Does not change relational requireCorrection expectations.
 */

import type { TaskSpecExpectation } from '../expect'
import type { AssistantTaskSpec, TaskSubject } from '../taskSpec'
import { METRIC_EQUIVALENCE_SUBJECTS } from './protocolReview'

function includesCi(hay: string | null | undefined, needle: string): boolean {
  if (!hay) return false
  return hay.toLowerCase().includes(needle.toLowerCase())
}

function matchOne<T>(actual: T, expected: T | T[] | undefined): boolean {
  if (expected === undefined) return true
  if (Array.isArray(expected)) return expected.includes(actual)
  return actual === expected
}

function effectiveSubject(spec: AssistantTaskSpec): TaskSubject | null {
  if (spec.op === 'correction') {
    return spec.correction?.patch.subject ?? spec.subject
  }
  return spec.subject
}

function effectiveParticipant(spec: AssistantTaskSpec): string | null {
  if (spec.op === 'correction') {
    const p = spec.correction?.patch.participant
    if (p?.kind === 'explicit') return p.value
  }
  if (spec.participant?.kind === 'explicit') return spec.participant.value
  return null
}

function effectiveTemporalPhrase(spec: AssistantTaskSpec): string {
  if (spec.op === 'correction') {
    return spec.correction?.patch.temporal?.phrase ?? spec.temporal?.phrase ?? ''
  }
  return spec.temporal?.phrase ?? ''
}

function hasInheritSignal(spec: AssistantTaskSpec): boolean {
  return (
    spec.resource?.kind === 'inherit' ||
    spec.resource?.kind === 'active_resource' ||
    spec.resource?.kind === 'active_collection' ||
    spec.fieldSource.resource === 'inherit' ||
    spec.fieldSource.op === 'inherit' ||
    spec.participant?.kind === 'inherit' ||
    spec.temporal?.kind === 'inherit'
  )
}

/**
 * True when actual TaskSpec encodes the intended final meaning even if
 * relational op differs (e.g. get_amount paid vs correction→paid).
 */
export function scoreCorrectedEndState(
  actual: AssistantTaskSpec,
  expected: TaskSpecExpectation,
  tags: string[] = [],
): {
  endStateOk: boolean
  functionalEquivalent: boolean
  relationOk: boolean
  patchOk: boolean
  reason: string
} {
  const relationOk =
    expected.requireCorrection === true
      ? actual.op === 'correction'
      : expected.forbidCorrection === true
        ? actual.op !== 'correction'
        : true

  let patchOk = true
  if (expected.requireCorrection) {
    if (actual.op === 'correction') {
      if (expected.patchSubject !== undefined) {
        patchOk = matchOne(
          actual.correction?.patch.subject ?? actual.subject,
          expected.patchSubject,
        )
      }
      if (expected.participantValue != null) {
        const pv = effectiveParticipant(actual)
        patchOk =
          patchOk && Boolean(pv && includesCi(pv, expected.participantValue))
      }
      if (expected.temporalPhraseIncludes?.length) {
        const phrase = effectiveTemporalPhrase(actual)
        patchOk =
          patchOk &&
          expected.temporalPhraseIncludes.some((p) => includesCi(phrase, p))
      }
      if (expected.correctionSlot != null) {
        const slot = actual.correction?.targetSlot ?? null
        const softMetric =
          expected.correctionSlot === 'metric' &&
          (slot === 'metric' || slot === 'subject')
        patchOk =
          patchOk && (slot === expected.correctionSlot || softMetric)
      }
    } else {
      patchOk = false
    }
  }

  // Relational pass ⇒ end-state pass
  if (relationOk && patchOk && expected.requireCorrection) {
    return {
      endStateOk: true,
      functionalEquivalent: false,
      relationOk,
      patchOk,
      reason: 'relational_patch_ok',
    }
  }

  const allowMetricEquiv =
    tags.includes('metric-equivalence-ok') ||
    expected.correctionSlot === 'metric' ||
    (Array.isArray(expected.patchSubject)
      ? expected.patchSubject.some((s) => METRIC_EQUIVALENCE_SUBJECTS.has(s))
      : expected.patchSubject != null &&
        METRIC_EQUIVALENCE_SUBJECTS.has(expected.patchSubject))

  // Functional equivalence: explicit get_amount (or rank) with target subject
  if (expected.requireCorrection && allowMetricEquiv) {
    const targetSubjects = (expected.patchSubject ??
      expected.subject) as TaskSubject | TaskSubject[] | null | undefined
    const subOk = matchOne(effectiveSubject(actual), targetSubjects)
    const opOk =
      actual.op === 'get_amount' ||
      actual.op === 'rank' ||
      actual.op === 'sum' ||
      actual.op === 'get'
    if (subOk && opOk && hasInheritSignal(actual)) {
      return {
        endStateOk: true,
        functionalEquivalent: true,
        relationOk,
        patchOk,
        reason: 'metric_explicit_with_inherit',
      }
    }
    if (subOk && opOk) {
      return {
        endStateOk: true,
        functionalEquivalent: true,
        relationOk,
        patchOk,
        reason: 'metric_explicit_end_state',
      }
    }
  }

  // Participant / temporal / subject: end-state if slots match even with wrong op
  if (expected.requireCorrection) {
    let slotsOk = true
    if (expected.participantValue != null) {
      const pv = effectiveParticipant(actual)
      slotsOk = Boolean(pv && includesCi(pv, expected.participantValue))
    }
    if (expected.temporalPhraseIncludes?.length) {
      const phrase = effectiveTemporalPhrase(actual)
      slotsOk =
        slotsOk &&
        expected.temporalPhraseIncludes.some((p) => includesCi(phrase, p))
    }
    if (expected.patchSubject !== undefined || expected.subject !== undefined) {
      slotsOk =
        slotsOk &&
        matchOne(
          effectiveSubject(actual),
          (expected.patchSubject ?? expected.subject) as
            | TaskSubject
            | TaskSubject[]
            | null
            | undefined,
        )
    }
    if (slotsOk && (expected.participantValue || expected.temporalPhraseIncludes)) {
      // Without inherit/prep preservation we still mark end-state cautiously
      const preservedScope =
        hasInheritSignal(actual) ||
        actual.op === 'correction' ||
        actual.subject === 'preparations' ||
        actual.op === 'get_location' ||
        actual.op === 'count'
      return {
        endStateOk: preservedScope,
        functionalEquivalent: preservedScope && !relationOk,
        relationOk,
        patchOk,
        reason: preservedScope
          ? 'slot_match_with_scope_signal'
          : 'slot_match_but_scope_risk',
      }
    }
  }

  // Non-correction cases: end-state ≈ relational field match on op/subject
  if (!expected.requireCorrection) {
    const opOk = matchOne(actual.op, expected.op)
    const subOk =
      expected.subject === undefined ||
      matchOne(effectiveSubject(actual), expected.subject as TaskSubject | null)
    return {
      endStateOk: opOk && subOk && relationOk,
      functionalEquivalent: false,
      relationOk,
      patchOk: true,
      reason: opOk && subOk ? 'non_correction_match' : 'non_correction_mismatch',
    }
  }

  return {
    endStateOk: false,
    functionalEquivalent: false,
    relationOk,
    patchOk,
    reason: 'end_state_fail',
  }
}
