import type {
  ContractCanonicalField,
  DocumentTextAnchor,
  LabReplacementRow,
  SemanticMappingRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'

export type StructuralCompatibilityStatus = 'PASS' | 'REVIEW' | 'FAIL'

export type StructuralBlockerCode =
  | 'legal_entity_structure_mismatch'
  | 'shared_source_span_conflict'
  | 'unsafe_temporal_unit_change'
  | 'unsafe_variable_temporal_patch'
  | 'missing_canonical_personal_data'
  | 'missing_canonical_client_data'
  | 'missing_required_client_data'
  | 'coverage_group_inconsistency'
  | 'package_time_configuration_incomplete'
  | 'payment_schedule_structure_mismatch'
  | 'duplicate_physical_patch'
  | 'conflicting_physical_patch'
  | 'unresolved_required_business_value'
  | 'unsafe_identity_block_patch'
  | 'shared_location_requires_decision'

export type StructuralPatchGroup =
  | 'company_identity'
  | 'locations'
  | 'temporal'
  | 'coverage'
  | 'payment_schedule'
  | 'personal_data'
  | 'patch_conflicts'
  | 'package'

export type StructuralEvidence = {
  anchorId: string
  sourceFragment: string
  start?: number
  end?: number
}

export type StructuralBlocker = {
  code: StructuralBlockerCode
  message: string
  anchors: string[]
  semanticRoles: string[]
  patchGroup?: StructuralPatchGroup
  metadata?: Record<string, unknown>
  evidence?: StructuralEvidence[]
  manualResolutionPossible?: boolean
}

export type StructuralWarning = {
  code: string
  message: string
  anchors: string[]
  semanticRoles: string[]
  patchGroup?: StructuralPatchGroup
  metadata?: Record<string, unknown>
  evidence?: StructuralEvidence[]
}

export type PatchConflict = {
  code: 'shared_source_span_conflict' | 'duplicate_physical_patch'
  physicalKey: string
  anchorId: string
  sourceValue: string
  start: number
  end: number
  semanticRoles: string[]
  proposedValues: string[]
  replacementIds: string[]
}

export type StructuralCompatibilityResult = {
  status: StructuralCompatibilityStatus
  blockers: StructuralBlocker[]
  warnings: StructuralWarning[]
  patchConflicts: PatchConflict[]
}

export type LegalEntityType =
  | 'sole_proprietorship'
  | 'civil_partnership'
  | 'partnership'
  | 'limited_company'
  | 'individual'
  | 'other'
  | 'unknown'

export type DocumentNaturalPerson = {
  fullName?: string
  pesel?: string
  email?: string
  phone?: string
  sourceAnchor?: string
}

export type DocumentPartyStructure = {
  entityType: LegalEntityType
  naturalPersons: DocumentNaturalPerson[]
  companyName?: string
  taxId?: string
  registrationNumber?: string
  grammaticalNumber: 'singular' | 'plural' | 'unknown'
  sourceAnchors: string[]
  identityElements: Array<{
    kind:
      | 'person_name'
      | 'pesel'
      | 'email'
      | 'phone'
      | 'company_name'
      | 'address'
      | 'tax_id'
      | 'registration_number'
      | 'legal_form'
      | 'grammar'
    value: string
    anchorId: string
    start: number
    end: number
  }>
}

export type ExactSpan = {
  anchorId: string
  start: number
  end: number
  exactSourceText: string
}

export type RelativeTemporalExpression = {
  amount: number
  unit:
    | 'calendar_days'
    | 'business_days'
    | 'weeks'
    | 'months'
    | 'years'
  relation: 'before' | 'after' | 'from'
  referenceRole: string
  fullExpressionSpan?: ExactSpan
  numericSpan?: ExactSpan
  unitSpan?: ExactSpan
}

export type MoneyValue = {
  amount: number
  currency: 'PLN'
  sourceText: string
}

export type DocumentPaymentSchedule = {
  total?: MoneyValue
  entries: Array<{
    amount?: MoneyValue
    percentage?: number
    trigger:
      | 'contract_signing'
      | 'fixed_date'
      | 'wedding_day'
      | 'delivery'
      | 'acceptance'
      | 'relative_date'
      | 'unknown'
    dueDate?: string
    method: 'cash' | 'bank_transfer' | 'cash_or_transfer' | 'unknown'
    label?: string
    sourceAnchor: string
    sourceSpan?: ExactSpan
  }>
}

export type StructuralCompatibilityInput = {
  rows: LabReplacementRow[]
  mappingRows?: SemanticMappingRow[]
  anchors: DocumentTextAnchor[]
  canonicalFields?: ContractCanonicalField[]
  canonicalEntityType?: LegalEntityType
  patchConflicts?: PatchConflict[]
  /**
   * Template mutability config. Defaults to conservative fixed payment/delivery
   * and templateMigrationMode = false.
   */
  templateConfig?: import('@/features/ai-contract-lab/templateFieldPolicy').ContractTemplateVariableConfig
  /** Shared-location review items from physical reconciliation. */
  sharedLocationReviews?: Array<{
    code: string
    anchorId: string
    message: string
    semanticRoles: string[]
    sourceValue: string
  }>
}

