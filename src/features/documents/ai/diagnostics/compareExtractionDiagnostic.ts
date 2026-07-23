/**
 * Compare Pass 1 business concepts vs production coverage.
 * Measures regenerability — not literal label equality.
 */

import type {
  BusinessUnderstanding,
  BusinessUnderstandingItem,
  ConceptCoverageStatus,
  CoverageSummary,
  DiagnosticComparisonRow,
  DiagnosticPipelineStages,
  LossReason,
  LossStage,
  ProductionIdArrays,
} from './types'
import {
  buildProductionAtomSet,
  evaluateConceptCoverage,
  extractRawIds,
  isFullyCoveredStatus,
  normalizeConceptName,
  productionDisplayNamesFromIds,
} from './conceptCoverage'

export {
  normalizeConceptName,
  coverageStatusDisplayLabel,
} from './conceptCoverage'

export function extractRawIdArrays(rawParsed: unknown): ProductionIdArrays {
  return extractRawIds(rawParsed)
}

export function productionDisplayNames(ids: ProductionIdArrays): string[] {
  return productionDisplayNamesFromIds(ids)
}

function attributeCoverage(input: {
  item: BusinessUnderstandingItem
  raw: ProductionIdArrays
  validated: ProductionIdArrays
  stages: DiagnosticPipelineStages
}): DiagnosticComparisonRow {
  const { item, raw, validated, stages } = input

  const validatedIds = [
    ...validated.coupleVariables,
    ...validated.studioVariables,
    ...validated.packageVariables,
    ...validated.possibleVariables,
  ]
  const rawIds = [
    ...raw.coupleVariables,
    ...raw.studioVariables,
    ...raw.packageVariables,
    ...raw.possibleVariables,
  ]

  const atoms = buildProductionAtomSet({
    registryKeys: [
      ...stages.afterReview.registryKeys,
      ...stages.afterClassification.registryKeys,
      ...stages.afterExpand.registryKeys,
    ],
    labels: [
      ...stages.afterReview.enabledLabels,
      ...stages.afterReview.labels,
      ...stages.afterExpand.labels,
    ],
    validatedIds,
  })

  const coverage = evaluateConceptCoverage(item.name, atoms, item.source)

  if (isFullyCoveredStatus(coverage.status) || coverage.status === 'partial') {
    return {
      name: item.name,
      source: item.source,
      presentInProduction: isFullyCoveredStatus(coverage.status),
      coverageStatus: coverage.status,
      coveredBy: coverage.coveredBy,
      lossStage: 'present',
      lossReason: 'present_in_production',
      detail: coverage.detail,
    }
  }

  const loss = attributePipelineLoss({
    item,
    rawIds,
    validatedIds,
    stages,
  })

  return {
    name: item.name,
    source: item.source,
    presentInProduction: false,
    coverageStatus: 'missing',
    coveredBy: [],
    lossStage: loss.lossStage,
    lossReason: loss.lossReason,
    detail: loss.detail ?? coverage.detail,
  }
}

function attributePipelineLoss(input: {
  item: BusinessUnderstandingItem
  rawIds: string[]
  validatedIds: string[]
  stages: DiagnosticPipelineStages
}): {
  lossStage: LossStage
  lossReason: LossReason
  detail?: string
} {
  const n = normalizeConceptName(input.item.name)
  const mentions = (ids: string[]) =>
    ids.some((id) => {
      const x = normalizeConceptName(id.replace(/_/g, ' '))
      return x.includes(n) || n.includes(x) || tokenOverlap(n, x) >= 0.55
    })

  if (
    mentions(input.stages.afterReview.registryKeys) ||
    mentions(input.stages.afterReview.labels)
  ) {
    return {
      lossStage: 'present',
      lossReason: 'present_in_production',
    }
  }

  if (mentions(input.stages.afterClassification.registryKeys)) {
    return {
      lossStage: 'review_generation',
      lossReason: 'removed_by_review_generation',
      detail: 'Related signal after classification; missing from review coverage.',
    }
  }

  if (
    mentions(input.stages.afterExpand.registryKeys) ||
    mentions(input.stages.afterExpand.unmappedLabels)
  ) {
    return {
      lossStage: 'classification',
      lossReason: 'removed_by_classification',
      detail: 'Related signal after expand; dropped before review.',
    }
  }

  if (mentions(input.validatedIds)) {
    return {
      lossStage: 'registry_mapping',
      lossReason: 'removed_by_registry_mapping',
      detail: 'Present after Edge validation; did not map into review coverage.',
    }
  }

  if (mentions(input.rawIds)) {
    return {
      lossStage: 'edge_validation',
      lossReason: 'removed_by_validation',
      detail: 'Present in raw OpenAI output; removed by Edge validation.',
    }
  }

  return {
    lossStage: 'openai_output',
    lossReason: 'model_never_emitted_it',
    detail: 'Production Pass 2 never emitted a covering field for this concept.',
  }
}

