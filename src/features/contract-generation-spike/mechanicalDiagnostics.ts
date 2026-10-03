/** Closed, content-free diagnostics for deterministic Option B validation failures. */
export const MECHANICAL_GATE_IDS = [
  'authority',
  'source_target',
  'duplicate_target',
  'source_copy',
  'candidate_parse',
  'package_structure',
  'package_preservation',
  'edit_application',
  'extra_change',
  'internal',
] as const

export const MECHANICAL_REASON_CODES = [
  'derived_fact_mismatch',
  'missing_provenance',
  'invalid_amount',
  'invalid_extra_amount',
  'target_not_found',
  'duplicate_target',
  'application_failed',
  'candidate_unreadable',
  'invalid_package',
  'required_part_missing',
  'part_set_changed',
  'untouched_part_changed',
  'paragraph_structure_changed',
  'table_structure_changed',
  'field_instruction_changed',
  'field_structure_changed',
  'requested_edit_missing',
  'deletion_not_permitted',
  'unexpected_change',
  'internal_validation_failure',
] as const

export const MECHANICAL_AUTHORITY_TYPES = ['normalized_authority'] as const

export type MechanicalGateId = typeof MECHANICAL_GATE_IDS[number]
export type MechanicalReasonCode = typeof MECHANICAL_REASON_CODES[number]
export type MechanicalAuthorityType = typeof MECHANICAL_AUTHORITY_TYPES[number]

export type MechanicalFailureDiagnostic = {
  gateId: MechanicalGateId
  reasonCode: MechanicalReasonCode
  editIndex?: number
  editCount?: number
  authorityType?: MechanicalAuthorityType
}

export type SafeMechanicalTelemetry = {
  mechanicalGateId: MechanicalGateId
  mechanicalReasonCode: MechanicalReasonCode
  mechanicalEditIndex?: number
  mechanicalEditCount?: number
  mechanicalAuthorityType?: MechanicalAuthorityType
}

const gateIds = new Set<string>(MECHANICAL_GATE_IDS)
const reasonCodes = new Set<string>(MECHANICAL_REASON_CODES)
const authorityTypes = new Set<string>(MECHANICAL_AUTHORITY_TYPES)
export const MECHANICAL_GATE_REASON_PAIRS = [
  'authority:derived_fact_mismatch', 'authority:missing_provenance', 'authority:invalid_amount', 'authority:invalid_extra_amount',
  'source_target:target_not_found', 'duplicate_target:duplicate_target',
  'source_copy:application_failed', 'candidate_parse:candidate_unreadable', 'candidate_parse:invalid_package',
  'package_structure:required_part_missing', 'package_structure:part_set_changed', 'package_structure:paragraph_structure_changed',
  'package_structure:table_structure_changed', 'package_structure:field_instruction_changed', 'package_structure:field_structure_changed',
  'package_preservation:untouched_part_changed', 'edit_application:requested_edit_missing', 'edit_application:deletion_not_permitted',
  'extra_change:unexpected_change', 'internal:internal_validation_failure',
] as const
const validGateReasonPairs = new Set<string>(MECHANICAL_GATE_REASON_PAIRS)

/** Projects only known constants and non-negative integer indexes/counts. */
export function safeMechanicalTelemetry(value: unknown): SafeMechanicalTelemetry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  const gateCandidate = typeof input.gateId === 'string' ? input.gateId : ''
  const reasonCandidate = typeof input.reasonCode === 'string' ? input.reasonCode : ''
  const pair = `${gateCandidate}:${reasonCandidate}`
  const validPair = gateIds.has(gateCandidate) && reasonCodes.has(reasonCandidate) && validGateReasonPairs.has(pair)
  const gateId = validPair ? input.gateId as MechanicalGateId : 'internal'
  const reasonCode = validPair ? input.reasonCode as MechanicalReasonCode : 'internal_validation_failure'
  const output: SafeMechanicalTelemetry = { mechanicalGateId: gateId, mechanicalReasonCode: reasonCode }
  if (Number.isSafeInteger(input.editIndex) && (input.editIndex as number) >= 0) output.mechanicalEditIndex = input.editIndex as number
  if (Number.isSafeInteger(input.editCount) && (input.editCount as number) >= 0) output.mechanicalEditCount = input.editCount as number
  if (validPair && typeof input.authorityType === 'string' && authorityTypes.has(input.authorityType)) output.mechanicalAuthorityType = input.authorityType as MechanicalAuthorityType
  return output
}
