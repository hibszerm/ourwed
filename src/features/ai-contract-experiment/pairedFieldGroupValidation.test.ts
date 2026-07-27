/**
 * Paired-field group validation tests.
 * Run: npm run test:paired-field-groups
 */

import {
  normalizeReciprocalPairGroups,
  validatePairedFieldGroups,
} from './pairedFieldGroupValidation'
import type { StructuredAiFieldProposal, ValidatedAiMapping } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function proposal(
  fieldKey: StructuredAiFieldProposal['fieldKey'],
  group: string | null,
): StructuredAiFieldProposal {
  return {
    fieldKey,
    blockId: 'b1',
    exactValue: 'x',
    evidenceText: 'x',
    contextBefore: '',
    contextAfter: '',
    semanticRole: 't',
    confidence: 'high',
    reasoning: 't',
    pairedFieldGroup: group,
  }
}

function validMapping(
  fieldKey: ValidatedAiMapping['fieldKey'],
  group: string | null,
): ValidatedAiMapping {
  return {
    fieldKey,
    blockId: 'b1',
    paragraphIndex: 1,
    start: 0,
    end: 3,
    sourceText: 'abc',
    aiExactValue: 'abc',
    evidenceText: 'abc',
    resolvedExactValue: 'abc',
    resolutionMethod: 'ai_exact',
    occurrenceCount: 1,
    confidence: 'high',
    confidenceScore: 0.9,
    validationStatus: 'valid',
    approvalStatus: 'pending',
    pairedFieldGroup: group,
  }
}

async function main() {
  const normalized = normalizeReciprocalPairGroups([
    proposal('contract_value_formatted', 'contract_value_words'),
    proposal('contract_value_words', 'contract_value_formatted'),
  ])
  assert(
    normalized.every((p) => p.pairedFieldGroup === 'contract_value_pair_1'),
    '4 shared pair ID',
  )

  const reciprocalRejected = validatePairedFieldGroups([
    validMapping('contract_value_formatted', 'only_one'),
  ])
  assert(
    reciprocalRejected[0]!.validationStatus === 'needs_review',
    '5 reciprocal/single-member group → needs_review',
  )

  const validPair = validatePairedFieldGroups([
    validMapping('contract_value_formatted', 'contract_value_pair_1'),
    validMapping('contract_value_words', 'contract_value_pair_1'),
  ])
  assert(
    validPair.every((m) => m.validationStatus === 'valid'),
    '4 valid pair group',
  )

  console.log('ok — pairedFieldGroupValidation')
}

void main()
