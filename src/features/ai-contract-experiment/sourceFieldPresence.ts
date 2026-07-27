/**
 * Value-level source-conditional field presence.
 */

import {
  detectStageLabelsOnly,
  labeledValueInBlocks,
  looksLikePlaceValue,
  sentenceValueForLocationField,
  tableValueForLocationField,
} from './locationValueDetection'
import type {
  ContractFieldKey,
  IndexedDocxBlock,
  StructuredAiMappingResponse,
  ValidatedAiMapping,
} from './types'

export type SourceFieldPresenceKind =
  | 'present_supported_value'
  | 'present_unsupported_value'
  | 'label_or_stage_only'
  | 'absent'
  | 'ambiguous'

/** @deprecated Use SourceFieldPresenceKind */
export type SourceFieldPresence = SourceFieldPresenceKind

export type SourceFieldPresenceEvidence = {
  blockId: string
  sourceText: string
  reason: string
}

export type SourceFieldPresenceDetail = {
  fieldKey: ContractFieldKey
  presence: SourceFieldPresenceKind
  evidence: SourceFieldPresenceEvidence[]
  requiresMapping: boolean
  reason?: string
}

const RELATIVE_PAYMENT_RE =
  /\d+\s+dni\s+przed\s+(?:datą\s+)?(?:wydarzenia|ślubu|uroczystości)/i

const SOURCE_CONDITIONAL_CATALOG: ContractFieldKey[] = [
  'client_address',
  'client_phone',
  'preparation_location',
  'ceremony_location',
  'reception_location',
  'agreed_deposit_formatted',
  'remaining_after_deposit_formatted',
  'deposit_due_date',
  'payment_due_date',
  'final_payment_due_date',
]

