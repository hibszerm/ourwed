/**
 * Three independent validation dimensions for experiment occurrences.
 */

import type { ContractFieldKey } from '../types'
import type { ValueShapeResult } from './valueShapeClassifier'

export type SourceValidity =
  | { status: 'valid' }
  | {
      status: 'invalid'
      reasonCode:
        | 'block_not_found'
        | 'span_not_found'
        | 'span_mismatch'
        | 'offset_out_of_range'
        | 'protected_range_overlap'
        | 'duplicate_physical_span'
        | 'unsupported_source_structure'
        | 'empty_source_value'
        | 'invented_registry_key'
    }

export type SemanticValidity =
  | { status: 'valid' }
  | {
      status: 'needs_review'
      reasonCode:
        | 'ambiguous_role'
        | 'ambiguous_identity'
        | 'shared_value_multiple_roles'
        | 'weak_context'
        | 'grammatical_form'
        | 'cross_field_conflict'
        | 'money_pair_incomplete'
        | 'money_pair_mismatch'
    }
  | {
      status: 'invalid'
      reasonCode:
        | 'role_context_contradiction'
        | 'provider_data'
        | 'bank_account'
        | 'immutable_clause'
        | 'unsupported_role'
        | 'identity_contamination'
        | 'percentage_not_scalar'
    }

export type ReplacementReadiness =
  | { status: 'ready'; targetValue: string }
  | {
      status: 'manual_text_required'
      reasonCode:
        | 'grammatical_inflection'
        | 'narrative_phrase'
        | 'unsafe_automatic_replacement'
      /** Canonical suggested target — always present when resolvable. */
      targetValue?: string
    }
  | { status: 'missing_target_value'; reasonCode: 'wedding_data_missing' }
  | { status: 'not_applicable' }

export type TargetResolution =
  | { status: 'resolved'; value: string }
  | { status: 'missing'; reasonCode: string }
  | { status: 'not_applicable'; reasonCode: string }

export type OccurrenceValidationDimensions = {
  source: SourceValidity
  semantic: SemanticValidity
  replacement: ReplacementReadiness
  /** Canonical resolved field key after type-gated context scoring. */
  resolvedFieldKey: ContractFieldKey
  /** AI-proposed field key (diagnostic only). */
  aiProposedFieldKey?: ContractFieldKey
  valueShape?: ValueShapeResult
  contextScore: number
}

export type OccurrenceDisplayStatus =
  | 'ready_for_approval'
  | 'needs_role_review'
  | 'needs_manual_text'
  | 'missing_target_data'
  | 'rejected_invalid_span'
  | 'protected_provider_data'
  | 'approved'
  | 'ignored'
  | 'rejected_by_user'
