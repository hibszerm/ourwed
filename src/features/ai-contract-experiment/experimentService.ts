/**
 * Orchestrates isolated experiment runs.
 * Mode B uses live OpenAI via Supabase Edge Function (Phase 2).
 * Mode A remains mock-only.
 */

import { buildContractGenerationInput } from './contractGenerationInput'
import { buildExperimentMetrics } from './comparisonMetrics'
import {
  canRenderExperimentDocx,
  getExperimentDocxBytes,
  storeExperimentDocxBytes,
  TXT_ONLY_FIXTURE_MESSAGE,
} from './experimentDocxStorage'
import { supplementOccurrenceMappings } from './supplementalOccurrenceDetection'
import { logLogicalFieldOccurrenceTrace } from './logicalFieldOccurrenceTrace'
import { auditRenderPlan } from './pipeline/auditRenderPlan'
import { buildOccurrenceGraphFromMappings } from './pipeline/buildOccurrenceGraph'
import { buildRenderPlan } from './pipeline/buildRenderPlan'
import { executeRenderPlan } from './pipeline/executeRenderPlan'
import { evaluateGraphReadiness } from './pipeline/planReadiness'
import { selectRenderEligibility } from './pipeline/pipelineSelectors'
import { saveExperimentRun, upsertExperimentTemplate } from './experimentStorage'
import { auditFullAiGeneration } from './fullAiSafetyAudit'
import { buildIndexedDocxBlocks, indexDocxBytes } from './indexedDocx'
import {
  buildMappingGenerationContext,
} from './mappingGenerationContext'
import { filterOptionalFieldWarnings } from './mappingOptionalFieldSemantics'
import { computeMappingReadiness } from './mappingReadiness'
import { initializeReviewedResult } from './experimentalReviewState'
import {
  buildMappingDiagnosticsSummary,
  buildProposalDiagnostics,
} from './mappingDiagnosticsSummary'
import {
  validateStructuredMapping,
} from './mappingValidator'
import {
  analyzeContractForStructuredMapping,
  analyzeContractWithFullAi,
  generateCompleteContractWithAi,
} from './mockAdapters'
import { assertWeddingMatchesExperimentPackage } from './packageAssignment'
import type {
  AiContractExperimentMode,
  AiContractExperimentRun,
  AiContractExperimentTemplate,
  ContractGenerationInput,
  ExperimentalRenderChange,
  ExperimentRunResult,
  IndexedDocxBlock,
  StructuredMappingDiagnostics,
  StructuredMappingMetadata,
  ValidatedAiMapping,
} from './types'
import type { StudioPackage } from '@/types/package'
import type { Wedding } from '@/types/wedding'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export type RunExperimentOptions = {
  mode: AiContractExperimentMode
  template: AiContractExperimentTemplate
  blocks: IndexedDocxBlock[]
  wedding: Wedding
  package: Pick<StudioPackage, 'id' | 'name'>
  /** When true, Mode B uses mock adapter (tests only). */
  useMockStructuredMapping?: boolean
  fullAiOptions?: Parameters<typeof generateCompleteContractWithAi>[0]['mutate'] & {
    perfectPreserve?: boolean
  }
  onStage?: (stage: string) => void
}

export async function createExperimentTemplateFromDocx(input: {
  packageId: string
  fileName: string
  bytes: ArrayBuffer
}): Promise<{
  template: AiContractExperimentTemplate
  blocks: IndexedDocxBlock[]
}> {
  if (!input.packageId.trim()) {
    throw new Error('Szablon eksperymentalny musi być przypisany do pakietu.')
  }
  const indexed = await indexDocxBytes(input.bytes)
  const template: AiContractExperimentTemplate = {
    id: newId('exp-tpl'),
    packageId: input.packageId,
    sourceDocumentId: newId('exp-src'),
    sourceFileName: input.fileName,
    uploadedAt: new Date().toISOString(),
    analysisStatus: 'not_started',
    hasSourceDocx: true,
  }
  storeExperimentDocxBytes(template.id, input.bytes)
  upsertExperimentTemplate(template)
  return { template, blocks: indexed.blocks }
}

export function createExperimentTemplateFromBlocks(input: {
  packageId: string
  fileName: string
  blocks: IndexedDocxBlock[]
}): AiContractExperimentTemplate {
  if (!input.packageId.trim()) {
    throw new Error('Szablon eksperymentalny musi być przypisany do pakietu.')
  }
  void input.blocks
  const template: AiContractExperimentTemplate = {
    id: newId('exp-tpl'),
    packageId: input.packageId,
    sourceDocumentId: newId('exp-src'),
    sourceFileName: input.fileName,
    uploadedAt: new Date().toISOString(),
    analysisStatus: 'completed',
    hasSourceDocx: false,
  }
  upsertExperimentTemplate(template)
  return template
}

