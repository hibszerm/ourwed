/**
 * Product wedding contract generation via sparse guarded AI.
 * Ignores legacy slot_map / package readiness — only needs source DOCX bytes.
 */

import { indexDocxForTransform } from '@/features/ai-contract-transform/indexDocxForTransform'
import { runSparseProductTransform } from '@/features/ai-contract-transform/transformService'
import { buildContractTransformationDataset } from '@/features/ai-contract-transform/transformationDataset'
import {
  FULL_AI_PROMPT_VERSION,
  TRANSFORM_PIPELINE_SCHEMA_VERSION,
} from '@/features/ai-contract-transform/types'
import { documentDraftService, documentTemplateService } from '@/lib/api/documents'
import { documentStorage } from '@/lib/api/documents/storage'
import { packageService } from '@/lib/api/packageService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { hashDocumentText } from '@/features/documents/ai/hash'
import type { Wedding } from '@/types/wedding'
import type { TransformContractResult } from './ContractTransformationService'
import { extractDocxParagraphsIncludingEmpty } from './extractDocxParagraphs'
import {
  buildFinalContractGenerationArtifact,
  createGenerationId,
} from './finalContractGenerationArtifact'
import {
  createGenerationCorrelationId,
  GenerationPipelineError,
  logGenerationStage,
  wrapGenerationFailure,
} from './generationPipelineError'
import type { GenerationAttemptResult } from './generationAttemptResult'
import { resolvePackageContractForWedding } from './packageContractAssignment'

export type SparseGenerationSource = {
  packageId: string
  packageName: string
  templateId: string
  templateVersionId: string
  sourceDocxPath: string
  sourceFileName: string | null
  versionNumber: number
}

export async function resolveSparseTemplateSource(input: {
  wedding: Wedding
}): Promise<
  | { ok: true; source: SparseGenerationSource }
  | { ok: false; code: 'missing_package' | 'missing_contract' | 'source_docx_not_found'; message: string; packagePath?: string }
> {
  const resolution = await resolvePackageContractForWedding({
    packageId: input.wedding.packageId,
    packageName: input.wedding.packageName,
  })

  if (resolution.status === 'missing_package') {
    return { ok: false, code: 'missing_package', message: resolution.message }
  }
  if (resolution.status === 'missing_contract') {
    return {
      ok: false,
      code: 'missing_contract',
      message: resolution.message,
      packagePath: resolution.packagePath,
    }
  }

  const templateId = resolution.templateId
  const template = await documentTemplateService.get(templateId)
  if (!template) {
    return {
      ok: false,
      code: 'source_docx_not_found',
      message: 'Nie znaleziono szablonu umowy przypisanego do pakietu.',
    }
  }

  const versionId =
    resolution.templateVersionId ?? template.currentVersionId ?? null
  if (!versionId) {
    return {
      ok: false,
      code: 'source_docx_not_found',
      message: 'Szablon umowy nie ma aktywnej wersji pliku.',
      packagePath: '/studio/pakiety',
    }
  }

  const version = await documentTemplateService.getVersion(versionId)
  if (!version?.sourceDocxPath) {
    return {
      ok: false,
      code: 'source_docx_not_found',
      message:
        'Brak oryginalnego pliku DOCX szablonu. Wgraj ponownie umowę w pakiecie.',
      packagePath: '/studio/pakiety',
    }
  }

  return {
    ok: true,
    source: {
      packageId: resolution.packageId,
      packageName: resolution.packageName,
      templateId,
      templateVersionId: versionId,
      sourceDocxPath: version.sourceDocxPath,
      sourceFileName: version.sourceFileName ?? null,
      versionNumber: version.versionNumber,
    },
  }
}

