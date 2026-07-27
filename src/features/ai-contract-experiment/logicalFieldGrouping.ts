/**
 * Group physical mappings by logical field for review UI.
 */

import { replacementPreviewForField } from './replacementPreview'
import type {
  ContractFieldKey,
  ContractGenerationInput,
  LogicalFieldMappingGroup,
  ValidatedAiMapping,
} from './types'

export function groupMappingsByLogicalField(input: {
  mappings: ValidatedAiMapping[]
  generationInput: ContractGenerationInput
}): LogicalFieldMappingGroup[] {
  const byField = new Map<ContractFieldKey, ValidatedAiMapping[]>()
  for (const m of input.mappings) {
    const list = byField.get(m.fieldKey) ?? []
    list.push(m)
    byField.set(m.fieldKey, list)
  }

  return [...byField.entries()].map(([fieldKey, physicalMappings]) => ({
    fieldKey,
    logicalValueRole: fieldKey,
    replacementPreview: replacementPreviewForField(fieldKey, input.generationInput),
    physicalMappings: physicalMappings.sort((a, b) => {
      if (a.blockId !== b.blockId) return a.blockId.localeCompare(b.blockId)
      return a.start - b.start
    }),
  }))
}

export function mappingsForFieldKey(
  mappings: ValidatedAiMapping[],
  fieldKey: ContractFieldKey,
): ValidatedAiMapping[] {
  return mappings.filter((m) => m.fieldKey === fieldKey)
}

export function hasValidMappingForKey(
  mappings: ValidatedAiMapping[],
  fieldKey: ContractFieldKey,
): boolean {
  return mappings.some(
    (m) => m.fieldKey === fieldKey && m.validationStatus !== 'rejected',
  )
}

export function hasApprovedMappingForKey(
  mappings: ValidatedAiMapping[],
  fieldKey: ContractFieldKey,
): boolean {
  return mappings.some(
    (m) =>
      m.fieldKey === fieldKey &&
      m.validationStatus === 'valid' &&
      (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped'),
  )
}
