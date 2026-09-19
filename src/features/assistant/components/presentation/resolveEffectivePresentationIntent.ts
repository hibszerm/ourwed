/**
 * Phase 2H.1 — effective presentation intent with elliptical follow-up continuity.
 * Presentation-only. No model / CRM / contract mutation.
 */

import {
  classifyPresentationIntent,
  type PresentationIntent,
} from './classifyPresentationIntent'

/** Direct scalar result intents that may safely continue across short follow-ups. */
export const INHERITABLE_PRESENTATION_INTENTS = new Set<PresentationIntent>([
  'phone',
  'email',
  'address',
])

function normalizeUtterance(raw: string): string {
  return raw
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasAny(hay: string, needles: readonly string[]): boolean {
  return needles.some((n) => hay.includes(n))
}

/** Referential / continuation language — not a full intent catalog. */
const REFERENTIAL = [
  'jego',
  'jej',
  'niego',
  'niej',
  'nim',
  'nia',
  'drugi',
  'druga',
  'drugie',
  'ten drugi',
  'ta druga',
  'pana mlodego',
  'panny mlodej',
  'a co z',
] as const

/**
 * Conservative elliptical / anaphoric follow-up heuristic.
 * Explicit intents still win via classifyPresentationIntent.
 */
export function isEllipticalPresentationFollowUp(utterance: string): boolean {
  const u = normalizeUtterance(utterance)
  if (!u) return false
  if (u.length > 48) return false

  const words = u.replace(/[?!.…]+$/g, '').split(' ').filter(Boolean)
  if (words.length === 0 || words.length > 8) return false

  // Bare pronoun / bare "a <pronoun>"
  if (/^(jego|jej|niego|niej)\??$/.test(u.replace(/[?!.…]+$/g, ''))) return true
  if (/^a\s+(jego|jej|niego|niej|drugi|druga|drugie)\b/.test(u)) return true

  // Short "a …?" continuation with referential language
  if (/^a\s+/.test(u) && words.length <= 6 && hasAny(u, REFERENTIAL)) return true

  // Other short referential continuations without a new category word
  if (words.length <= 5 && hasAny(u, REFERENTIAL)) return true

  return false
}

export type EffectivePresentationIntentResult = {
  rawIntent: PresentationIntent
  effectiveIntent: PresentationIntent
  inherited: boolean
}

/**
 * Resolve display intent for this turn.
 * Explicit current-turn intent always wins; inheritance only when raw is general
 * and the utterance is a short elliptical follow-up after an inheritable intent.
 */
export function resolveEffectivePresentationIntent(input: {
  utterance: string
  previousEffectiveIntent: PresentationIntent | null
}): EffectivePresentationIntentResult {
  const rawIntent = classifyPresentationIntent(input.utterance)
  const prev = input.previousEffectiveIntent

  if (rawIntent !== 'general') {
    return { rawIntent, effectiveIntent: rawIntent, inherited: false }
  }

  if (
    prev &&
    INHERITABLE_PRESENTATION_INTENTS.has(prev) &&
    isEllipticalPresentationFollowUp(input.utterance)
  ) {
    return { rawIntent, effectiveIntent: prev, inherited: true }
  }

  return { rawIntent, effectiveIntent: 'general', inherited: false }
}
