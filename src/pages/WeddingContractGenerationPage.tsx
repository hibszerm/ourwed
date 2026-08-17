import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import {
  applyDocxParagraphEdits,
  saveGeneratedContract,
  type DocxParagraph,
  type TransformContractResult,
} from '@/features/documents/template'
import { resolveContractSaveBytes } from '@/features/documents/template/resolveContractSaveBytes'
import {
  ContractArtifactVersionMismatchError,
  refreshFinalDocxHash,
} from '@/features/documents/template/finalContractGenerationArtifact'
import { extractDocxParagraphsIncludingEmpty } from '@/features/documents/template/extractDocxParagraphs'
import {
  WeddingContractGenerationService,
  buildGenerationReviewState,
  createGenerationCorrelationId,
  GenerationPipelineError,
  userFacingGenerationErrorMessage,
  type ConfiguredContractCompletenessReport,
  type SharedLocationDecision,
} from '@/features/documents/template/WeddingContractGenerationService'
import { WeddingSparseContractGenerationService } from '@/features/documents/template/WeddingSparseContractGenerationService'
import { isSparseWeddingContractGenerationEnabled } from '@/features/documents/template/sparseWeddingContractFlags'
import {
  interpretGenerationAttemptResult,
  needsReviewUserMessage,
} from '@/features/documents/template/interpretGenerationAttemptResult'
import { validateContractFieldValue } from '@/features/documents/template/contractFieldValidation'
import { resolvePackageContractForWedding } from '@/features/documents/template/packageContractAssignment'
import { isPackageContractAllowedDynamicKey } from '@/features/documents/template/packageContractAllowlist'
import type { CompletenessField } from '@/features/documents/template/buildContractCompleteness'
import {
  ContractGenerationOverlay,
  ContractSuccessState,
  DocxActionButton,
  PaymentScheduleCompletionForm,
  ContractReadyPreview,
  ContractDocxPreview,
} from '@/features/documents/contract-experience'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { useProMutationPageGuard } from '@/features/billing/useProMutationPageGuard'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import styles from './WeddingContractGenerationPage.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { isTravelFeeResolved } from '@/lib/utils/travelFeeCommercial'
import { devError, devInfo } from '@/lib/debug/devConsole'

type WizardStep =
  | 'resolve'
  | 'verify'
  | 'generating'
  | 'manual_payment'
  | 'creating_preview'
  | 'preview'
  | 'saved'
  | 'failed'
  | 'needs_attention'

const useSparseGeneration = isSparseWeddingContractGenerationEnabled()

type PackageContractResolution =
  | {
      status: 'ok'
      packageId: string
      packageName: string
      templateId: string
      templateVersionId: string | null
    }
  | {
      status: 'missing_package'
      message: string
    }
  | {
      status: 'missing_contract'
      packageId: string
      packageName: string
      message: string
      packagePath: string
    }
  | null

