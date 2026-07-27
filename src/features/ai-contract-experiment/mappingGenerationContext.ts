/**
 * Generation context for structured mapping — separates app-available fields
 * from template-required and source-conditional requirements.
 */

import { EXPERIMENT_FIELD_REGISTRY } from './fieldRegistry'
import { SOURCE_CONDITIONAL_FIELD_KEYS } from './sourceConditionalFields'
import type { ContractFieldKey, ContractGenerationInput, IndexedDocxBlock } from './types'

export type MappingGenerationContext = {
  expectedClientCount: number
  /** Values the application can supply — not required in every template. */
  availableWeddingFields: ContractFieldKey[]
  universallyRequiredTemplateFields: ContractFieldKey[]
  /** Required only when the source document contains that dynamic concept. */
  sourceConditionalFields: ContractFieldKey[]
}

function sourceContainsMoneyWords(blocks: IndexedDocxBlock[]): boolean {
  const text = blocks.map((b) => b.text).join('\n')
  return (
    /\d[\d\s]*\s*zł/i.test(text) &&
    /(słownie|tysiąc|tysięcy|złotych|złote)/i.test(text)
  )
}

export function buildMappingGenerationContext(input: {
  blocks: IndexedDocxBlock[]
  generationInput: ContractGenerationInput
}): MappingGenerationContext {
  const availableWeddingFields = EXPERIMENT_FIELD_REGISTRY.map((f) => f.key)

  const universallyRequiredTemplateFields: ContractFieldKey[] = [
    'couple_full_names',
    'contract_execution_date',
    'wedding_date',
    'contract_value_formatted',
  ]
  if (sourceContainsMoneyWords(input.blocks)) {
    universallyRequiredTemplateFields.push('contract_value_words')
  }

  return {
    expectedClientCount: input.generationInput.clients.length || 2,
    availableWeddingFields,
    universallyRequiredTemplateFields,
    sourceConditionalFields: [...SOURCE_CONDITIONAL_FIELD_KEYS],
  }
}

export function availableWeddingFieldKeys(): ContractFieldKey[] {
  return EXPERIMENT_FIELD_REGISTRY.map((f) => f.key)
}
