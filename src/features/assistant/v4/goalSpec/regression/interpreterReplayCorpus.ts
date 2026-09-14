/**
 * S0 — Compact interpreter replay corpus (documentation / later live gate).
 * Deterministic CI does NOT execute Luna. Expected outcomes are typed GoalSpec shapes.
 */

export type InterpreterReplayFamily =
  | 'explicit_money_query'
  | 'temporal_follow_up'
  | 'list_projection_follow_up'
  | 'venue_filter'
  | 'ambiguous_measure'
  | 'correction'
  | 'zero_result_follow_up'
  | 'unsupported_or_capability_unavailable'

export type InterpreterReplayEntry = {
  id: string
  family: InterpreterReplayFamily
  /** Documentation label only. */
  utteranceLabel: string
  /** Expected semantic family — not live Luna output. */
  expectedSemanticFamily: string
  /** Reuse pointer into existing G8/U4 artifacts when available. */
  relatedArtifact?: string
}

/**
 * Must-not-regress replay subset for a future live/shadow quality gate.
 * Not run by semanticRegressionAcceptance (deterministic CI).
 */
export const INTERPRETER_REPLAY_CORPUS: readonly InterpreterReplayEntry[] = [
  {
    id: 'ir-1',
    family: 'explicit_money_query',
    utteranceLabel: 'Ile już wpłynęło z wesel w sierpniu?',
    expectedSemanticFamily: 'sum + wedding.paid_amount + wedding.date August',
    relatedArtifact: 'g8BenchmarkCorpus / U4 Luna smoke',
  },
  {
    id: 'ir-2',
    family: 'temporal_follow_up',
    utteranceLabel: 'a w przyszłym roku?',
    expectedSemanticFamily: 'inherit measure/agg; replace temporal → year',
  },
  {
    id: 'ir-3',
    family: 'list_projection_follow_up',
    utteranceLabel: 'pokaż je',
    expectedSemanticFamily: 'inherit filters/temporal; aggregation list',
  },
  {
    id: 'ir-4',
    family: 'venue_filter',
    utteranceLabel: 'Villa Love weddings…',
    expectedSemanticFamily: 'wedding source + place.name relation',
  },
  {
    id: 'ir-5',
    family: 'ambiguous_measure',
    utteranceLabel: 'Ile to będzie?',
    expectedSemanticFamily: 'sum + null measure → NeedsClarification(measure)',
  },
  {
    id: 'ir-6',
    family: 'correction',
    utteranceLabel: 'nie, chodziło o pozostało',
    expectedSemanticFamily: 'correct measure slot; preserve collection context',
  },
  {
    id: 'ir-7',
    family: 'zero_result_follow_up',
    utteranceLabel: 'pokaż je (after empty Villa Love year)',
    expectedSemanticFamily: 'same DomainQuery identity; empty list ok',
  },
  {
    id: 'ir-8',
    family: 'unsupported_or_capability_unavailable',
    utteranceLabel: 'wygeneruj fakturę / porada VAT',
    expectedSemanticFamily:
      'UNINTERPRETABLE | OUT_OF_SCOPE | CAPABILITY_UNAVAILABLE (not clarification)',
  },
]