export function WeddingContractGenerationPage() {
  const { weddingId = '' } = useParams<{ weddingId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const invalidateWedding = useInvalidateWedding()
  useProMutationPageGuard(weddingId ? `/sluby/${weddingId}` : '/sluby')
  const { data: wedding, isLoading: weddingLoading } = useWedding(weddingId)

  const packageContractQuery = useQuery({
    queryKey: [
      'package-contract-for-wedding',
      weddingId,
      wedding?.packageId ?? null,
    ],
    queryFn: () =>
      resolvePackageContractForWedding({
        packageId: wedding?.packageId,
        packageName: wedding?.packageName,
      }),
    enabled: Boolean(wedding?.id),
    staleTime: 30_000,
  })

  const packageResolution = (packageContractQuery.data ??
    null) as PackageContractResolution

  const [step, setStep] = useState<WizardStep>('resolve')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  )
  const [report, setReport] =
    useState<ConfiguredContractCompletenessReport | null>(null)
  /** Keystroke draft — never drives field visibility / generationAllowed. */
  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>(
    {},
  )
  /** Committed after “Uzupełnij dane” validation — drives review + generate. */
  const [committedOverrides, setCommittedOverrides] = useState<
    Record<string, string>
  >({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [locationDecision, setLocationDecision] =
    useState<SharedLocationDecision | null>(null)
  const [generated, setGenerated] = useState<TransformContractResult | null>(
    null,
  )
  const [paragraphs, setParagraphs] = useState<DocxParagraph[]>([])
  const [docxBytes, setDocxBytes] = useState<ArrayBuffer | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [paymentSchedule, setPaymentSchedule] = useState<
    import('@/features/documents/template/payment-schedule').DetectedPaymentSchedule | null
  >(null)
  const [generationRunId, setGenerationRunId] = useState<string | null>(null)
  const [qualitySummary, setQualitySummary] = useState<
    import('@/features/documents/template/payment-schedule').FriendlyQualitySummary | null
  >(null)
  const [paymentWasManual, setPaymentWasManual] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generationStartedAt] = useState(() => new Date())
  const [forcedEditableFields, setForcedEditableFields] = useState<
    CompletenessField[]
  >([])
  /** Survives review recomputation — merged by stable registryKey. */
  const [runtimeReviewIssues, setRuntimeReviewIssues] = useState<
    CompletenessField[]
  >([])
  const [generatePending, setGeneratePending] = useState(false)
  const [busy, setBusy] = useState(false)
  const generateInFlightRef = useRef(false)
  const autoVerifyStarted = useRef(false)
  /** Survives success — query refetch must not wipe a completed generation. */
  const generationSuccessRef = useRef(false)
  /** Presentation-only — backend finished; stages may still animate. */
  const [generationPipelineDone, setGenerationPipelineDone] = useState(false)
  /** Presentation-only — cinematic success before preview. */
  const [showGenerationSuccess, setShowGenerationSuccess] = useState(false)

  const reviewState = useMemo(
    () =>
      report
        ? buildGenerationReviewState({
            report,
            overrides: committedOverrides,
            sharedLocationDecision: locationDecision,
            forcedEditableFields,
            runtimeReviewIssues,
            packageContractMode: true,
          })
        : null,
    [
      report,
      committedOverrides,
      locationDecision,
      forcedEditableFields,
      runtimeReviewIssues,
    ],
  )

  /** Fields kept visible while the photographer is still editing a draft. */
  const visibleEditableFields = useMemo(() => {
    if (!reviewState) return []
    const byKey = new Map(
      reviewState.editableMissingFields.map((f) => [f.registryKey, f]),
    )
    // Keep any field that has an uncommitted draft or a validation error visible.
    for (const [key, draft] of Object.entries(draftOverrides)) {
      if (byKey.has(key)) continue
      if (!draft.trim() && !fieldErrors[key]) continue
      const committed = committedOverrides[key]?.trim()
      if (committed && draft === committed && !fieldErrors[key]) continue
      const fromReport = report?.fields.find((f) => f.registryKey === key)
      byKey.set(key, {
        slotId: fromReport?.slotId ?? `draft-${key}`,
        registryKey: key,
        label: fromReport?.label ?? key,
        group: fromReport?.group ?? 'wedding',
        value: draft,
        missing: true,
        source: 'manual',
        sourceLabel: fromReport?.sourceLabel ?? 'Tylko w tej umowie',
        placeholder: fromReport?.placeholder,
      })
    }
    for (const key of Object.keys(fieldErrors)) {
      if (byKey.has(key)) continue
      const fromReport = report?.fields.find((f) => f.registryKey === key)
      byKey.set(key, {
        slotId: fromReport?.slotId ?? `error-${key}`,
        registryKey: key,
        label: fromReport?.label ?? key,
        group: fromReport?.group ?? 'wedding',
        value: draftOverrides[key] ?? committedOverrides[key] ?? '',
        missing: true,
        source: 'manual',
        sourceLabel: fromReport?.sourceLabel ?? 'Tylko w tej umowie',
        placeholder: fromReport?.placeholder,
      })
    }
    return [...byKey.values()]
  }, [
    reviewState,
    draftOverrides,
    committedOverrides,
    fieldErrors,
    report,
  ])

  const hasUncommittedDrafts = useMemo(() => {
    for (const field of visibleEditableFields) {
      const draft = draftOverrides[field.registryKey]
      if (draft === undefined) continue
      const committed = committedOverrides[field.registryKey] ?? ''
      if (draft !== committed) return true
    }
    return Object.keys(fieldErrors).length > 0
  }, [
    visibleEditableFields,
    draftOverrides,
    committedOverrides,
    fieldErrors,
  ])

  const canGenerate = useSparseGeneration
    ? packageResolution?.status === 'ok' && !generatePending
    : Boolean(reviewState?.generationAllowed) && !hasUncommittedDrafts

  const effectiveTemplateId =
    selectedTemplateId ??
    (packageResolution?.status === 'ok' ? packageResolution.templateId : null)
  const effectiveVersionId =
    selectedVersionId ??
    (packageResolution?.status === 'ok'
      ? packageResolution.templateVersionId
      : null)

  const hasUnsavedGeneratedDraft = step === 'preview' && Boolean(generated)
  const blocker = useBlocker(hasUnsavedGeneratedDraft)

  useEffect(() => {
    if (!hasUnsavedGeneratedDraft) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedGeneratedDraft])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const leave = window.confirm(
      'Wygenerowana umowa nie została zapisana. Opuścić stronę i utracić szkic?',
    )
    if (leave) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  useEffect(() => {
    if (!wedding || packageContractQuery.isLoading) return
    if (!packageResolution) return
    // Never reset a successful generation UI because a background query refreshed.
    if (generationSuccessRef.current || step === 'preview' || step === 'saved') {
      return
    }
    if (!isTravelFeeResolved(wedding)) {
      return
    }
    if (packageResolution.status !== 'ok') {
      setStep('resolve')
      autoVerifyStarted.current = false
      return
    }
    devInfo('[package-contract-page-load]', {
      weddingId: wedding.id,
      packageId: wedding.packageId,
      resolvedTemplateId: packageResolution.templateId,
      resolvedTemplateVersionId: packageResolution.templateVersionId,
      packageContractMode: true,
      generationSourceType: 'package_active_contract',
      persistedOnlyMode: true,
    })
    setSelectedTemplateId(packageResolution.templateId)
    setSelectedVersionId(packageResolution.templateVersionId)
    if (autoVerifyStarted.current) return
    if (step !== 'resolve') return
    autoVerifyStarted.current = true
    if (useSparseGeneration) {
      // Sparse path: no slot completeness — go straight to generate gate.
      setStep('verify')
      return
    }
    void prepareVerification(
      packageResolution.templateId,
      packageResolution.templateVersionId,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-start once per resolution
  }, [wedding, packageResolution, packageContractQuery.isLoading, step])

  function focusField(registryKey: string) {
    const el = document.querySelector<HTMLInputElement>(
      `[data-review-field="${registryKey}"]`,
    )
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus()
  }

  /**
   * Validate drafts and commit them into review overrides.
   * Field visibility is driven by committedOverrides only — drafts never hide inputs.
   */
  function commitDraftOverrides(): boolean {
    const nextCommitted = { ...committedOverrides }
    const nextErrors: Record<string, string> = {}
    const keys = new Set<string>([
      ...visibleEditableFields.map((f) => f.registryKey),
      ...Object.keys(draftOverrides),
    ])

    for (const key of keys) {
      const draft =
        draftOverrides[key] !== undefined
          ? draftOverrides[key]!
          : committedOverrides[key] ?? ''
      // Skip keys that are already resolved in review and have no draft edit.
      const stillMissing = reviewState?.editableMissingFields.some(
        (f) => f.registryKey === key,
      )
      const draftChanged =
        draftOverrides[key] !== undefined &&
        draftOverrides[key] !== (committedOverrides[key] ?? '')
      if (!stillMissing && !draftChanged && !fieldErrors[key]) continue

      const result = validateContractFieldValue(key, draft)
      if (!result.ok) {
        nextErrors[key] = result.message
        continue
      }
      nextCommitted[key] = draft.trim()
    }

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      const firstKey = Object.keys(nextErrors)[0]!
      setError(nextErrors[firstKey]!)
      queueMicrotask(() => focusField(firstKey))
      return false
    }

    setCommittedOverrides(nextCommitted)
    setDraftOverrides((current) => {
      const merged = { ...current }
      for (const [key, value] of Object.entries(nextCommitted)) {
        merged[key] = value
      }
      return merged
    })
    setError(null)
    return true
  }

  async function prepareVerification(
    templateIdOverride?: string,
    versionIdOverride?: string | null,
  ) {
    if (generationSuccessRef.current) {
      devInfo('[contract-generate-early-return]', {
        reason: 'prepare_verification_skipped_after_success',
      })
      return
    }
    const templateId = templateIdOverride ?? effectiveTemplateId
    const templateVersionId = versionIdOverride ?? effectiveVersionId
    if (!wedding || !templateId) return
    setError(null)
    setForcedEditableFields([])
    setRuntimeReviewIssues([])
    try {
      const next = await WeddingContractGenerationService.prepareVerification({
        wedding,
        templateId,
        templateVersionId,
        packageContractMode: true,
        packageId: wedding.packageId,
        overrides: committedOverrides,
        generationStartedAt,
      })
      // Defense: allowlist + one row per logical key (service already filters).
      next.fields = next.fields.filter((f) =>
        isPackageContractAllowedDynamicKey(f.registryKey),
      )
      next.missing = next.missing.filter((f) =>
        isPackageContractAllowedDynamicKey(f.registryKey),
      )
      const byKey = new Map(next.fields.map((f) => [f.registryKey, f]))
      next.fields = [...byKey.values()]
      next.missing = next.fields.filter((f) => f.missing)
      next.packageContractMode = true
      if (generationSuccessRef.current) return
      setReport(next)
      setStep('verify')
    } catch (err) {
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się przygotować danych umowy.'),
      )
      setStep('resolve')
      autoVerifyStarted.current = false
    }
  }

  function mergeRuntimeReviewFields(fields: CompletenessField[]) {
    const allowed = fields.filter((f) =>
      isPackageContractAllowedDynamicKey(f.registryKey),
    )
    setRuntimeReviewIssues((current) => {
      const byKey = new Map(current.map((f) => [f.registryKey, f]))
      for (const field of allowed) {
        byKey.set(field.registryKey, field)
      }
      return [...byKey.values()]
    })
    setForcedEditableFields((current) => {
      const byKey = new Map(current.map((f) => [f.registryKey, f]))
      for (const field of allowed) {
        byKey.set(field.registryKey, field)
      }
      return [...byKey.values()]
    })
  }

  async function generate() {
    if (!wedding) {
      setError('Nie można rozpocząć generowania — brak danych ślubu.')
      return
    }
    if (!isTravelFeeResolved(wedding)) {
      setError('Najpierw ustal koszt dojazdu.')
      return
    }

    if (useSparseGeneration) {
      if (packageResolution?.status !== 'ok') {
        setError('Brak szablonu umowy w pakiecie.')
        return
      }
      if (generatePending || generateInFlightRef.current) return
      setError(null)
      const correlationId = createGenerationCorrelationId()
      generateInFlightRef.current = true
      setGeneratePending(true)
      setGenerationPipelineDone(false)
      setShowGenerationSuccess(false)
      setStep('generating')
      try {
        const attempt = await WeddingSparseContractGenerationService.generate({
          wedding,
          correlationId,
          generationDate: generationStartedAt,
        })
        const outcome = interpretGenerationAttemptResult(attempt)
        if (outcome.kind === 'manual_input_required') {
          generationSuccessRef.current = false
          setGenerated(outcome.artifact)
          setDocxBytes(outcome.artifact.docxBytes)
          setParagraphs(
            outcome.artifact.paragraphs.map((paragraph) => ({ ...paragraph })),
          )
          setPaymentSchedule(outcome.paymentSchedule)
          setGenerationRunId(outcome.generationRunId ?? null)
          setPaymentWasManual(false)
          setStep('manual_payment')
          return
        }
        if (outcome.kind === 'needs_review') {
          generationSuccessRef.current = false
          setError(
            outcome.messages[0] ??
              'Umowa wymaga uzupełnienia danych przed zapisem.',
          )
          setStep('needs_attention')
          return
        }
        if (outcome.kind === 'invalid_result') {
          generationSuccessRef.current = false
          setError(outcome.reason)
          setStep('failed')
          return
        }
        generationSuccessRef.current = true
        setGenerated(outcome.artifact)
        setDocxBytes(outcome.artifact.docxBytes)
        setParagraphs(
          outcome.artifact.paragraphs.map((paragraph) => ({ ...paragraph })),
        )
        setGenerationPipelineDone(true)
        setShowGenerationSuccess(true)
        setStep('preview')
      } catch (err) {
        generationSuccessRef.current = false
        setError(userFacingGenerationErrorMessage(err))
        setStep('failed')
      } finally {
        generateInFlightRef.current = false
        setGeneratePending(false)
      }
      return
    }

    if (!report || !reviewState) {
      devInfo('[contract-generate-early-return]', {
        reason: 'missing_wedding_report_or_review_state',
        hasWedding: Boolean(wedding),
        hasReport: Boolean(report),
        hasReviewState: Boolean(reviewState),
      })
      setError('Nie można rozpocząć generowania — brak gotowych danych umowy.')
      return
    }
    if (generatePending || generateInFlightRef.current) {
      devInfo('[contract-generate-early-return]', {
        reason: 'duplicate_submit_guard',
        generatePending,
        inFlight: generateInFlightRef.current,
      })
      return
    }
    setError(null)

    // Commit drafts first when the photographer clicks “Uzupełnij dane”
    // or when there are uncommitted edits before generate.
    if (!canGenerate || hasUncommittedDrafts) {
      devInfo('[contract-generate-early-return]', {
        reason: hasUncommittedDrafts
          ? 'commit_drafts_before_generate'
          : 'generation_not_allowed',
        reviewIssueKeys: reviewState.editableMissingFields.map(
          (f) => f.registryKey,
        ),
      })
      const committed = commitDraftOverrides()
      if (!committed) return
      // After commit, React state updates are async — if fields remain missing,
      // stop here; the next click can generate once review allows it.
      document
        .querySelector('[data-review-section="required"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // If commit succeeded but generation still needs another pass after
      // reviewState recomputes, leave the user on verify with no silent fail.
      return
    }

    // Correlation id only for a real pipeline attempt.
    const correlationId = createGenerationCorrelationId()
    generateInFlightRef.current = true
    setGeneratePending(true)
    setGenerationPipelineDone(false)
    setShowGenerationSuccess(false)
    setStep('generating')
    devInfo('[contract-generate-start]', {
      weddingId: wedding.id,
      packageId: wedding.packageId ?? null,
      templateId: report.templateId,
      templateVersionId: effectiveVersionId,
      correlationId,
    })
    try {
      const attempt = await WeddingContractGenerationService.generate({
        wedding,
        report,
        overrides: committedOverrides,
        scope: 'local_only',
        packageContractMode: true,
        sharedLocationDecision: locationDecision,
        generationDate: generationStartedAt,
        correlationId,
        templateVersionId: effectiveVersionId ?? undefined,
      })

      const outcome = interpretGenerationAttemptResult(attempt)
      devInfo('[contract-generate-service-result]', {
        exactResultKind: outcome.kind,
        serviceStatus:
          attempt && 'status' in attempt ? attempt.status : null,
        completed: outcome.kind === 'completed',
        needs_review: outcome.kind === 'needs_review',
        failed: outcome.kind === 'invalid_result',
        generatedDocumentId:
          outcome.kind === 'completed' ? outcome.generatedDocumentId : null,
        previewUrl: null,
        blobPresence:
          outcome.kind === 'completed' ? outcome.hasDocxBytes : false,
        reviewIssuesCount:
          outcome.kind === 'needs_review' ? outcome.messages.length : 0,
        message:
          outcome.kind === 'needs_review'
            ? needsReviewUserMessage(outcome)
            : outcome.kind === 'invalid_result'
              ? outcome.reason
              : null,
      })

      if (outcome.kind === 'manual_input_required') {
        generationSuccessRef.current = false
        setGenerated(outcome.artifact)
        setDocxBytes(outcome.artifact.docxBytes)
        setParagraphs(
          outcome.artifact.paragraphs.map((paragraph) => ({ ...paragraph })),
        )
        setPaymentSchedule(outcome.paymentSchedule)
        setGenerationRunId(outcome.generationRunId ?? null)
        setPaymentWasManual(false)
        setStep('manual_payment')
        return
      }

      if (outcome.kind === 'needs_review') {
        devInfo('[contract-generate-early-return]', {
          reason: outcome.invalidEmpty
            ? 'needs_review_empty_payload'
            : 'needs_review',
          resultKind: outcome.kind,
          generationAllowed: reviewState.generationAllowed,
          reviewIssueKeys: outcome.issueKeys,
          messages: outcome.messages,
        })
        mergeRuntimeReviewFields(outcome.editableFields)
        setError(needsReviewUserMessage(outcome))
        setGenerationPipelineDone(false)
        setShowGenerationSuccess(false)
        setStep('verify')
        queueMicrotask(() => {
          document
            .querySelector('[data-review-section="required"]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          const first = outcome.editableFields[0]
          if (!first) return
          const el = document.querySelector<HTMLInputElement>(
            `[data-review-field="${first.registryKey}"]`,
          )
          el?.focus()
        })
        return
      }

      if (outcome.kind === 'invalid_result') {
        devInfo('[contract-generate-early-return]', {
          reason: 'invalid_service_result',
          resultKind: outcome.kind,
          message: outcome.reason,
        })
        setError(outcome.reason)
        setGenerationPipelineDone(false)
        setShowGenerationSuccess(false)
        setStep('verify')
        return
      }

      const result = outcome.artifact
      generationSuccessRef.current = true
      setForcedEditableFields([])
      setRuntimeReviewIssues([])
      setGenerated(result)
      setDocxBytes(result.docxBytes)
      const next = result.paragraphs.map((paragraph) => ({ ...paragraph }))
      setParagraphs(next)
      // Stay on generating — presentation finishes stages, then success UI.
      setGenerationPipelineDone(true)
      devInfo('[contract-generate-success]', {
        generatedDocumentId: outcome.generatedDocumentId,
        nextNavigationOrAction: 'generation_success_presentation',
        paragraphCount: next.length,
      })
    } catch (err) {
      devInfo('[contract-generate-catch]', {
        errorName: err instanceof Error ? err.name : typeof err,
      })
      devError('[contract-generation] generate failed', {
        correlationId,
        errorName: err instanceof Error ? err.name : typeof err,
        code:
          err instanceof GenerationPipelineError ? err.code : undefined,
        stage:
          err instanceof GenerationPipelineError ? err.stage : undefined,
      })
      generationSuccessRef.current = false
      setGenerationPipelineDone(false)
      setShowGenerationSuccess(false)
      setError(userFacingGenerationErrorMessage(err))
      setStep('verify')
    } finally {
      devInfo('[contract-generate-finally]', {
        pendingBeforeReset: true,
        currentScreenStateIntent: 'reset_pending_keep_step',
        generationSuccess: generationSuccessRef.current,
      })
      generateInFlightRef.current = false
      setGeneratePending(false)
    }
  }

  async function save(): Promise<boolean> {
    if (!generated || !docxBytes || !wedding) return false
    setError(null)
    try {
      const { bytes: bytesToSave, editsApplied } = await resolveContractSaveBytes({
        docxBytes,
        generated,
        currentParagraphs: paragraphs,
      })
      const saved = await saveGeneratedContract({
        wedding,
        draftId: generated.draftId,
        templateId: generated.templateId,
        templateVersionId: generated.templateVersionId,
        title: generated.title,
        docxBytes: bytesToSave,
        packageSnapshot: report?.packageSnapshot ?? {
          packageId: wedding.packageId ?? null,
          name: wedding.packageName ?? '',
          currency: wedding.currency || 'PLN',
          items: [],
        },
        manualOverrides: committedOverrides,
        resolvedValues: generated.resolved,
        omittedKeys: generated.omittedKeys,
        executionSnapshot: generated.executionSnapshot
          ? {
              contractExecutionDate:
                generated.executionSnapshot.contractExecutionDate ?? null,
              contractExecutionCity:
                generated.executionSnapshot.contractExecutionCity ?? null,
            }
          : null,
        auditSummary: {
          browserEditsApplied: editsApplied,
          qualityRetries: generated.qualityRetries,
          usedMock: generated.usedMock,
          generationId: generated.finalArtifact?.generationId ?? null,
          finalDocxHash: generated.finalArtifact?.finalDocxHash ?? null,
          finalBlocksHash: generated.finalArtifact?.finalBlocksHash ?? null,
          paragraphInsertionsHash:
            generated.finalArtifact?.paragraphInsertionsHash ?? null,
          ...((
            generated as TransformContractResult & {
              sparseProvenance?: Record<string, unknown>
            }
          ).sparseProvenance
            ? {
                generator: (
                  generated as TransformContractResult & {
                    sparseProvenance?: Record<string, unknown>
                  }
                ).sparseProvenance,
              }
            : {}),
        },
      })
      await weddingActionsService.markContractGenerated(wedding.id, {
        missingFields: generated.omittedKeys,
        hadDocument: true,
      })
      await invalidateWedding(wedding.id)
      await queryClient.invalidateQueries({
        queryKey: ['generated-wedding-contracts'],
      })
      setDocxBytes(bytesToSave)
      setGenerated({
        ...generated,
        docxBytes: bytesToSave,
        finalArtifact: generated.finalArtifact
          ? await refreshFinalDocxHash(generated.finalArtifact, bytesToSave)
          : generated.finalArtifact,
      })
      setDownloadUrl(saved.docxDownloadUrl)
      if (wedding && generated) {
        const { buildFriendlyQualitySummary } = await import(
          '@/features/documents/template/payment-schedule'
        )
        setQualitySummary(
          buildFriendlyQualitySummary({
            hasClients: Boolean(
              wedding.couple.partner1 && wedding.couple.partner2,
            ),
            hasWeddingDate: Boolean(wedding.date),
            hasLocations: Boolean(
              wedding.couple.venue || wedding.couple.city,
            ),
            providerProtected: true,
            contractValueOk: (wedding.price ?? 0) > 0,
            paymentSchedule,
            paymentWasManual,
          }),
        )
      }
      return true
    } catch (err) {
      if (err instanceof ContractArtifactVersionMismatchError) {
        setError(
          'Wygenerowany dokument nie jest już dostępny. Wygeneruj umowę ponownie przed zapisaniem.',
        )
        return false
      }
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się zapisać umowy.'),
      )
      return false
    }
  }

  function downloadGeneratedDocx(): boolean {
    if (!docxBytes) return false
    try {
      const blob = new Blob([docxBytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${generated?.title || 'umowa'}.docx`
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
      return true
    } catch {
      return false
    }
  }

  if (weddingLoading || packageContractQuery.isLoading) {
    return (
      <AppLayout title="Nowa umowa">
        <PageContainer width="wide">
          <p className={styles.muted}>Przygotowujemy generator umowy…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (!wedding) {
    return (
      <AppLayout title="Nowa umowa">
        <PageContainer>
          <div className={styles.card}>
            <h2>Nie znaleziono ślubu</h2>
            <Link to="/sluby">Wróć do listy ślubów</Link>
          </div>
        </PageContainer>
      </AppLayout>
    )
  }

  if (!isTravelFeeResolved(wedding)) {
    return (
      <AppLayout
        title="Nowa umowa"
        subtitle={getWeddingDisplayName(wedding)}
        action={
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(`/sluby/${wedding.id}?tab=overview`)}
          >
            Wróć do ślubu
          </Button>
        }
      >
        <PageContainer width="wide">
          <div
            className={styles.card}
            data-testid="travel-fee-generation-block"
            role="alert"
          >
            <h2>Najpierw ustal koszt dojazdu.</h2>
            <p className={styles.muted}>
              Określ, czy dojazd jest w cenie, czy doliczany osobno.
            </p>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="primary"
                onClick={() => navigate(`/sluby/${wedding.id}?tab=overview`)}
              >
                Ustal koszt dojazdu
              </Button>
            </div>
          </div>
        </PageContainer>
      </AppLayout>
    )
  }

  const visibleStep = step === 'saved' ? 'preview' : step

  return (
    <AppLayout
      title="Nowa umowa"
      subtitle={getWeddingDisplayName(wedding)}
      action={
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate(`/sluby/${wedding.id}`)}
        >
          Wróć do ślubu
        </Button>
      }
    >
      <PageContainer width="wide" className={styles.page}>
        <ol className={styles.steps} aria-label="Etapy tworzenia umowy">
          {[
            ['resolve', 'Umowa pakietu'],
            ['verify', 'Sprawdź dane'],
            ['generating', 'Tworzenie'],
            ['preview', 'Podgląd'],
          ].map(([id, label], index) => (
            <li
              key={id}
              data-active={visibleStep === id}
              data-complete={
                ['resolve', 'verify', 'generating', 'preview'].indexOf(
                  visibleStep,
                ) > index
              }
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {step === 'resolve' ? (
          <section className={styles.card}>
            <div>
              <p className={styles.eyebrow}>Umowa z pakietu</p>
              <h2>Generowanie umowy</h2>
            </div>
            {packageContractQuery.isLoading || weddingLoading ? (
              <p className={styles.muted} aria-live="polite">
                Przygotowujemy umowę pakietu…
              </p>
            ) : null}
            {packageResolution?.status === 'missing_package' ? (
              <>
                <p className={styles.error} role="alert">
                  {packageResolution.message}
                </p>
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => navigate(`/sluby/${wedding.id}`)}
                  >
                    Wróć do ślubu
                  </Button>
                </div>
              </>
            ) : null}
            {packageResolution?.status === 'missing_contract' ? (
              <>
                <p className={styles.error} role="alert">
                  {packageResolution.message}
                </p>
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => navigate(packageResolution.packagePath)}
                  >
                    Przejdź do pakietu
                  </Button>
                </div>
              </>
            ) : null}
            {packageResolution?.status === 'ok' && error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {packageResolution?.status === 'ok' && !error ? (
              <p className={styles.muted}>
                Używamy umowy pakietu {packageResolution.packageName}.
              </p>
            ) : null}
          </section>
        ) : null}

        {step === 'verify' && useSparseGeneration ? (
          <section className={styles.card}>
            <div>
              <p className={styles.eyebrow}>Umowa z pakietu</p>
              <h2>Wygeneruj umowę</h2>
              <p className={styles.muted}>
                Użyjemy szablonu pakietu{' '}
                {packageResolution?.status === 'ok'
                  ? packageResolution.packageName
                  : ''}{' '}
                oraz aktualnych danych ślubu, klientów i finansów.
              </p>
            </div>
            {error ? (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="primary"
                disabled={!canGenerate}
                onClick={() => void generate()}
              >
                Generuj umowę
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'verify' && !useSparseGeneration && report && reviewState ? (
          <section className={styles.card}>
            <div>
              <p className={styles.eyebrow}>Przed wygenerowaniem</p>
              <h2>Sprawdź dane</h2>
              <p className={styles.muted}>
                Sprawdź dane uzupełnione ze zlecenia. Brakujące wartości
                uzupełnisz poniżej.
              </p>
            </div>

            {error ? (
              <p role="alert" className={styles.error} data-testid="generation-review-error">
                {error}
              </p>
            ) : null}

            {reviewState.resolvedValues.length > 0 ? (
              <div className={styles.resolvedBlock}>
                <h3 className={styles.sectionTitle}>Uzupełnione ze zlecenia</h3>
                <ul className={styles.resolvedList}>
                  {reviewState.resolvedValues.map((field) => (
                    <li key={field.registryKey}>
                      <span>{field.label}</span>
                      <strong>
                        {committedOverrides[field.registryKey]?.trim() ||
                          field.value}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {visibleEditableFields.length > 0 ? (
              <fieldset
                className={styles.missingBlock}
                data-review-section="required"
              >
                <legend>Wymagane uzupełnienie</legend>
                {reviewState.blockingUserInputs
                  .filter((item) => item.kind === 'semantic_collision')
                  .map((item) => (
                    <p key={item.issueId} className={styles.muted}>
                      {item.message}
                    </p>
                  ))}
                {visibleEditableFields.map((field) => (
                  <label key={field.registryKey} className={styles.field}>
                    <span>{field.label}</span>
                    <input
                      data-review-field={field.registryKey}
                      aria-invalid={Boolean(fieldErrors[field.registryKey])}
                      value={
                        draftOverrides[field.registryKey] !== undefined
                          ? draftOverrides[field.registryKey]!
                          : (committedOverrides[field.registryKey] ?? '')
                      }
                      placeholder={field.placeholder ?? field.label}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setDraftOverrides((current) => ({
                          ...current,
                          [field.registryKey]: nextValue,
                        }))
                        setFieldErrors((current) => {
                          if (!current[field.registryKey]) return current
                          const next = { ...current }
                          delete next[field.registryKey]
                          return next
                        })
                      }}
                    />
                    {fieldErrors[field.registryKey] ? (
                      <span
                        className={styles.error}
                        role="alert"
                        data-testid={`field-error-${field.registryKey}`}
                      >
                        {fieldErrors[field.registryKey]}
                      </span>
                    ) : (
                      <span className={styles.muted}>{field.sourceLabel}</span>
                    )}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {reviewState.contextualQuestions.some(
              (question) => question.id === 'shared_location',
            ) ? (
              <fieldset className={styles.scope}>
                <legend>Które miejsce wpisać w umowie?</legend>
                <label>
                  <input
                    type="radio"
                    checked={locationDecision === 'use_single'}
                    onChange={() => setLocationDecision('use_single')}
                  />
                  Jedno wybrane miejsce
                </label>
                <label>
                  <input
                    type="radio"
                    checked={locationDecision === 'combine'}
                    onChange={() => setLocationDecision('combine')}
                  />
                  Wpisz wszystkie miejsca
                </label>
              </fieldset>
            ) : null}

            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/sluby/${wedding.id}`)}
              >
                Wróć do ślubu
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={generatePending}
                data-testid="generate-contract-button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void generate()
                }}
              >
                {generatePending
                  ? 'Tworzymy umowę'
                  : canGenerate
                    ? 'Utwórz umowę'
                    : 'Uzupełnij dane'}
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'manual_payment' && paymentSchedule ? (
          <PaymentScheduleCompletionForm
            schedule={paymentSchedule}
            busy={busy}
            onCancel={() => {
              setPaymentSchedule(null)
              setStep('verify')
            }}
            onSubmit={async (submitted) => {
              if (!generated || !docxBytes) return
              setBusy(true)
              setError(null)
              try {
                const {
                  applyManualPaymentSchedule,
                  validateManualPaymentSubmission,
                  contractGenerationRunService,
                } = await import(
                  '@/features/documents/template/payment-schedule'
                )
                const validated = validateManualPaymentSubmission({
                  schedule: paymentSchedule,
                  entries: submitted.entries,
                })
                if (!validated.ok) {
                  setError(
                    validated.issues[0]?.safeDescription ||
                      'Podane raty nie sumują się do wartości umowy.',
                  )
                  return
                }
                const patched = applyManualPaymentSchedule({
                  paragraphs: paragraphs.map((p) => ({
                    index: p.index,
                    text: p.text,
                  })),
                  detectedSchedule: paymentSchedule,
                  submitted,
                  resolvedValues: generated.resolved,
                })
                if (!patched.ok) {
                  setError(
                    patched.issues[0]?.safeDescription ||
                      'Nie udało się zastosować harmonogramu.',
                  )
                  return
                }
                const nextBytes = await applyDocxParagraphEdits(
                  docxBytes,
                  patched.paragraphs.map((p) => ({
                    index: p.index,
                    text: p.text,
                  })),
                )
                const nextParagraphs =
                  await extractDocxParagraphsIncludingEmpty(nextBytes)
                const nextArtifact = generated.finalArtifact
                  ? await refreshFinalDocxHash(generated.finalArtifact, nextBytes)
                  : generated.finalArtifact
                setDocxBytes(nextBytes)
                setParagraphs(nextParagraphs)
                setGenerated({
                  ...generated,
                  resolved: patched.resolvedValues,
                  paragraphs: nextParagraphs,
                  docxBytes: nextBytes,
                  finalArtifact: nextArtifact,
                })
                setPaymentSchedule(patched.schedule)
                setPaymentWasManual(true)
                if (generationRunId) {
                  try {
                    await contractGenerationRunService.update(generationRunId, {
                      status: 'ready',
                      manualSchedule: patched.schedule,
                    })
                  } catch {
                    // non-fatal if migration not applied yet
                  }
                }
                setStep('creating_preview')
                generationSuccessRef.current = true
                const ok = await save()
                if (ok) {
                  setStep('saved')
                } else {
                  setStep('preview')
                }
              } catch (e) {
                setError(
                  getUserFacingErrorMessage(e, 'Nie udało się zastosować harmonogramu płatności.'),
                )
              } finally {
                setBusy(false)
              }
            }}
          />
        ) : null}

        {step === 'creating_preview' ? (
          <section className={styles.card}>
            <p className={styles.muted}>Tworzymy podgląd dokumentu…</p>
          </section>
        ) : null}

        {step === 'failed' || step === 'needs_attention' ? (
          <section className={styles.card}>
            <div>
              <p className={styles.eyebrow}>
                {step === 'needs_attention' ? 'Wymaga uwagi' : 'Nie udało się'}
              </p>
              <h2>
                {step === 'needs_attention'
                  ? 'Umowa wymaga uzupełnienia'
                  : 'Nie udało się wygenerować umowy'}
              </h2>
            </div>
            {error ? (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setError(null)
                  setStep('verify')
                }}
              >
                Spróbuj ponownie
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(`/sluby/${wedding.id}`)}
              >
                Wróć do ślubu
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'generating' ? (
          <section className={`${styles.card} ${styles.generating}`} aria-hidden>
            <p className={styles.eyebrow}>Przygotowanie</p>
            <h2>Tworzymy gotową umowę</h2>
            <p className={styles.muted}>
              Uzupełniamy dane i przygotowujemy dokument.
            </p>
          </section>
        ) : null}

        <ContractGenerationOverlay
          open={step === 'generating' && !showGenerationSuccess}
          pipelineDone={generationPipelineDone}
          onStagesComplete={() => {
            if (!generationSuccessRef.current) return
            setShowGenerationSuccess(true)
          }}
        />

        {step === 'generating' && showGenerationSuccess ? (
          <ContractSuccessState
            onPreview={() => {
              setShowGenerationSuccess(false)
              setGenerationPipelineDone(false)
              setStep('preview')
            }}
            onDownload={async () => downloadGeneratedDocx()}
            downloadDisabled={!generated?.docxBytes}
          />
        ) : null}

        {step === 'preview' && generated ? (
          <section className={`${styles.card} ${styles.previewCard}`}>
            <div className={styles.previewHeader}>
              <div>
                <p className={styles.eyebrow}>Podgląd dokumentu</p>
                <h2>Umowa jest gotowa</h2>
                <p className={styles.muted}>
                  Podgląd może nieznacznie różnić się od wyglądu dokumentu
                  otwartego w programie Microsoft Word. Pobrany plik DOCX
                  zachowuje oryginalną strukturę i formatowanie szablonu.
                </p>
              </div>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep('verify')}
                >
                  Edytuj dane
                </Button>
                <DocxActionButton
                  idleLabel="Zapisz umowę"
                  workingLabel="Zapisywanie…"
                  doneLabel="Gotowe"
                  slowHint="Zapisujemy plik DOCX…"
                  errorMessage="Nie udało się zapisać dokumentu. Spróbuj ponownie."
                  variant="primary"
                  action={() => save()}
                  onSuccess={() => setStep('saved')}
                />
              </div>
            </div>
            <ContractDocxPreview source={docxBytes} />
          </section>
        ) : null}

        {step === 'saved' && generated ? (
          <ContractReadyPreview
            fileName={`${generated.title || 'umowa'}.docx`}
            docxBytes={docxBytes}
            onDownloadDocx={() => {
              if (downloadUrl) {
                window.open(downloadUrl, '_blank', 'noopener,noreferrer')
              } else {
                downloadGeneratedDocx()
              }
            }}
            onRegenerate={() => {
              generationSuccessRef.current = false
              setStep('verify')
            }}
            onEditPaymentSchedule={
              paymentWasManual && paymentSchedule
                ? () => setStep('manual_payment')
                : undefined
            }
            qualitySummary={qualitySummary}
            runId={generationRunId ?? undefined}
            weddingId={wedding.id}
          />
        ) : null}

        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </PageContainer>
    </AppLayout>
  )
}
