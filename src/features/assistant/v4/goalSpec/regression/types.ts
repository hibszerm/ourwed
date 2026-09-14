/**
 * S0 — Semantic regression harness types.
 * Typed GoalSpec / DomainQuery contracts only. Raw NL is documentation labels.
 */

import type { DomainQuery } from '../../domainQuery/domainQuery'
import type { GoalSpec } from '../goalSpec'
import type { GoalClarificationValue } from '../goalClarificationTypes'

/** S0 case maturity relative to current production code. */
export type SemanticCaseStatus =
  | 'PASS_CURRENT'
  | 'KNOWN_GAP'
  | 'FUTURE_CAPABILITY'

/** Conceptual unsupported taxonomy (may differ from current enums). */
export type ConceptualOutcomeClass =
  | 'resolved'
  | 'needs_clarification'
  | 'uninterpretable'
  | 'out_of_scope'
  | 'understood_but_capability_unavailable'

export type SemanticSlots = {
  source?: string | null
  aggregation?: string | null
  /** DomainQuery uses aggregate; BoundGoal uses aggregation. */
  aggregate?: string | null
  measure?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  dateDimension?: string | null
  placeName?: string | null
  operation?: 'sum' | 'list' | 'count' | string | null
}

export type ExpectedResolverOutcome =
  | {
      kind: 'bound'
      slots: SemanticSlots
    }
  | {
      kind: 'needs_clarification'
      slot: 'measure' | 'entity_kind' | 'date_dimension' | 'source' | 'aggregation' | string
      /** Optional measure option values when slot=measure. */
      measureOptions?: readonly string[]
    }
  | {
      kind: 'unsupported'
      reasonIncludes?: string
      conceptualClass?: ConceptualOutcomeClass
    }

export type ClarificationResumeStep = {
  slot: 'measure' | 'entity_kind' | 'date_dimension'
  selectedValue: GoalClarificationValue
  /** Presentation label — never used as semantic authority. */
  selectedLabel?: string
}

export type SemanticRegressionTurn = {
  /** Documentation only — never fed to Resolver. */
  label?: string
  goal: GoalSpec
  activeDomainQuery?: DomainQuery | null
  pageResourceKind?: 'wedding' | null
  expected: ExpectedResolverOutcome
  /** After bound: assert DomainQuery slots (and optionally identity). */
  expectedDomainQuery?: SemanticSlots
  /** Typed clarification click after needs_clarification. */
  resume?: ClarificationResumeStep
  /** After resume: expected bound DomainQuery. */
  expectedAfterResume?: ExpectedResolverOutcome
  expectedDomainQueryAfterResume?: SemanticSlots
}

export type SemanticRegressionCase = {
  id: string
  name: string
  status: SemanticCaseStatus
  layer:
    | 'interpreter_fixture'
    | 'resolution'
    | 'domain_query'
    | 'clarification_resume'
    | 'state_ownership'
    | 'registry'
    | 'taxonomy'
  /** Human note; required for KNOWN_GAP / FUTURE_CAPABILITY. */
  note?: string
  invariants?: string[]
  turns?: SemanticRegressionTurn[]
  /**
   * Static / custom checks (Host source, session ownership, registry).
   * When set, harness invokes this instead of GoalSpec turns.
   */
  customCheck?: () => void
}
