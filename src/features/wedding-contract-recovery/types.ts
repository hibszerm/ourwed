import type { ContractRecoveryErrorCode } from './errors'

export type RecoveryStatus =
  | 'uploaded'
  | 'extracting_text'
  | 'analyzing'
  | 'ready_for_review'
  | 'applying'
  | 'applied'
  | 'failed'

export type SourceContractStatus =
  | 'uploaded'
  | 'extracting'
  | 'analyzing'
  | 'ready_for_review'
  | 'applied'
  | 'failed'

export type DocumentTextAvailability =
  | 'text_available'
  | 'no_text_detected'
  | 'password_protected'
  | 'parse_failed'

export type ExtractionEvidence = {
  quote: string
  page?: number | null
  section?: string | null
}

export type ExtractedField<T> = {
  value: T | null
  rawValue?: string | null
  confidence: number
  evidence: ExtractionEvidence[]
  warnings: string[]
}

export type ContractClientExtraction = {
  fullName: ExtractedField<string>
  firstName: ExtractedField<string>
  lastName: ExtractedField<string>
  email: ExtractedField<string>
  phone: ExtractedField<string>
  addressLine: ExtractedField<string>
  postalCode: ExtractedField<string>
  city: ExtractedField<string>
  country: ExtractedField<string>
}

export type ContractRecoveryExtraction = {
  responseVersion: string
  document: {
    contractNumber: ExtractedField<string>
    signingDate: ExtractedField<string>
  }
  clients: {
    partner1: ContractClientExtraction
    partner2: ContractClientExtraction
  }
  wedding: {
    weddingDate: ExtractedField<string>
    ceremonyTime: ExtractedField<string>
    ceremonyLocation: ExtractedField<string>
    receptionLocation: ExtractedField<string>
    bridePreparationLocation: ExtractedField<string>
    groomPreparationLocation: ExtractedField<string>
  }
  finances: {
    totalContractValue: ExtractedField<number>
    currency: ExtractedField<string>
    depositAmount: ExtractedField<number>
    depositDueDate: ExtractedField<string>
    remainingAmount: ExtractedField<number>
    finalPaymentDueDate: ExtractedField<string>
    paymentTermsText: ExtractedField<string>
  }
  contractedPackage: {
    name: ExtractedField<string>
    originalDescription: ExtractedField<string>
    includedItems: Array<{
      text: string
      confidence: number
      evidence: ExtractionEvidence[]
    }>
    coverageHours: ExtractedField<number>
    coverageTimeRange: ExtractedField<string>
    deliveryDeadlineText: ExtractedField<string>
  }
  additionalServices: Array<{
    name: string
    description: string | null
    price: number | null
    currency: string | null
    confidence: number
    evidence: ExtractionEvidence[]
    warnings: string[]
  }>
  otherTerms: {
    deliveryTerms: ExtractedField<string>
    cancellationTerms: ExtractedField<string>
    notesRelevantToExecution: ExtractedField<string>
  }
  documentWarnings: string[]
}

export type RecoveryComparisonState =
  | 'missing_current'
  | 'same'
  | 'different'
  | 'missing_extracted'
  | 'invalid_extracted'
  | 'unsupported'

export type RecoveryDecisionAction = 'keep_current' | 'use_extracted' | 'skip'

export type RecoveryFieldComparison<T = string | number | null> = {
  fieldKey: string
  sectionKey: RecoverySectionKey
  label: string
  currentValue: T | null
  extractedValue: T | null
  normalizedCurrentValue: T | null
  normalizedExtractedValue: T | null
  state: RecoveryComparisonState
  confidence: number | null
  evidence: ExtractionEvidence[]
  warnings: string[]
  selectedAction: RecoveryDecisionAction
}

export type RecoverySectionKey =
  | 'clients'
  | 'contact'
  | 'wedding'
  | 'locations'
  | 'finances'
  | 'package'
  | 'additional_services'
  | 'other'
  | 'source_document'

export type RecoverySectionSummary = {
  sectionKey: RecoverySectionKey
  label: string
  status: 'found' | 'partial' | 'review' | 'missing'
}

export type RecoveryProposal = {
  version: string
  fields: RecoveryFieldComparison[]
  sections: RecoverySectionSummary[]
  packageSnapshotProposal: {
    name: string | null
    originalDescription: string | null
    includedItems: string[]
    coverageHours: number | null
    coverageTimeRange: string | null
    deliveryDeadlineText: string | null
    selectedAction: RecoveryDecisionAction
  } | null
  summary: {
    toUpdate: number
    unchanged: number
    conflictsKept: number
    invalid: number
    packageSnapshot: boolean
  }
}

export type ExtractedDocumentText = {
  fileName: string
  mimeType: string
  pageCount?: number
  plainText: string
  sections?: Array<{
    index: number
    label?: string
    text: string
    page?: number | null
  }>
  extractionMethod: 'pdf_text' | 'docx_text'
  warnings: string[]
  availability: DocumentTextAvailability
}

export type WeddingSourceContract = {
  id: string
  userId: string
  weddingId: string
  filePath: string
  originalFileName: string
  storedFileName: string
  mimeType: string
  fileSize: number
  contentHash: string | null
  pageCount: number | null
  extractionMethod: string | null
  textAvailability: DocumentTextAvailability | null
  status: SourceContractStatus
  createdAt: string
  updatedAt: string
}

export type WeddingContractRecovery = {
  id: string
  userId: string
  weddingId: string
  sourceContractId: string
  status: RecoveryStatus
  extractionVersion: string
  promptVersion: string
  responseVersion: string | null
  aiProvider: string | null
  aiModel: string | null
  validatedExtraction: ContractRecoveryExtraction | null
  normalizedExtraction: ContractRecoveryExtraction | null
  comparisonProposal: RecoveryProposal | null
  warnings: string[]
  failureCode: ContractRecoveryErrorCode | null
  failureMessage: string | null
  weddingUpdatedAtSnapshot: string | null
  supersededById: string | null
  appliedAt: string | null
  createdAt: string
  updatedAt: string
}

export type WeddingContractPackageSnapshot = {
  id: string
  userId: string
  weddingId: string
  sourceContractId: string
  recoveryId: string
  name: string | null
  originalDescription: string | null
  includedItems: string[]
  coverageHours: number | null
  deliveryDeadlineText: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type RecoveryApplyDecision = {
  fieldKey: string
  action: RecoveryDecisionAction
}

export type RecoveryApplyInput = {
  recoveryId: string
  weddingId: string
  sourceContractId: string
  decisions: RecoveryApplyDecision[]
  includePackageSnapshot: boolean
  expectedWeddingUpdatedAt: string
}

export type RecoveryApplyResult = {
  appliedFieldKeys: string[]
  packageSnapshotId: string | null
  skippedFieldKeys: string[]
}
