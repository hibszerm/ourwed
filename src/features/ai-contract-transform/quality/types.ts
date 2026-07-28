/**
 * Post-reconstruction quality gate types for the transform lab.
 */

export type QualitySeverity =
  | 'blocking'
  | 'review_required'
  | 'warning'
  | 'info'

export type CanonicalTransformField =
  | 'contract.executionDate'
  | 'customer.names'
  | 'customer.address'
  | 'customer.phone'
  | 'wedding.date'
  | 'wedding.preparationLocation'
  | 'wedding.ceremonyLocation'
  | 'wedding.receptionLocation'
  | 'contract.totalPrice'
  | 'contract.totalPriceWords'
  | 'contract.depositAmount'
  | 'contract.remainingAmount'
  | 'contract.paymentStructure'
  | 'contract.referenceNumber'
  | 'package.serviceScope'

export type FieldRequirement =
  | 'must_appear'
  | 'must_replace_source'
  | 'must_appear_in_relevant_context'
  | 'optional_if_template_has_no_slot'

export type DocumentContextKind =
  | 'party_table'
  | 'opening_paragraph'
  | 'location_table'
  | 'preparation_clause'
  | 'ceremony_clause'
  | 'reception_clause'
  | 'finance_clause'
  | 'payment_clause'
  | 'generic_body'

export type DocumentContextExpectation = {
  kind: DocumentContextKind
  blockIds: string[]
}

export type RequiredFieldExpectation = {
  canonicalField: CanonicalTransformField
  sourceValues: string[]
  expectedValues: string[]
  requirement: FieldRequirement
  expectedContexts?: DocumentContextExpectation[]
}

export type ProtectedFieldExpectation = {
  canonicalField: string
  sourceValues: string[]
  ownershipReason: string
}

export type ConsistencyRule =
  | 'money_words_match_total'
  | 'deposit_plus_remaining_equals_total'
  | 'payment_structure_matches_dataset'
  | 'no_mixed_source_target'
  | 'package_scope_stable_without_explicit_scope'

export type SourceSpecificValue = {
  canonicalField: CanonicalTransformField
  sourceValue: string
  normalizedValue: string
  sourceBlockIds: string[]
  sourceSpans: Array<{ blockId: string; start: number; end: number }>
  context: DocumentContextKind
  mustDisappear: boolean
}

export type AdditionalServicesExpectation = {
  expectedNames: string[]
  shouldAppear: boolean
  pricesMustNotAppear: true
  quantitiesMustNotAppear: true
}

export type TransformationExpectationManifest = {
  requiredFields: RequiredFieldExpectation[]
  protectedFields: ProtectedFieldExpectation[]
  consistencyRules: ConsistencyRule[]
  sourceSpecificValues: SourceSpecificValue[]
  requiredReplacements: RequiredReplacement[]
  additionalServices?: AdditionalServicesExpectation
}

export type RequiredReplacement = {
  canonicalField: CanonicalTransformField
  sourceValues: string[]
  targetRenderedValues: string[]
  sourceBlockIds: string[]
  requiredContextBlockIds: string[]
  replacementPolicy: 'replace_all_occurrences' | 'replace_in_contexts'
}

export type QualityIssue = {
  code: string
  severity: QualitySeverity
  canonicalField?: CanonicalTransformField | string
  blockId?: string
  safeDescription: string
}

export type DeterministicRepair = {
  repairCode: string
  blockId: string
  canonicalField?: string
  beforeFingerprint: string
  afterFingerprint: string
}

export type DocumentQualityReport = {
  completeness: {
    status: 'pass' | 'review_required' | 'fail'
    requiredFieldCount: number
    satisfiedFieldCount: number
    missingFields: string[]
    staleSourceValues: string[]
    partialApplications: string[]
    mixedSourceTargetFields: string[]
  }
  protection: {
    status: 'pass' | 'fail'
    changedProtectedFields: string[]
  }
  financialConsistency: {
    status: 'pass' | 'review_required' | 'fail'
    totalPriceMatches: boolean
    moneyWordsMatch: boolean
    depositMatches: boolean | null
    remainingMatches: boolean | null
    paymentStructureMatches: boolean | null
    issues: QualityIssue[]
  }
  locationConsistency: {
    status: 'pass' | 'review_required' | 'fail'
    suppliedRoles: string[]
    representedRoles: string[]
    missingRoles: string[]
    staleLocations: string[]
    grammarIssues: string[]
  }
  businessConsistency: {
    referenceNumberIssues: QualityIssue[]
    packageScopeIssues: QualityIssue[]
  }
  repairs: DeterministicRepair[]
  blockingIssues: QualityIssue[]
  reviewIssues: QualityIssue[]
  warnings: QualityIssue[]
}