export const WeddingSparseContractGenerationService = {
  async generate(input: {
    wedding: Wedding
    correlationId?: string
    generationDate?: Date | string
    invoke?: Parameters<typeof runSparseProductTransform>[0]['invoke']
  }): Promise<GenerationAttemptResult> {
    const correlationId =
      input.correlationId ?? createGenerationCorrelationId()
    const trace = {
      correlationId,
      weddingId: input.wedding.id,
      stage: 'sparse_resolve' as string,
    }

    try {
      logGenerationStage(trace, 'docx_source_load', 'started')
      const resolved = await resolveSparseTemplateSource({
        wedding: input.wedding,
      })
      if (!resolved.ok) {
        throw wrapGenerationFailure(
          trace,
          'docx_source_load',
          resolved.code === 'source_docx_not_found'
            ? 'source_docx_not_found'
            : 'template_version_not_found',
          new Error(resolved.message),
          resolved.message,
        )
      }
      const { source } = resolved
      logGenerationStage(trace, 'docx_source_load', 'succeeded', {
        templateId: source.templateId,
        templateVersionId: source.templateVersionId,
      })

      logGenerationStage(trace, 'docx_source_load', 'started')
      let sourceBytes: ArrayBuffer
      try {
        sourceBytes = await documentStorage.download(source.sourceDocxPath)
      } catch (err) {
        throw wrapGenerationFailure(
          trace,
          'docx_source_load',
          'source_docx_not_found',
          err,
          'Brak oryginalnego pliku DOCX szablonu. Wgraj ponownie umowę w pakiecie.',
        )
      }
      if (!sourceBytes || sourceBytes.byteLength === 0) {
        throw wrapGenerationFailure(
          trace,
          'docx_source_load',
          'source_docx_not_found',
          new Error('Pusty plik DOCX'),
          'Brak oryginalnego pliku DOCX szablonu. Wgraj ponownie umowę w pakiecie.',
        )
      }
      logGenerationStage(trace, 'docx_source_load', 'succeeded')

      logGenerationStage(trace, 'generation_input_build', 'started')
      const blocks = await indexDocxForTransform(sourceBytes)
      if (blocks.length === 0) {
        throw wrapGenerationFailure(
          trace,
          'docx_source_load',
          'source_docx_not_found',
          new Error('empty blocks'),
          'Nie udało się odczytać treści umowy z pliku DOCX.',
        )
      }

      const pkg =
        (await packageService.get(source.packageId)) ??
        ({ id: source.packageId, name: source.packageName } as const)

      const currentDate =
        typeof input.generationDate === 'string'
          ? input.generationDate
          : input.generationDate?.toISOString()

      const extras = await weddingExtraServiceService.listByWeddingId(
        input.wedding.id,
      )

      const dataset = buildContractTransformationDataset({
        wedding: input.wedding,
        package: { id: pkg.id, name: pkg.name },
        currentDate,
        extras,
      })
      logGenerationStage(trace, 'generation_input_build', 'succeeded', {
        blockCount: blocks.length,
      })

      logGenerationStage(trace, 'docx_render', 'started')
      const transform = await runSparseProductTransform({
        sourceBytes,
        sourceBlocks: blocks,
        dataset,
        invoke: input.invoke,
      })
      if (!transform.ok) {
        if (transform.reason === 'blocked') {
          return {
            status: 'needs_review',
            issues: transform.blockingIssues.map((code) => ({
              id: code,
              message: transform.message,
              registryKeys: [],
            })),
            reviewStatePatch: {
              editableFields: [],
              contextualMessages: [transform.message],
              issues: transform.blockingIssues.map((code) => ({
                id: code,
                message: transform.message,
                registryKeys: [],
              })),
            },
            correlationId,
          }
        }
        throw wrapGenerationFailure(
          trace,
          'docx_render',
          'docx_render_failed',
          new Error(transform.message),
          transform.message,
        )
      }
      logGenerationStage(trace, 'docx_render', 'succeeded', {
        durationMs: transform.durationMs,
      })

      const extractedParagraphs = await extractDocxParagraphsIncludingEmpty(
        transform.outputBytes,
      )
      const originalParagraphs = transform.sourceBlocks.map((b) => ({
        index: b.paragraphIndex,
        text: b.text,
      }))

      const datasetFingerprint = await hashDocumentText(
        JSON.stringify({
          weddingId: input.wedding.id,
          packageId: source.packageId,
          templateVersionId: source.templateVersionId,
          extras: extras.map((e) => e.id).sort(),
        }),
      )
      const finalArtifact = await buildFinalContractGenerationArtifact({
        generationId: createGenerationId(),
        sourceTemplateVersionId: source.templateVersionId,
        datasetFingerprint,
        finalBlocks: transform.transformedBlocks,
        paragraphInsertions: transform.paragraphInsertions,
        docxBytes: transform.outputBytes,
      })

      const template = await documentTemplateService.get(source.templateId)
      const title =
        `${template?.name ?? 'Umowa'} — ${input.wedding.couple.partner1} & ${input.wedding.couple.partner2}`

      const packageSnapshot = {
        packageId: source.packageId,
        name: source.packageName,
        currency: input.wedding.currency || 'PLN',
        items: [] as import('@/types/documents').PackageSnapshotItem[],
      }

      const draft = await documentDraftService.create({
        weddingId: input.wedding.id,
        templateId: source.templateId,
        templateVersionId: source.templateVersionId,
        title,
        fieldValues: {},
        packageSnapshot,
        money: {
          price: input.wedding.price ?? 0,
          deposit: input.wedding.depositAmount ?? 0,
          remaining: Math.max(
            0,
            (input.wedding.price ?? 0) - (input.wedding.depositAmount ?? 0),
          ),
          discount: 0,
          currency: packageSnapshot.currency,
        },
      })

      const artifact: TransformContractResult = {
        draftId: draft.id,
        templateId: source.templateId,
        templateVersionId: source.templateVersionId,
        versionNumber: source.versionNumber,
        title,
        resolved: {},
        omittedKeys: [],
        originalParagraphs,
        paragraphs: extractedParagraphs,
        docxBytes: transform.outputBytes,
        usedMock: false,
        qualityRetries: 0,
        finalArtifact,
        executionSnapshot: {
          contractExecutionDate: dataset.dates.contractExecutionDate,
          contractExecutionCity: '',
        },
        paymentDueRule: null,
        postGenerationAudit: {
          ok: true,
          issues: [],
          actionableIssues: [],
        },
      }

      // Attach sparse provenance for save() via mutable extension on resolved
      ;(artifact as TransformContractResult & {
        sparseProvenance?: Record<string, unknown>
      }).sparseProvenance = {
        engine: 'sparse_full_ai',
        schemaVersion: TRANSFORM_PIPELINE_SCHEMA_VERSION,
        promptVersion: transform.promptVersion || FULL_AI_PROMPT_VERSION,
        responseVersion: transform.responseVersion,
        model: transform.model ?? null,
        verificationSummary: {
          blockingIssues: transform.blockingIssues,
          reviewIssues: transform.reviewIssues,
        },
      }

      const {
        detectPaymentSchedule,
        evaluatePaymentSchedulePolicy,
        buildManualPaymentScheduleRequiredIssue,
      } = await import('./payment-schedule')

      const total = Math.round(input.wedding.price ?? 0)
      const deposit =
        input.wedding.depositAmount != null
          ? Math.round(input.wedding.depositAmount)
          : null
      const remaining =
        deposit != null ? Math.max(0, total - deposit) : null
      const finances = {
        totalContractAmount: total,
        depositAmount: deposit,
        remainingAmount: remaining,
      }
      const detected = detectPaymentSchedule({
        slots: [],
        paragraphs: extractedParagraphs.map((p) => ({
          index: p.index,
          text: p.text,
        })),
        finances,
      })
      const policy = evaluatePaymentSchedulePolicy(detected, finances)
      if (policy.requiresManualCompletion && policy.resolvedSchedule) {
        let generationRunId: string | undefined
        try {
          const { contractGenerationRunService } = await import(
            './payment-schedule'
          )
          const run = await contractGenerationRunService.create({
            weddingId: input.wedding.id,
            draftId: artifact.draftId,
            templateId: source.templateId,
            templateVersionId: source.templateVersionId,
            status: 'manual_input_required',
            detectedSchedule: policy.resolvedSchedule,
            resolvedValues: {},
            totalContractAmount: total,
          })
          generationRunId = run.id
        } catch {
          // Non-fatal — UI can still complete payment without a run row.
        }
        return {
          status: 'manual_input_required',
          artifact,
          paymentSchedule: policy.resolvedSchedule,
          generationRunId,
          issue: buildManualPaymentScheduleRequiredIssue(
            policy.resolvedSchedule,
            policy.unresolvedEntryIds ?? [],
          ),
        }
      }

      return { status: 'completed', artifact }
    } catch (err) {
      if (err instanceof GenerationPipelineError) throw err
      throw wrapGenerationFailure(
        trace,
        'unexpected_generation_error',
        'unexpected_generation_error',
        err,
        'Nie udało się wygenerować umowy.',
      )
    }
  },
}
