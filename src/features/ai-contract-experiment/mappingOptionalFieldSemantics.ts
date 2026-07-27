/**
 * Filter false missing_required_field warnings for optional concepts absent from source.
 */

import { EXPERIMENT_FIELD_LABELS } from './fieldRegistry'
import { detectSourceConditionalFieldsPresent } from './sourceConditionalFields'
import type {
  ContractFieldKey,
  IndexedDocxBlock,
  MappingGenerationContext,
  StructuredAiMappingResponse,
} from './types'

const WARNING_FIELD_PATTERNS: Array<{
  fieldKey: ContractFieldKey
  patterns: RegExp[]
}> = [
  {
    fieldKey: 'client_address',
    patterns: [/adres/i, /address/i, /client_address/],
  },
  {
    fieldKey: 'client_phone',
    patterns: [/telefon/i, /phone/i, /client_phone/],
  },
  {
    fieldKey: 'preparation_location',
    patterns: [/przygotow/i, /preparation_location/],
  },
  {
    fieldKey: 'ceremony_location',
    patterns: [/ceremoni/i, /ceremony_location/],
  },
  {
    fieldKey: 'reception_location',
    patterns: [/przyjęc/i, /reception_location/],
  },
  {
    fieldKey: 'agreed_deposit_formatted',
    patterns: [/zadatek/i, /deposit/i],
  },
  {
    fieldKey: 'remaining_after_deposit_formatted',
    patterns: [/pozostał/i, /remaining/i],
  },
]

function warningMentionsField(
  message: string,
  fieldKey: ContractFieldKey,
): boolean {
  const label = EXPERIMENT_FIELD_LABELS[fieldKey].toLowerCase()
  const lower = message.toLowerCase()
  if (lower.includes(fieldKey.replace(/_/g, ' '))) return true
  if (lower.includes(label)) return true
  const entry = WARNING_FIELD_PATTERNS.find((p) => p.fieldKey === fieldKey)
  return entry?.patterns.some((re) => re.test(message)) ?? false
}

function isFalseMissingRequiredWarning(
  warning: StructuredAiMappingResponse['warnings'][0],
  blocks: IndexedDocxBlock[],
  context: MappingGenerationContext,
): boolean {
  if (warning.code !== 'missing_required_field') return false

  const presentInSource = detectSourceConditionalFieldsPresent(blocks)

  for (const fieldKey of context.sourceConditionalFields) {
    if (!warningMentionsField(warning.message, fieldKey)) continue
    if (!presentInSource.includes(fieldKey)) return true
  }

  for (const fieldKey of context.universallyRequiredTemplateFields) {
    if (!warningMentionsField(warning.message, fieldKey)) continue
    if (fieldKey === 'contract_value_words') {
      const needsWords = context.universallyRequiredTemplateFields.includes(
        'contract_value_words',
      )
      if (!needsWords) return true
    }
  }

  return false
}

export function filterOptionalFieldWarnings(
  response: StructuredAiMappingResponse,
  context: MappingGenerationContext,
  blocks: IndexedDocxBlock[],
): StructuredAiMappingResponse {
  const warnings = response.warnings.filter(
    (w) => !isFalseMissingRequiredWarning(w, blocks, context),
  )
  if (warnings.length === response.warnings.length) return response
  return { ...response, warnings }
}