function isApprovedOrManual(m: ValidatedAiMapping): boolean {
  return (
    m.validationStatus === 'valid' &&
    (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped')
  )
}

function validMappingForField(
  mappings: ValidatedAiMapping[] | undefined,
  fieldKey: ContractFieldKey,
): ValidatedAiMapping | undefined {
  return mappings?.find(
    (m) => m.fieldKey === fieldKey && m.validationStatus === 'valid',
  )
}

function approvedMappingForField(
  mappings: ValidatedAiMapping[] | undefined,
  fieldKey: ContractFieldKey,
): ValidatedAiMapping | undefined {
  return mappings?.find((m) => m.fieldKey === fieldKey && isApprovedOrManual(m))
}

function mappingEvidence(
  mapping: ValidatedAiMapping,
  reason: string,
): SourceFieldPresenceEvidence {
  return {
    blockId: mapping.blockId,
    sourceText: mapping.resolvedExactValue || mapping.sourceText,
    reason,
  }
}

function allText(blocks: IndexedDocxBlock[]): string {
  return blocks.map((b) => b.text).join('\n')
}

function detectLocationPresence(
  blocks: IndexedDocxBlock[],
  fieldKey: ContractFieldKey,
  mappings?: ValidatedAiMapping[],
): SourceFieldPresenceDetail {
  const approved = approvedMappingForField(mappings, fieldKey)
  if (approved) {
    return {
      fieldKey,
      presence: 'present_supported_value',
      evidence: [mappingEvidence(approved, 'approved_mapping')],
      requiresMapping: true,
      reason: 'approved_mapping',
    }
  }

  const valid = validMappingForField(mappings, fieldKey)
  if (valid) {
    return {
      fieldKey,
      presence: 'present_supported_value',
      evidence: [mappingEvidence(valid, 'valid_ai_proposal')],
      requiresMapping: true,
      reason: 'valid_ai_proposal',
    }
  }

  const tableValue = tableValueForLocationField(blocks, fieldKey)
  if (tableValue) {
    return {
      fieldKey,
      presence: 'present_supported_value',
      evidence: [
        {
          blockId: tableValue.blockId,
          sourceText: tableValue.sourceText,
          reason: 'table_label_value_pair',
        },
      ],
      requiresMapping: true,
    }
  }

  const labeled =
    fieldKey === 'preparation_location'
      ? labeledValueInBlocks(blocks, /miejsce\s+przygotowań/i)
      : fieldKey === 'ceremony_location'
        ? labeledValueInBlocks(blocks, /miejsce\s+ceremonii/i)
        : fieldKey === 'reception_location'
          ? labeledValueInBlocks(blocks, /miejsce\s+przyjęcia/i)
          : null
  if (labeled) {
    return {
      fieldKey,
      presence: 'present_supported_value',
      evidence: [
        {
          blockId: labeled.blockId,
          sourceText: labeled.sourceText,
          reason: 'labeled_value_pair',
        },
      ],
      requiresMapping: true,
    }
  }

  const sentence = sentenceValueForLocationField(blocks, fieldKey)
  if (sentence) {
    return {
      fieldKey,
      presence: 'present_supported_value',
      evidence: [
        {
          blockId: sentence.blockId,
          sourceText: sentence.sourceText,
          reason: 'sentence_place_relation',
        },
      ],
      requiresMapping: true,
    }
  }

  const stageLabels = detectStageLabelsOnly(blocks).filter(
    (s) => s.fieldKey === fieldKey,
  )
  if (stageLabels.length > 0) {
    return {
      fieldKey,
      presence: 'label_or_stage_only',
      evidence: stageLabels.map((s) => ({
        blockId: s.blockId,
        sourceText: s.label,
        reason: 'stage_label_without_value',
      })),
      requiresMapping: false,
      reason: 'stage_label_without_value',
    }
  }

  if (fieldKey === 'reception_location') {
    for (const block of blocks) {
      const text = block.text
      const generic = text.match(/lokalizacja\s*[:.]\s*(.+)/i)
      if (generic?.[1] && looksLikePlaceValue(generic[1])) {
        return {
          fieldKey,
          presence: 'present_supported_value',
          evidence: [
            {
              blockId: block.id,
              sourceText: text,
              reason: 'generic_lokalizacja_label_value',
            },
          ],
          requiresMapping: true,
        }
      }
    }
  }

  return {
    fieldKey,
    presence: 'absent',
    evidence: [],
    requiresMapping: false,
  }
}

export function evaluateSourceFieldPresence(input: {
  blocks: IndexedDocxBlock[]
  fieldKey: ContractFieldKey
  warnings?: StructuredAiMappingResponse['warnings']
  mappings?: ValidatedAiMapping[]
}): SourceFieldPresenceDetail {
  const { blocks, fieldKey, mappings } = input
  const text = allText(blocks)
  const lower = text.toLowerCase()

  if (
    fieldKey === 'preparation_location' ||
    fieldKey === 'ceremony_location' ||
    fieldKey === 'reception_location'
  ) {
    return detectLocationPresence(blocks, fieldKey, mappings)
  }

  const approved = approvedMappingForField(mappings, fieldKey)
  if (approved) {
    return {
      fieldKey,
      presence: 'present_supported_value',
      evidence: [mappingEvidence(approved, 'approved_mapping')],
      requiresMapping: true,
      reason: 'approved_mapping',
    }
  }

  const valid = validMappingForField(mappings, fieldKey)
  if (valid) {
    return {
      fieldKey,
      presence: 'present_supported_value',
      evidence: [mappingEvidence(valid, 'valid_ai_proposal')],
      requiresMapping: true,
      reason: 'valid_ai_proposal',
    }
  }

  switch (fieldKey) {
    case 'client_address':
      if (/\bzam\.\s*[^\n,]{4,}/i.test(text) || /adres\s+(?:klient|zamawiaj)/i.test(lower)) {
        return {
          fieldKey,
          presence: 'present_supported_value',
          evidence: [{ blockId: '', sourceText: text.slice(0, 120), reason: 'address_pattern' }],
          requiresMapping: true,
        }
      }
      return { fieldKey, presence: 'absent', evidence: [], requiresMapping: false }

    case 'client_phone':
      if (/(?:tel\.|telefon|kom\.)\s*[:.]?\s*[\d\s+()-]{7,}/i.test(text)) {
        return {
          fieldKey,
          presence: 'present_supported_value',
          evidence: [{ blockId: '', sourceText: text.slice(0, 120), reason: 'phone_pattern' }],
          requiresMapping: true,
        }
      }
      return { fieldKey, presence: 'absent', evidence: [], requiresMapping: false }

    case 'payment_due_date':
    case 'deposit_due_date':
    case 'final_payment_due_date': {
      const hasConcrete =
        (fieldKey === 'deposit_due_date' &&
          /(?:termin\s+zadatku|zadatek\s+do)\s*[:.]?\s*\d{1,2}\.\d{1,2}\.\d{4}/i.test(text)) ||
        (fieldKey === 'payment_due_date' &&
          /(?:termin\s+płatności|płatność\s+do)\s*[:.]?\s*\d{1,2}\.\d{1,2}\.\d{4}/i.test(text)) ||
        (fieldKey === 'final_payment_due_date' &&
          /(?:płatność\s+końcowa|końcowa\s+płatność)\s*[:.]?\s*\d{1,2}\.\d{1,2}\.\d{4}/i.test(text))
      if (hasConcrete) {
        return {
          fieldKey,
          presence: 'present_supported_value',
          evidence: [{ blockId: '', sourceText: text.slice(0, 120), reason: 'concrete_date' }],
          requiresMapping: true,
        }
      }
      if (RELATIVE_PAYMENT_RE.test(text)) {
        const relativeWarning = input.warnings?.some(
          (w) => w.code === 'unsupported_payment_structure',
        )
        if (relativeWarning || RELATIVE_PAYMENT_RE.test(text)) {
          return {
            fieldKey,
            presence: 'present_unsupported_value',
            evidence: [
              {
                blockId: '',
                sourceText: text.match(RELATIVE_PAYMENT_RE)?.[0] ?? '',
                reason: 'relative_deadline_with_no_concrete_date_token',
              },
            ],
            requiresMapping: false,
            reason: 'relative_deadline_with_no_concrete_date_token',
          }
        }
      }
      return { fieldKey, presence: 'absent', evidence: [], requiresMapping: false }
    }

    case 'agreed_deposit_formatted':
      if (/(?:zadatek|zaliczka)\s*[:.]?\s*[\d\s]+(?:zł|PLN)/i.test(text)) {
        return {
          fieldKey,
          presence: 'present_supported_value',
          evidence: [{ blockId: '', sourceText: text.slice(0, 120), reason: 'deposit_amount' }],
          requiresMapping: true,
        }
      }
      return { fieldKey, presence: 'absent', evidence: [], requiresMapping: false }

    case 'remaining_after_deposit_formatted':
      if (/(?:pozostał|reszta|saldo)\s*[:.]?\s*[\d\s]+(?:zł|PLN)/i.test(text)) {
        return {
          fieldKey,
          presence: 'present_supported_value',
          evidence: [{ blockId: '', sourceText: text.slice(0, 120), reason: 'remaining_amount' }],
          requiresMapping: true,
        }
      }
      return { fieldKey, presence: 'absent', evidence: [], requiresMapping: false }

    default:
      return { fieldKey, presence: 'absent', evidence: [], requiresMapping: false }
  }
}

export function evaluateAllSourceFieldPresence(input: {
  blocks: IndexedDocxBlock[]
  warnings?: StructuredAiMappingResponse['warnings']
  mappings?: ValidatedAiMapping[]
}): SourceFieldPresenceDetail[] {
  return SOURCE_CONDITIONAL_CATALOG.map((fieldKey) =>
    evaluateSourceFieldPresence({ ...input, fieldKey }),
  )
}

export function sourceConditionalFieldsRequiringApproval(
  blocks: IndexedDocxBlock[],
  warnings?: StructuredAiMappingResponse['warnings'],
  mappings?: ValidatedAiMapping[],
): ContractFieldKey[] {
  return evaluateAllSourceFieldPresence({ blocks, warnings, mappings })
    .filter((d) => d.presence === 'present_supported_value' && d.requiresMapping)
    .map((d) => d.fieldKey)
}

/** @deprecated Use SourceFieldPresenceDetail */
export type SourceFieldPresenceResult = SourceFieldPresenceDetail
