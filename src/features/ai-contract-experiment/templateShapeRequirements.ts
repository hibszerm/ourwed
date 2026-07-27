/**
 * Template-shape-aware experimental requirements derivation.
 */

import { EXPERIMENT_REQUIRED_FIELD_KEYS } from './fieldRegistry'
import { requiredLocationKeys } from './eventLocationCapability'
import { evaluateAllSourceFieldPresence } from './sourceFieldPresence'
import type {
  ContractFieldKey,
  IndexedDocxBlock,
  StructuredAiMappingResponse,
  ValidatedAiMapping,
} from './types'

export type ExperimentalTemplateRequirements = {
  universallyRequired: ContractFieldKey[]
  conditionalRequired: Array<{
    fieldKey: ContractFieldKey
    reason: string
    evidenceBlockIds: string[]
  }>
  informationalUnsupported: Array<{
    concept: string
    reason: string
  }>
  stageLabelsOnly: Array<{
    fieldKey: ContractFieldKey
    label: string
    blockId: string
  }>
  notPresentInTemplate: ContractFieldKey[]
}

function sourceContainsBothMoneyForms(blocks: IndexedDocxBlock[]): boolean {
  const text = blocks.map((b) => b.text).join('\n')
  return (
    /\d[\d\s]*\s*zł/i.test(text) &&
    /(słownie|tysiąc|tysięcy|złotych|złote)/i.test(text)
  )
}

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

export function deriveExperimentalTemplateRequirements(input: {
  blocks: IndexedDocxBlock[]
  mappings?: ValidatedAiMapping[]
  response?: StructuredAiMappingResponse
}): ExperimentalTemplateRequirements {
  const universallyRequired: ContractFieldKey[] = [...EXPERIMENT_REQUIRED_FIELD_KEYS]

  if (
    sourceContainsBothMoneyForms(input.blocks) &&
    (input.response?.fields.some((f) => f.fieldKey === 'contract_value_words') ||
      input.mappings?.some((m) => m.fieldKey === 'contract_value_words'))
  ) {
    universallyRequired.push('contract_value_words')
  }

  const presenceDetails = evaluateAllSourceFieldPresence({
    blocks: input.blocks,
    warnings: input.response?.warnings,
    mappings: input.mappings,
  })

  const locationKeys = new Set(
    requiredLocationKeys({
      blocks: input.blocks,
      mappings: input.mappings,
    }),
  )

  const conditionalRequired: ExperimentalTemplateRequirements['conditionalRequired'] = []
  const informationalUnsupported: ExperimentalTemplateRequirements['informationalUnsupported'] =
    []
  const stageLabelsOnly: ExperimentalTemplateRequirements['stageLabelsOnly'] = []
  const requiredKeys = new Set<ContractFieldKey>(universallyRequired)

  for (const detail of presenceDetails) {
    if (detail.presence === 'label_or_stage_only') {
      for (const ev of detail.evidence) {
        stageLabelsOnly.push({
          fieldKey: detail.fieldKey,
          label: ev.sourceText,
          blockId: ev.blockId,
        })
      }
      continue
    }

    if (detail.presence === 'present_unsupported_value') {
      informationalUnsupported.push({
        concept: detail.fieldKey,
        reason: detail.reason ?? detail.presence,
      })
      continue
    }

    if (detail.presence === 'present_supported_value' && detail.requiresMapping) {
      if (
        detail.fieldKey === 'preparation_location' ||
        detail.fieldKey === 'ceremony_location' ||
        detail.fieldKey === 'reception_location'
      ) {
        if (!locationKeys.has(detail.fieldKey)) continue
      }
      conditionalRequired.push({
        fieldKey: detail.fieldKey,
        reason: detail.reason ?? detail.presence,
        evidenceBlockIds: detail.evidence.map((e) => e.blockId).filter(Boolean),
      })
      requiredKeys.add(detail.fieldKey)
    }
  }

  const notPresentInTemplate = SOURCE_CONDITIONAL_CATALOG.filter(
    (key) =>
      !requiredKeys.has(key) &&
      !stageLabelsOnly.some((s) => s.fieldKey === key) &&
      !informationalUnsupported.some((i) => i.concept === key),
  )

  return {
    universallyRequired,
    conditionalRequired,
    informationalUnsupported,
    stageLabelsOnly,
    notPresentInTemplate,
  }
}

export function allRequiredFieldKeys(
  requirements: ExperimentalTemplateRequirements,
): ContractFieldKey[] {
  return [
    ...requirements.universallyRequired,
    ...requirements.conditionalRequired.map((c) => c.fieldKey),
  ]
}