export async function runExperiment(
  input: RunExperimentOptions,
): Promise<ExperimentRunResult> {
  const pkgCheck = assertWeddingMatchesExperimentPackage({
    weddingPackageId: input.wedding.packageId,
    experimentPackageId: input.template.packageId,
  })
  if (!pkgCheck.ok) {
    throw new Error(pkgCheck.message)
  }
  if (input.package.id !== input.template.packageId) {
    throw new Error(
      'Wybrany ślub korzysta z innego pakietu niż umowa testowa.',
    )
  }

  const generationInput = buildContractGenerationInput({
    wedding: input.wedding,
    package: input.package,
  })

  const startedAt = new Date().toISOString()
  const t0 = performance.now()
  let run: AiContractExperimentRun = {
    id: newId('exp-run'),
    templateId: input.template.id,
    packageId: input.template.packageId,
    weddingId: input.wedding.id,
    mode: input.mode,
    startedAt,
    status: 'queued',
    timing: {},
  }

  try {
    input.onStage?.('Odczyt dokumentu')
    run = { ...run, status: 'analyzing' }

    if (input.mode === 'structured_mapping') {
      input.onStage?.('Przygotowanie danych')

      let response
      let mappingMetadata: StructuredMappingMetadata | undefined
      let mappingDiagnostics: StructuredMappingDiagnostics | undefined
      let requestCount = 1

      const a0 = performance.now()

      if (input.useMockStructuredMapping) {
        input.onStage?.('Analiza OpenAI')
        const mock = await analyzeContractForStructuredMapping({
          blocks: input.blocks,
          packageName: input.package.name,
          packageId: input.package.id,
        })
        response = mock.response
        requestCount = mock.requestCount
        mappingMetadata = {
          model: 'mock',
          requestCount,
          durationMs: Math.round(performance.now() - a0),
          responseId: null,
          promptVersion: 'mock',
        }
      } else {
        input.onStage?.('Analiza OpenAI')
        const { runLiveStructuredMapping } = await import('./structuredMappingApi')
        const generationContext = buildMappingGenerationContext({
          blocks: input.blocks,
          generationInput,
        })
        const live = await runLiveStructuredMapping({
          experimentRunId: run.id,
          package: { id: input.package.id, name: input.package.name },
          document: {
            fileName: input.template.sourceFileName,
            blocks: input.blocks,
          },
          generationContext,
        })
        if (!live.ok) {
          throw new Error(live.error.message)
        }
        response = filterOptionalFieldWarnings(
          live.response,
          generationContext,
          input.blocks,
        )
        mappingMetadata = live.metadata
        mappingDiagnostics = live.diagnostics
        requestCount = live.metadata.requestCount
      }

      const analysisMs = Math.round(performance.now() - a0)

      input.onStage?.('Walidacja wskazań')
      const validatedBase = validateStructuredMapping({
        response,
        blocks: input.blocks,
        generationInput,
        experimentRunId: run.id,
      })
      const validated = supplementOccurrenceMappings({
        mappings: validatedBase,
        blocks: input.blocks,
        generationInput,
        experimentRunId: run.id,
      })
      const occurrenceGraph = buildOccurrenceGraphFromMappings({
        experimentRunId: run.id,
        mappings: validated,
        blocks: input.blocks,
        generationInput,
        supplement: false,
      })
      logLogicalFieldOccurrenceTrace({
        experimentRunId: run.id,
        fieldKey: 'reception_location',
        blocks: input.blocks,
        mappings: validated,
      })
      const readiness = evaluateGraphReadiness(occurrenceGraph)
      const proposalDiagnostics = buildProposalDiagnostics(validated)
      const diagnosticsSummary = buildMappingDiagnosticsSummary(validated)

      input.onStage?.('Sprawdź mapowanie')

      const totalMs = Math.round(performance.now() - t0)
      run = {
        ...run,
        status: 'completed',
        completedAt: new Date().toISOString(),
        timing: { analysisMs, totalMs },
        usage: {
          requestCount,
          inputTokens: mappingMetadata?.inputTokens,
          outputTokens: mappingMetadata?.outputTokens,
        },
      }

      const result: ExperimentRunResult = initializeReviewedResult(
        {
          run,
          mode: 'structured_mapping',
          indexedBlocks: input.blocks,
          generationInput,
          structuredMapping: response,
          occurrenceGraph,
          validatedMappings: validated,
          mappingMetadata,
          mappingDiagnostics,
          mappingReadiness: readiness,
          mappingPhase: 'review',
          proposalDiagnostics,
          diagnosticsSummary,
          metrics: buildExperimentMetrics({
            result: {
              run,
              mode: 'structured_mapping',
              validatedMappings: validated,
            },
            plannedRendererOperations: 0,
            rendererOperations: 0,
            generationSuccess: readiness !== 'invalid',
            auditStatus: readiness,
            estimatedCostPln: 'Brak danych',
            requestCount,
            totalDurationMs: totalMs,
          }),
          rawResponse: response,
        },
        { sourceDocxAvailable: true },
      )
      saveExperimentRun(run, result)
      return result
    }

    // full_ai — mock only (Phase 2)
    input.onStage?.('Analiza AI')
    const a0 = performance.now()
    const { analysis, requestCount: analysisRequests } =
      await analyzeContractWithFullAi({
        blocks: input.blocks,
        packageName: input.package.name,
        packageId: input.package.id,
      })
    const analysisMs = Math.round(performance.now() - a0)

    input.onStage?.('Generowanie AI')
    run = { ...run, status: 'generating' }
    const g0 = performance.now()
    const { generated, requestCount: genRequests } =
      await generateCompleteContractWithAi({
        blocks: input.blocks,
        analysis,
        generationInput,
        perfectPreserve: input.fullAiOptions?.perfectPreserve,
        mutate: input.fullAiOptions,
      })
    const generationMs = Math.round(performance.now() - g0)

    input.onStage?.('Porównanie treści')
    input.onStage?.('Audyt bezpieczeństwa')
    run = { ...run, status: 'auditing' }
    const audit0 = performance.now()
    const { safety, changes } = auditFullAiGeneration({
      sourceBlocks: input.blocks,
      generated,
      analysis,
    })
    const auditMs = Math.round(performance.now() - audit0)
    const totalMs = Math.round(performance.now() - t0)

    run = {
      ...run,
      status: safety.status === 'critical' ? 'failed' : 'completed',
      completedAt: new Date().toISOString(),
      timing: { analysisMs, generationMs, auditMs, totalMs },
      usage: {
        requestCount: analysisRequests + genRequests,
        estimatedCostPln: undefined,
      },
      errorMessage:
        safety.status === 'critical'
          ? 'Audyt wykrył niedozwolone zmiany treści.'
          : undefined,
    }

    const result: ExperimentRunResult = {
      run,
      mode: 'full_ai',
      indexedBlocks: input.blocks,
      generationInput,
      fullAiAnalysis: analysis,
      fullAiGenerated: generated,
      fullAiSafety: safety,
      metrics: buildExperimentMetrics({
        result: { run, mode: 'full_ai', fullAiSafety: safety },
        requiredFieldsDetected: analysis.detectedFields.filter((f) =>
          [
            'couple_full_names',
            'contract_execution_date',
            'wedding_date',
            'contract_value_formatted',
          ].includes(f.fieldKey),
        ).length,
        optionalFieldsDetected: Math.max(
          0,
          analysis.detectedFields.length - 4,
        ),
        unauthorizedChanges: safety.unauthorizedChangeCount,
        changedSourceBlocks: changes.length,
        generationSuccess: safety.status !== 'critical',
        auditStatus: safety.status,
        estimatedCostPln: 'Brak danych',
        requestCount: analysisRequests + genRequests,
        totalDurationMs: totalMs,
      }),
      rawResponse: { analysis, generated, changes },
    }
    saveExperimentRun(run, result)
    return result
  } catch (err) {
    const totalMs = Math.round(performance.now() - t0)
    run = {
      ...run,
      status: 'failed',
      completedAt: new Date().toISOString(),
      timing: { totalMs },
      errorMessage: err instanceof Error ? err.message : String(err),
    }
    const result: ExperimentRunResult = {
      run,
      mode: input.mode,
      indexedBlocks: input.blocks,
      generationInput,
      metrics: buildExperimentMetrics({
        generationSuccess: false,
        auditStatus: 'failed',
        estimatedCostPln: 'Brak danych',
        totalDurationMs: totalMs,
      }),
    }
    saveExperimentRun(run, result)
    throw err
  }
}

