export type ChangingSource = 'couple' | 'company' | 'package' | 'other'

export type LossStage =
  | 'present'
  | 'openai_output'
  | 'edge_validation'
  | 'registry_mapping'
  | 'classification'
  | 'review_generation'
  | 'emitted_wrong_id'

export type LossReason =
  | 'present_in_production'
  | 'model_never_emitted_it'
  | 'emitted_with_wrong_id'
  | 'removed_by_validation'
  | 'removed_by_registry_mapping'
  | 'removed_by_classification'
  | 'removed_by_review_generation'

export type ConceptCoverageStatus =
  | 'covered'
  | 'covered_expanded'
  | 'covered_mapped'
  | 'partial'
  | 'missing'

export interface BusinessUnderstandingItem {
  name: string
  source?: ChangingSource
  reason?: string
}

export interface BusinessUnderstanding {
  businessType: string
  workflow: {
    beforeWedding: string[]
    weddingDay: string[]
    afterWedding: string[]
  }
  changingInformation: BusinessUnderstandingItem[]
  constantInformation: BusinessUnderstandingItem[]
  missingInformationNeeded: BusinessUnderstandingItem[]
  promptVersion?: string
  model?: string
}

export interface ProductionIdArrays {
  coupleVariables: string[]
  studioVariables: string[]
  packageVariables: string[]
  possibleVariables: string[]
}

export interface DiagnosticPipelineStages {
  /** Raw OpenAI JSON after parse (pre-allow-list). */
  rawParsed: unknown
  /** After Edge validateAndNormalizeAnalysis. */
  afterValidation: ProductionIdArrays
  /** Registry keys / labels after expandSemanticExtraction. */
  afterExpand: {
    registryKeys: string[]
    labels: string[]
    unmappedLabels: string[]
  }
  /** After classifyDetectedFields. */
  afterClassification: {
    registryKeys: string[]
    labels: string[]
  }
  /** After generateQuestionnaireDraft / prepareReviewDraft. */
  afterReview: {
    registryKeys: string[]
    labels: string[]
    enabledLabels: string[]
  }
}

export interface DiagnosticComparisonRow {
  name: string
  source?: ChangingSource
  /** @deprecated Prefer coverageStatus — true only for full coverage. */
  presentInProduction: boolean
  coverageStatus: ConceptCoverageStatus
  coveredBy: string[]
  lossStage: LossStage
  lossReason: LossReason
  detail?: string
}

export interface CoverageSummary {
  businessConcepts: number
  covered: number
  expanded: number
  mapped: number
  partial: number
  missing: number
  /** Fully regenerable concepts (covered + expanded + mapped) / total. */
  coveragePercent: number
}

export interface ExtractionDiagnosticReport {
  generatedAt: string
  businessType: string
  understanding: BusinessUnderstanding
  production: ProductionIdArrays
  productionDisplayNames: string[]
  stages: DiagnosticPipelineStages
  comparisons: DiagnosticComparisonRow[]
  missing: DiagnosticComparisonRow[]
  partial: DiagnosticComparisonRow[]
  coverage: CoverageSummary
  likelyFirstLoss: LossStage | 'none'
  summary: string
}
