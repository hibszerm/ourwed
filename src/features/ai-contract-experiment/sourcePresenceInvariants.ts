/**
 * DEV invariants for source presence / template requirements.
 */

import { deriveEventLocationCapability } from './eventLocationCapability'
import {
  deriveExperimentalTemplateRequirements,
  allRequiredFieldKeys,
} from './templateShapeRequirements'
import { evaluateAllSourceFieldPresence } from './sourceFieldPresence'
import type { MappingReadinessStatus, ValidatedAiMapping } from './types'

function isApproved(m: ValidatedAiMapping): boolean {
  return (
    m.validationStatus === 'valid' &&
    (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped')
  )
}

export function assertSourcePresenceInvariants(input: {
  experimentRunId: string
  blocks: Parameters<typeof deriveExperimentalTemplateRequirements>[0]['blocks']
  mappings: ValidatedAiMapping[]
  readiness: MappingReadinessStatus
  response?: Parameters<typeof deriveExperimentalTemplateRequirements>[0]['response']
}): void {
  if (typeof import.meta === 'undefined' || !import.meta.env?.DEV) return

  const presence = evaluateAllSourceFieldPresence({
    blocks: input.blocks,
    warnings: input.response?.warnings,
    mappings: input.mappings,
  })
  const requirements = deriveExperimentalTemplateRequirements({
    blocks: input.blocks,
    mappings: input.mappings,
    response: input.response,
  })
  const requiredKeys = allRequiredFieldKeys(requirements)
  const locationCapability = deriveEventLocationCapability({
    blocks: input.blocks,
    mappings: input.mappings,
  })

  const violations: string[] = []

  for (const detail of presence) {
    if (detail.presence === 'label_or_stage_only' && requiredKeys.includes(detail.fieldKey)) {
      violations.push('E')
      break
    }
  }

  const universalApproved = requirements.universallyRequired.every((key) =>
    input.mappings.some((m) => m.fieldKey === key && isApproved(m)),
  )
  const conditionalApproved = requirements.conditionalRequired.every((c) =>
    input.mappings.some((m) => m.fieldKey === c.fieldKey && isApproved(m)),
  )
  const noBlocking = !presence.some(
    (d) => d.presence === 'present_unsupported_value' && d.requiresMapping,
  )
  if (
    universalApproved &&
    conditionalApproved &&
    noBlocking &&
    input.readiness !== 'ready'
  ) {
    violations.push('F')
  }

  if (
    locationCapability.mode === 'single_general_location' &&
    requiredKeys.includes('preparation_location') &&
    requiredKeys.includes('ceremony_location')
  ) {
    violations.push('G')
  }

  if (violations.length > 0) {
    console.error('[ai-contract-source-presence-invariant-failed]', {
      experimentRunId: input.experimentRunId,
      invariant: violations,
      sourcePresence: presence,
      requirements,
      mappings: input.mappings,
      readiness: input.readiness,
      locationCapability,
    })
  }
}
