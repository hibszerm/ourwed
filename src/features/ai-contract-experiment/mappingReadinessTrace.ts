/**
 * DEV readiness trace — exact blocking field diagnostics.
 */

import { classifyMappingWarning } from './mappingWarningSeverity'
import {
  deriveExperimentalTemplateRequirements,
  allRequiredFieldKeys,
} from './templateShapeRequirements'
import { evaluateAllSourceFieldPresence } from './sourceFieldPresence'
import {
  evaluateExperimentalMappingReadiness,
  requiredKeysForReadiness,
} from './mappingReadiness'
import type {
  ContractFieldKey,
  IndexedDocxBlock,
  MappingReadinessStatus,
  StructuredAiMappingResponse,
  ValidatedAiMapping,
} from './types'

export type MappingReadinessTrace = {
  experimentRunId: string
  universallyRequiredFields: Array<{
    fieldKey: ContractFieldKey
    mappingIds: string[]
    approvedCount: number
    status: 'satisfied' | 'pending' | 'missing' | 'rejected'
  }>
  sourceConditionalFields: Array<{
    fieldKey: ContractFieldKey
    sourcePresence: string
    evidence: Array<{ blockId: string; sourceText: string; reason: string }>
    matchingMappings: string[]
    approvedCount: number
    required: boolean
    blockingReason: string | null
  }>
  pairedGroups: Array<{
    groupId: string
    members: ContractFieldKey[]
    approvedMembers: ContractFieldKey[]
    complete: boolean
  }>
  warnings: Array<{
    code: string
    severity: string
    affectsReadiness: boolean
  }>
  final: {
    readiness: MappingReadinessStatus
    missingFields: ContractFieldKey[]
    pendingFields: ContractFieldKey[]
    rejectedFields: ContractFieldKey[]
    blockingIssues: string[]
  }
}

function isApproved(m: ValidatedAiMapping): boolean {
  return (
    m.validationStatus === 'valid' &&
    (m.approvalStatus === 'approved' || m.approvalStatus === 'manually_mapped')
  )
}

export function buildMappingReadinessTrace(input: {
  experimentRunId: string
  blocks: IndexedDocxBlock[]
  response?: StructuredAiMappingResponse
  mappings: ValidatedAiMapping[]
}): MappingReadinessTrace {
  const requirements = deriveExperimentalTemplateRequirements({
    blocks: input.blocks,
    mappings: input.mappings,
    response: input.response,
  })
  const requiredKeys = allRequiredFieldKeys(requirements)
  const presenceDetails = evaluateAllSourceFieldPresence({
    blocks: input.blocks,
    warnings: input.response?.warnings,
    mappings: input.mappings,
  })
  const readiness = evaluateExperimentalMappingReadiness(input)

  const universallyRequiredFields = requirements.universallyRequired.map(
    (fieldKey) => {
      const matches = input.mappings.filter((m) => m.fieldKey === fieldKey)
      const approvedCount = matches.filter(isApproved).length
      let status: 'satisfied' | 'pending' | 'missing' | 'rejected' = 'missing'
      if (matches.some(isApproved)) status = 'satisfied'
      else if (matches.some((m) => m.approvalStatus === 'rejected_by_user')) {
        status = 'rejected'
      } else if (matches.some((m) => m.validationStatus === 'valid')) {
        status = 'pending'
      }
      return {
        fieldKey,
        mappingIds: matches.map((m) => m.id ?? `${m.fieldKey}:${m.blockId}`),
        approvedCount,
        status,
      }
    },
  )

  const sourceConditionalFields = presenceDetails.map((detail) => {
    const matches = input.mappings.filter((m) => m.fieldKey === detail.fieldKey)
    const required = requiredKeys.includes(detail.fieldKey)
    let blockingReason: string | null = null
    if (required && !matches.some(isApproved)) {
      if (matches.some((m) => m.approvalStatus === 'rejected_by_user')) {
        blockingReason = 'rejected_by_user'
      } else if (!matches.length || matches.every((m) => m.validationStatus === 'rejected')) {
        blockingReason = 'missing_valid_mapping'
      } else {
        blockingReason = 'pending_approval'
      }
    }
    return {
      fieldKey: detail.fieldKey,
      sourcePresence: detail.presence,
      evidence: detail.evidence,
      matchingMappings: matches.map((m) => m.id ?? `${m.fieldKey}:${m.blockId}`),
      approvedCount: matches.filter(isApproved).length,
      required,
      blockingReason,
    }
  })

  const pairGroups = new Map<string, ValidatedAiMapping[]>()
  for (const m of input.mappings) {
    if (!m.pairedFieldGroup || m.validationStatus !== 'valid') continue
    const list = pairGroups.get(m.pairedFieldGroup) ?? []
    list.push(m)
    pairGroups.set(m.pairedFieldGroup, list)
  }

  const pairedGroups = [...pairGroups.entries()].map(([groupId, members]) => ({
    groupId,
    members: members.map((m) => m.fieldKey),
    approvedMembers: members.filter(isApproved).map((m) => m.fieldKey),
    complete: members.every(isApproved),
  }))

  const warnings = (input.response?.warnings ?? []).map((w) => {
    const classified = classifyMappingWarning(w)
    return {
      code: w.code,
      severity: classified.severity,
      affectsReadiness: classified.severity === 'blocking',
    }
  })

  const missingFields = requiredKeys.filter((key) => {
    const m = input.mappings.find((x) => x.fieldKey === key)
    return !m || m.validationStatus === 'rejected'
  })
  const pendingFields = requiredKeys.filter((key) => {
    const m = input.mappings.find((x) => x.fieldKey === key)
    return m?.validationStatus === 'valid' && m.approvalStatus === 'pending'
  })
  const rejectedFields = requiredKeys.filter((key) => {
    const m = input.mappings.find((x) => x.fieldKey === key)
    return m?.approvalStatus === 'rejected_by_user'
  })

  const blockingIssues: string[] = []
  for (const field of sourceConditionalFields) {
    if (field.blockingReason) {
      blockingIssues.push(`${field.fieldKey}:${field.blockingReason}`)
    }
  }

  return {
    experimentRunId: input.experimentRunId,
    universallyRequiredFields,
    sourceConditionalFields,
    pairedGroups,
    warnings,
    final: {
      readiness,
      missingFields,
      pendingFields,
      rejectedFields,
      blockingIssues,
    },
  }
}

export function logMappingReadinessTrace(input: {
  experimentRunId: string
  blocks: IndexedDocxBlock[]
  response?: StructuredAiMappingResponse
  mappings: ValidatedAiMapping[]
}): MappingReadinessTrace {
  const trace = buildMappingReadinessTrace(input)
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.info('[ai-contract-mapping-readiness-trace]', trace)
  }
  return trace
}

export { requiredKeysForReadiness }
