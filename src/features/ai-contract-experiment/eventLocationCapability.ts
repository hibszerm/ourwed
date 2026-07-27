/**
 * Event location capability — generic vs stage-specific locations.
 */

import { evaluateSourceFieldPresence } from './sourceFieldPresence'
import type { ContractFieldKey, IndexedDocxBlock, ValidatedAiMapping } from './types'

const LOCATION_KEYS: ContractFieldKey[] = [
  'preparation_location',
  'ceremony_location',
  'reception_location',
]

export type EventLocationCapability = {
  mode:
    | 'single_general_location'
    | 'separate_stage_locations'
    | 'partial_stage_locations'
    | 'none'
  presentKeys: ContractFieldKey[]
}

function isApprovedOrManual(m: ValidatedAiMapping): boolean {
  return (
    m.validationStatus === 'valid' &&
    (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped')
  )
}

export function deriveEventLocationCapability(input: {
  blocks: IndexedDocxBlock[]
  mappings?: ValidatedAiMapping[]
}): EventLocationCapability {
  const presentKeys: ContractFieldKey[] = []

  for (const key of LOCATION_KEYS) {
    const detail = evaluateSourceFieldPresence({
      blocks: input.blocks,
      fieldKey: key,
      mappings: input.mappings,
    })
    if (detail.presence === 'present_supported_value') {
      presentKeys.push(key)
    }
  }

  if (presentKeys.length === 0) {
    return { mode: 'none', presentKeys: [] }
  }

  const hasGenericLokalizacja = input.blocks.some((b) =>
    /lokalizacja\s*[:.]/i.test(b.text),
  )
  const approvedLocationCount = LOCATION_KEYS.filter((key) =>
    input.mappings?.some((m) => m.fieldKey === key && isApprovedOrManual(m)),
  ).length

  if (
    presentKeys.length === 1 &&
    (hasGenericLokalizacja || approvedLocationCount === 1)
  ) {
    return { mode: 'single_general_location', presentKeys }
  }

  if (presentKeys.length >= 2) {
    return { mode: 'separate_stage_locations', presentKeys }
  }

  return { mode: 'partial_stage_locations', presentKeys }
}

export function requiredLocationKeys(input: {
  blocks: IndexedDocxBlock[]
  mappings?: ValidatedAiMapping[]
}): ContractFieldKey[] {
  const capability = deriveEventLocationCapability(input)
  return capability.presentKeys
}