function tokenOverlap(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const ta = new Set(a.split(' ').filter((t) => t.length > 2))
  const tb = new Set(b.split(' ').filter((t) => t.length > 2))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  return inter / new Set([...ta, ...tb]).size
}

function pickLikelyFirstLoss(
  missing: DiagnosticComparisonRow[],
): LossStage | 'none' {
  if (missing.length === 0) return 'none'
  const order: LossStage[] = [
    'openai_output',
    'emitted_wrong_id',
    'edge_validation',
    'registry_mapping',
    'classification',
    'review_generation',
  ]
  const counts = new Map<LossStage, number>()
  for (const row of missing) {
    counts.set(row.lossStage, (counts.get(row.lossStage) ?? 0) + 1)
  }
  let best: LossStage = missing[0]!.lossStage
  let bestCount = -1
  for (const stage of order) {
    const n = counts.get(stage) ?? 0
    if (n > bestCount) {
      best = stage
      bestCount = n
    }
  }
  return best
}

function stageLabel(stage: LossStage | 'none'): string {
  switch (stage) {
    case 'openai_output':
      return 'OpenAI output'
    case 'emitted_wrong_id':
      return 'OpenAI output (wrong id)'
    case 'edge_validation':
      return 'Edge validation'
    case 'registry_mapping':
      return 'Registry mapping'
    case 'classification':
      return 'Classification'
    case 'review_generation':
      return 'Review generation'
    case 'present':
      return 'Present'
    case 'none':
      return 'None'
  }
}

function buildCoverageSummary(
  comparisons: DiagnosticComparisonRow[],
): CoverageSummary {
  const counts: Record<ConceptCoverageStatus, number> = {
    covered: 0,
    covered_expanded: 0,
    covered_mapped: 0,
    partial: 0,
    missing: 0,
  }
  for (const row of comparisons) {
    counts[row.coverageStatus] += 1
  }
  const total = comparisons.length
  const regenerable =
    counts.covered + counts.covered_expanded + counts.covered_mapped
  const coveragePercent =
    total === 0 ? 100 : Math.round((regenerable / total) * 100)

  return {
    businessConcepts: total,
    covered: counts.covered,
    expanded: counts.covered_expanded,
    mapped: counts.covered_mapped,
    partial: counts.partial,
    missing: counts.missing,
    coveragePercent,
  }
}

export function compareExtractionDiagnostic(input: {
  understanding: BusinessUnderstanding
  stages: DiagnosticPipelineStages
}): {
  comparisons: DiagnosticComparisonRow[]
  missing: DiagnosticComparisonRow[]
  partial: DiagnosticComparisonRow[]
  coverage: CoverageSummary
  likelyFirstLoss: LossStage | 'none'
  summary: string
  production: ProductionIdArrays
  productionDisplayNames: string[]
} {
  const raw = extractRawIdArrays(input.stages.rawParsed)
  const validated = input.stages.afterValidation

  const items = [
    ...input.understanding.changingInformation,
    ...input.understanding.missingInformationNeeded,
  ].filter((item, index, arr) => {
    const key = normalizeConceptName(item.name)
    return arr.findIndex((x) => normalizeConceptName(x.name) === key) === index
  })

  const comparisons = items.map((item) =>
    attributeCoverage({ item, raw, validated, stages: input.stages }),
  )
  const missing = comparisons.filter((c) => c.coverageStatus === 'missing')
  const partial = comparisons.filter((c) => c.coverageStatus === 'partial')
  const coverage = buildCoverageSummary(comparisons)
  const likelyFirstLoss = pickLikelyFirstLoss(missing)

  const summary = [
    `Business concepts: ${coverage.businessConcepts}`,
    `Covered: ${coverage.covered}`,
    `Expanded: ${coverage.expanded}`,
    `Mapped: ${coverage.mapped}`,
    `Partial: ${coverage.partial}`,
    `Missing: ${coverage.missing}`,
    `Coverage: ${coverage.coveragePercent}%`,
  ].join(' · ')

  return {
    comparisons,
    missing,
    partial,
    coverage,
    likelyFirstLoss,
    summary,
    production: validated,
    productionDisplayNames: productionDisplayNames(validated),
  }
}

export function lossStageDisplayLabel(stage: LossStage | 'none'): string {
  return stageLabel(stage)
}

export function lossReasonDisplayLabel(reason: LossReason): string {
  switch (reason) {
    case 'present_in_production':
      return 'Present'
    case 'model_never_emitted_it':
      return 'Model never emitted it'
    case 'emitted_with_wrong_id':
      return 'Emitted with wrong id'
    case 'removed_by_validation':
      return 'Removed by validation'
    case 'removed_by_registry_mapping':
      return 'Removed by registry mapping'
    case 'removed_by_classification':
      return 'Removed by classification'
    case 'removed_by_review_generation':
      return 'Removed by review generation'
  }
}