/** Complete review phase and run test rendering when DOCX is available. */
export async function renderExperimentalMapping(input: {
  result: ExperimentRunResult
  template: AiContractExperimentTemplate
  validatedMappings?: ValidatedAiMapping[]
}): Promise<ExperimentRunResult> {
  const { result, template } = input
  if (result.mode !== 'structured_mapping') return result

  const eligibility = canRenderExperimentDocx({
    templateId: template.id,
    fileName: template.sourceFileName,
  })
  if (!eligibility.ok) {
    throw new Error(eligibility.message)
  }

  const sourceBytes = getExperimentDocxBytes(template.id)
  if (!sourceBytes) {
    throw new Error(TXT_ONLY_FIXTURE_MESSAGE)
  }

  const graph =
    result.occurrenceGraph ??
    buildOccurrenceGraphFromMappings({
      experimentRunId: result.run.id,
      mappings: input.validatedMappings ?? result.validatedMappings ?? [],
      blocks: result.indexedBlocks,
      generationInput: result.generationInput,
      supplement: false,
    })

  const plan = buildRenderPlan(graph)
  const readiness = evaluateGraphReadiness(graph)
  const renderEligibility = selectRenderEligibility({
    graph,
    sourceDocxAvailable: true,
  })

  if (readiness !== 'ready' || !renderEligibility.eligible) {
    throw new Error('Mapowanie nie jest gotowe do renderowania testowego.')
  }

  const t0 = performance.now()
  const rendered = await executeRenderPlan({
    plan,
    sourceBytes,
    blocks: result.indexedBlocks,
  })
  const renderDurationMs = Math.round(performance.now() - t0)

  const renderAudit = auditRenderPlan({
    plan,
    sourceBlocks: result.indexedBlocks,
    outputParagraphs: rendered.appliedParagraphs,
    replacementTraces: rendered.replacementTraces,
  })

  const renderChanges: ExperimentalRenderChange[] = plan.operations
    .filter((op) => op.status === 'READY')
    .map((op) => ({
      fieldKey: op.fieldKey,
      blockId: op.blockId,
      paragraphIndex: op.paragraphIndex,
      sourceValue: op.sourceRange.sourceText,
      replacementValue: op.replacementText,
      applied: rendered.executedOperationIds.includes(op.operationId),
    }))

  const next: ExperimentRunResult = {
    ...result,
    occurrenceGraph: graph,
    renderPlan: plan,
    validatedMappings: input.validatedMappings ?? result.validatedMappings,
    mappingPhase: 'rendered',
    mappingReadiness: readiness,
    renderAudit,
    renderChanges,
    renderedDocxAvailable: renderAudit.status !== 'critical',
    renderDurationMs,
    metrics: buildExperimentMetrics({
      result: {
        run: result.run,
        mode: 'structured_mapping',
        validatedMappings: result.validatedMappings,
        renderAudit,
      },
      rendererOperations: rendered.rendererOperations,
      generationSuccess: renderAudit.status !== 'critical',
      auditStatus: renderAudit.status,
      estimatedCostPln: 'Brak danych',
      requestCount: result.mappingMetadata?.requestCount ?? null,
      totalDurationMs: (result.run.timing.totalMs ?? 0) + renderDurationMs,
      replacedParagraphs: rendered.replacedParagraphIndices.length,
      immutableBlocksChecked: renderAudit.immutableBlocksChecked,
      auditIssues: renderAudit.issues.length,
      approvedMappings: plan.operations.filter((op) => op.status === 'READY').length,
      plannedRendererOperations: plan.operations.filter((op) => op.status === 'READY').length,
    }),
  }

  storeRenderedDocxBytes(result.run.id, rendered.outputBytes)
  saveExperimentRun(next.run, next)
  return next
}

const renderedDocxByRunId = new Map<string, ArrayBuffer>()

export function storeRenderedDocxBytes(runId: string, bytes: ArrayBuffer): void {
  renderedDocxByRunId.set(runId, bytes.slice(0))
}

export function getRenderedDocxBytes(runId: string): ArrayBuffer | null {
  const bytes = renderedDocxByRunId.get(runId)
  return bytes ? bytes.slice(0) : null
}

export function buildTestDownloadFileName(
  generationInput: ContractGenerationInput,
): string {
  const couple = generationInput.clients
    .map((c) => c.fullName.replace(/\s+/g, '_'))
    .join('_')
  const date = (generationInput.currentDate || 'bez_daty').replace(/\./g, '-')
  return `TEST_AI_MAPPING_${couple}_${date}.docx`
}

/** @deprecated use renderExperimentalMapping */
export function completeMappingReview(
  result: ExperimentRunResult,
): ExperimentRunResult {
  if (result.mode !== 'structured_mapping' || !result.validatedMappings) {
    return result
  }
  const readiness = computeMappingReadiness({
    blocks: result.indexedBlocks,
    response: result.structuredMapping,
    mappings: result.validatedMappings,
  })
  return {
    ...result,
    mappingReadiness: readiness,
  }
}

/** Build blocks from plain paragraphs (fixtures / tests without DOCX zip). */
export function blocksFromPlainParagraphs(
  paragraphs: string[],
): IndexedDocxBlock[] {
  return buildIndexedDocxBlocks({
    paragraphs: paragraphs.map((text, index) => ({
      index,
      text,
      origin: { kind: 'body' as const },
    })),
    tables: [],
  })
}

export type { ContractGenerationInput }
