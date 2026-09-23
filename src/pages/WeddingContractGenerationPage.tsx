import { useEffect, useRef, useState } from 'react'
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
import { createGenerationCorrelationId } from '@/features/documents/template/WeddingContractGenerationService'
import { resolvePackageContractForWedding } from '@/features/documents/template/packageContractAssignment'
import { packageSnapshotFromWedding } from '@/features/documents/template/resolveContractVariables'
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
import { mayGenerateContract } from '@/lib/utils/contractGenerationIntegrity'
import { MissingContractDataDialog } from '@/features/weddings/actions/MissingContractDataDialog'
import type { MissingDataCorrectionKind } from '@/lib/utils/validateContractGeneration'
import { devInfo } from '@/lib/debug/devConsole'
import { startSemanticContractGeneration, resumeSemanticContractGeneration, type SemanticContractGenerationInput, type SemanticContractGenerationPendingState, type SemanticGenerationRequirement, type SemanticGenerationRequirementValues, type SemanticGenerationArtifact } from '@/features/ai-contract-transform/semanticContractGenerationService'
import { invokeSemanticMapProvider } from '@/features/ai-contract-transform/semanticMapProviderTransport'
import { buildSemanticContractProductionDataset } from '@/features/ai-contract-transform/semanticContractProductionInput'
import { validateSemanticMissingData } from '@/features/ai-contract-transform/semanticMissingDataForm'
import { SemanticMissingDataModal } from '@/features/weddings/actions/SemanticMissingDataModal'
import { downloadPackageContractTemplateSource } from '@/features/documents/template/packageContractTemplateUpload'
import { documentDraftService } from '@/lib/api/documents'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'
import { weddingExtraServiceService } from '@/lib/api/weddingExtraServiceService'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import type { WeddingPlace } from '@/types/travel'
import type { WeddingExtraService } from '@/types/package'

type WizardStep =
  | 'resolve'
  | 'generating'
  | 'waiting_for_user_input'
  | 'resuming'
  | 'manual_payment'
  | 'creating_preview'
  | 'preview'
  | 'saved'
  | 'failed'
  | 'needs_attention'

type PageGeneratedContract = Pick<TransformContractResult,
  'draftId' | 'templateId' | 'templateVersionId' | 'title' | 'resolved' | 'omittedKeys' |
  'paragraphs' | 'docxBytes' | 'usedMock' | 'qualityRetries' | 'executionSnapshot' | 'finalArtifact'>

type PreparedSemanticContract = {
  generated: PageGeneratedContract
  paymentSchedule: import('@/features/documents/template/payment-schedule').DetectedPaymentSchedule | null
  generationRunId?: string
}

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

  const weddingPlacesQuery = useQuery({
    queryKey: ['wedding-places-for-semantic-contract', weddingId],
    queryFn: () => weddingPlaceService.listByWeddingId(weddingId),
    enabled: Boolean(weddingId),
    staleTime: 30_000,
  })
  const extrasQuery = useQuery({
    queryKey: ['wedding-extras-for-semantic-contract', weddingId],
    queryFn: () => weddingExtraServiceService.listByWeddingId(weddingId),
    enabled: Boolean(weddingId),
    staleTime: 30_000,
  })
  const weddingPlaces = (weddingPlacesQuery.data ?? []) as WeddingPlace[]
  const selectedExtras = (extrasQuery.data ?? []) as WeddingExtraService[]
  const semanticInputsReady = !weddingPlacesQuery.isLoading && !extrasQuery.isLoading
    && !weddingPlacesQuery.isError && !extrasQuery.isError

  const [step, setStep] = useState<WizardStep>('resolve')
  const [generated, setGenerated] = useState<PageGeneratedContract | null>(
    null,
  )
  const [semanticPendingState, setSemanticPendingState] = useState<SemanticContractGenerationPendingState | null>(null)
  const [semanticRequirements, setSemanticRequirements] = useState<SemanticGenerationRequirement[]>([])
  const [semanticRequirementValues, setSemanticRequirementValues] = useState<SemanticGenerationRequirementValues>({})
  const [semanticRequirementErrors, setSemanticRequirementErrors] = useState<Record<string, string>>({})
  const [semanticCanonicalDataset, setSemanticCanonicalDataset] = useState<SemanticContractGenerationInput['canonicalDataset'] | null>(null)
  const [resumePending, setResumePending] = useState(false)
  const [semanticFailureCode, setSemanticFailureCode] = useState<string | null>(null)
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
  const [missingValidation, setMissingValidation] = useState<
    import('@/lib/utils/validateContractGeneration').ContractGenerationValidation | null
  >(null)
  const [showMissingData, setShowMissingData] = useState(false)
  const [generationStartedAt] = useState(() => new Date())
  const [generatePending, setGeneratePending] = useState(false)
  const [busy, setBusy] = useState(false)
  const generateInFlightRef = useRef(false)
  /** Survives success — query refetch must not wipe a completed generation. */
  const generationSuccessRef = useRef(false)
  /** Presentation-only — backend finished; stages may still animate. */
  const [generationPipelineDone, setGenerationPipelineDone] = useState(false)
  /** Presentation-only — cinematic success before preview. */
  const [showGenerationSuccess, setShowGenerationSuccess] = useState(false)

  const canGenerate = packageResolution?.status === 'ok' && semanticInputsReady && !generatePending

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
    // The user starts generation directly from this package-ready screen.
  }, [wedding, packageResolution, packageContractQuery.isLoading, step])

  async function generate() {
    if (!wedding) {
      setError('Nie można rozpocząć generowania — brak danych ślubu.')
      return
    }
    // A4 — re-check on the current wedding object at click time (stale-state safety)
    const readiness = mayGenerateContract(wedding)
    if (!readiness.isReady) {
      setMissingValidation(readiness)
      setShowMissingData(true)
      setError(
        readiness.missingGroups
          .flatMap((g) => g.items.map((item) => `Brakuje: ${item}`))
          .join(' ') || 'Uzupełnij dane do umowy przed wygenerowaniem.',
      )
      return
    }
    if (!isTravelFeeResolved(wedding)) {
      setError('Najpierw ustal koszt dojazdu.')
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

    if (!canGenerate) {
      setError('Poczekaj, aż przygotujemy dane umowy.')
      return
    }

    // Correlation id only for a real pipeline attempt.
    if (packageResolution?.status !== 'ok' || !wedding.packageId) {
      setError('Brak szablonu umowy w pakiecie.')
      return
    }
    const correlationId = createGenerationCorrelationId()
    generateInFlightRef.current = true
    setGeneratePending(true)
    setGenerationPipelineDone(false)
    setShowGenerationSuccess(false)
    setGenerationRunId(null)
    setSemanticPendingState(null)
    setSemanticRequirements([])
    setSemanticRequirementValues({})
    setSemanticRequirementErrors({})
    setSemanticCanonicalDataset(null)
    setStep('generating')
    devInfo('[contract-generate-start]', {
      weddingId: wedding.id,
      packageId: wedding.packageId ?? null,
      templateId: packageResolution.templateId,
      templateVersionId: packageResolution.templateVersionId,
      correlationId,
    })
    try {
      const source = await downloadPackageContractTemplateSource({
        templateId: packageResolution.templateId,
        templateVersionId: packageResolution.templateVersionId,
      })
      const currentDate = generationStartedAt.toISOString()
      const canonicalDataset = buildSemanticContractProductionDataset({
        wedding,
        package: { id: wedding.packageId, name: packageResolution.packageName },
        currentDate,
        extras: selectedExtras,
        weddingPlaces,
      })
      setSemanticCanonicalDataset(canonicalDataset)
      const result = await startSemanticContractGeneration({
        sourceDocxBytes: source.bytes,
        sourceIdentity: {
          templateId: packageResolution.templateId,
          version: source.templateVersionId,
          fileName: source.fileName,
        },
        currentDate,
        canonicalDataset,
        modelCandidate: 'terra',
      }, invokeSemanticMapProvider)
      if (result.status === 'REQUIRES_USER_INPUT') {
        generationSuccessRef.current = false
        setSemanticPendingState(result.pendingState)
        setSemanticRequirements(result.requirements)
        setSemanticRequirementValues({})
        setSemanticRequirementErrors({})
        setStep('waiting_for_user_input')
        return
      }
      if (result.status !== 'COMPLETED') {
        throw Object.assign(new Error(result.message), { semanticCode: result.code })
      }
      const prepared = await prepareSemanticPreview(result.artifact)
      setGenerated(prepared.generated)
      setDocxBytes(prepared.generated.docxBytes)
      setParagraphs(prepared.generated.paragraphs.map(({ index, text }) => ({ index, text })))
      if (prepared.paymentSchedule) {
        generationSuccessRef.current = false
        setPaymentSchedule(prepared.paymentSchedule)
        setGenerationRunId(prepared.generationRunId ?? null)
        setPaymentWasManual(false)
        setStep('manual_payment')
        return
      }
      generationSuccessRef.current = true
      setGenerationPipelineDone(true)
      devInfo('[contract-generate-success]', {
        generator: 'semantic-map-v7',
        nextNavigationOrAction: 'generation_success_presentation',
        paragraphCount: prepared.generated.paragraphs.length,
      })
    } catch (err) {
      generationSuccessRef.current = false
      setGenerationPipelineDone(false)
      setShowGenerationSuccess(false)
      const code = err && typeof err === 'object' && 'semanticCode' in err && typeof err.semanticCode === 'string'
        ? err.semanticCode
        : 'semantic_generation_failed'
      setSemanticFailureCode(code)
      setError(semanticFailureMessage(code))
      setStep('failed')
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

  async function prepareSemanticPreview(artifact: SemanticGenerationArtifact): Promise<PreparedSemanticContract> {
    if (!wedding || packageResolution?.status !== 'ok') throw new Error('semantic_generation_context_missing')
    const templateId = artifact.sourceIdentity.templateId ?? packageResolution.templateId
    const templateVersionId = artifact.sourceIdentity.version ?? packageResolution.templateVersionId
    if (!templateId || !templateVersionId) throw new Error('semantic_template_identity_missing')
    const title = `${packageResolution.packageName} — ${wedding.couple.partner1} & ${wedding.couple.partner2}`
    const summary = getWeddingCommercialSummary(wedding)
    const packageSnapshot = packageSnapshotFromWedding(wedding)
    const extracted = await extractDocxParagraphsIncludingEmpty(artifact.docxBytes)
    const draft = await documentDraftService.create({
      weddingId: wedding.id,
      templateId,
      templateVersionId,
      title,
      fieldValues: {},
      packageSnapshot,
      money: {
        price: summary.contractValue,
        deposit: summary.agreedDeposit,
        remaining: summary.remainingAfterDeposit,
        discount: 0,
        currency: summary.currency,
      },
    })
    const generated: PageGeneratedContract = {
      draftId: draft.id,
      templateId,
      templateVersionId,
      title,
      resolved: {},
      omittedKeys: [],
      paragraphs: extracted,
      docxBytes: artifact.docxBytes,
      usedMock: false,
      qualityRetries: 0,
      executionSnapshot: null,
      finalArtifact: null,
    }
    const {
      detectPaymentSchedule,
      evaluatePaymentSchedulePolicy,
      contractGenerationRunService,
    } = await import('@/features/documents/template/payment-schedule')
    const finances = {
      totalContractAmount: Math.round(summary.contractValue),
      depositAmount: Math.round(summary.agreedDeposit),
      remainingAmount: Math.round(summary.remainingAfterDeposit),
    }
    const detected = detectPaymentSchedule({
      slots: [],
      paragraphs: extracted.map(({ index, text }) => ({ index, text })),
      finances,
    })
    const policy = evaluatePaymentSchedulePolicy(detected, finances)
    let generationRunId: string | undefined
    if (policy.requiresManualCompletion && policy.resolvedSchedule) {
      try {
        const run = await contractGenerationRunService.create({
          weddingId: wedding.id,
          draftId: draft.id,
          templateId,
          templateVersionId,
          status: 'manual_input_required',
          detectedSchedule: policy.resolvedSchedule,
          resolvedValues: generated.resolved,
          totalContractAmount: finances.totalContractAmount,
          intermediateDocxBytes: artifact.docxBytes,
        })
        generationRunId = run.id
      } catch {
        // Preserve the in-memory manual completion path when optional run persistence is unavailable.
      }
    }
    return {
      generated,
      paymentSchedule: policy.requiresManualCompletion ? policy.resolvedSchedule : null,
      ...(generationRunId ? { generationRunId } : {}),
    }
  }

  function discardSemanticRequirements() {
    setSemanticPendingState(null)
    setSemanticRequirements([])
    setSemanticRequirementValues({})
    setSemanticRequirementErrors({})
    setSemanticCanonicalDataset(null)
    setSemanticFailureCode(null)
    setStep('resolve')
  }

  async function resumeSemanticGeneration() {
    if (!semanticPendingState || resumePending || generateInFlightRef.current) return
    const validationErrors = validateSemanticMissingData(semanticRequirements, semanticRequirementValues)
    setSemanticRequirementErrors(validationErrors)
    if (Object.keys(validationErrors).length) return
    setResumePending(true)
    generateInFlightRef.current = true
    setSemanticFailureCode(null)
    setError(null)
    setGenerationPipelineDone(false)
    setShowGenerationSuccess(false)
    setStep('resuming')
    try {
      const result = await resumeSemanticContractGeneration({
        pendingState: semanticPendingState,
        suppliedValues: semanticRequirementValues,
      })
      if (result.status === 'REQUIRES_USER_INPUT') {
        setSemanticPendingState(result.pendingState)
        setSemanticRequirements(result.requirements)
        setStep('waiting_for_user_input')
        return
      }
      if (result.status !== 'COMPLETED') {
        throw Object.assign(new Error(result.message), { semanticCode: result.code })
      }
      const prepared = await prepareSemanticPreview(result.artifact)
      setGenerated(prepared.generated)
      setDocxBytes(prepared.generated.docxBytes)
      setParagraphs(prepared.generated.paragraphs.map(({ index, text }) => ({ index, text })))
      setSemanticPendingState(null)
      setSemanticRequirements([])
      setSemanticRequirementValues({})
      setSemanticRequirementErrors({})
      setSemanticCanonicalDataset(null)
      if (prepared.paymentSchedule) {
        setPaymentSchedule(prepared.paymentSchedule)
        setGenerationRunId(prepared.generationRunId ?? null)
        setPaymentWasManual(false)
        setStep('manual_payment')
        return
      }
      generationSuccessRef.current = true
      setGenerationPipelineDone(true)
      setShowGenerationSuccess(false)
      setStep('generating')
    } catch (err) {
      generationSuccessRef.current = false
      const code = err && typeof err === 'object' && 'semanticCode' in err && typeof err.semanticCode === 'string'
        ? err.semanticCode
        : 'semantic_generation_failed'
      setSemanticFailureCode(code)
      setError(semanticFailureMessage(code))
      setStep('failed')
    } finally {
      generateInFlightRef.current = false
      setResumePending(false)
    }
  }

  function semanticFailureMessage(code: string): string {
    if (code.startsWith('provider_')) return 'Nie udało się bezpiecznie przeanalizować umowy. Spróbuj ponownie później.'
    return 'Nie udało się bezpiecznie przygotować umowy. Spróbuj ponownie później.'
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
        packageSnapshot: packageSnapshotFromWedding(wedding),
        manualOverrides: {},
        resolvedValues: generated.resolved,
        resolveEmptyValuesFromWedding: false,
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
      // Durable artifact + CRM lifecycle must finish before success.
      await weddingActionsService.markContractGenerated(wedding.id, {
        missingFields: generated.omittedKeys,
        hadDocument: true,
      })
      setDocxBytes(bytesToSave)
      setGenerated({
        ...generated,
        docxBytes: bytesToSave,
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
      // Cache refresh is non-critical for "saved" — do not block the Save spinner
      // on weddings/calendar/dashboard/finance refetches.
      void invalidateWedding(wedding.id)
      void queryClient.invalidateQueries({
        queryKey: ['generated-wedding-contracts'],
      })
      if (generated.finalArtifact) {
        const artifact = generated.finalArtifact
        void refreshFinalDocxHash(artifact, bytesToSave).then((finalArtifact) => {
          setGenerated((current) =>
            current
              ? {
                  ...current,
                  docxBytes: bytesToSave,
                  finalArtifact,
                }
              : current,
          )
        })
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

  const pageReadiness = mayGenerateContract(wedding)
  if (!pageReadiness.isReady) {
    const receptionMissing = pageReadiness.missingGroups.some((g) =>
      g.items.includes('Miejsce przyjęcia'),
    )
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
        <PageContainer width="wide">
          <div
            className={styles.card}
            data-testid="contract-readiness-generation-block"
            role="alert"
          >
            <h2>
              {pageReadiness.title ?? 'Uzupełnij dane do umowy'}
            </h2>
            <p className={styles.muted}>
              {pageReadiness.description ??
                'Przed wygenerowaniem umowy uzupełnij poniższe informacje.'}
            </p>
            {pageReadiness.missingGroups.map((group) => (
              <div key={group.id}>
                <strong>{group.label}</strong>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            {receptionMissing ? (
              <p className={styles.muted}>
                Do wygenerowania umowy wymagane jest miejsce przyjęcia.
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="primary"
                onClick={() =>
                  navigate(`/sluby/${wedding.id}?tab=overview`)
                }
              >
                {pageReadiness.primaryCorrection?.label ?? 'Uzupełnij dane'}
              </Button>
            </div>
          </div>
        </PageContainer>
      </AppLayout>
    )
  }

  const visibleStep = step === 'saved' ? 'preview'
    : step === 'resuming' ? 'generating'
      : step === 'waiting_for_user_input' ? 'resolve' : step

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
            ['generating', 'Tworzenie'],
            ['preview', 'Podgląd'],
          ].map(([id, label], index) => (
            <li
              key={id}
              data-active={visibleStep === id}
              data-complete={
                ['resolve', 'generating', 'preview'].indexOf(visibleStep) > index
              }
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {step === 'resolve' && packageResolution?.status !== 'ok' ? (
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
          </section>
        ) : null}

        {step === 'resolve' && packageResolution?.status === 'ok' ? (
          <section className={styles.card}>
            <div>
              <p className={styles.eyebrow}>Umowa z pakietu</p>
              <h2>Gotowa do utworzenia</h2>
              <p className={styles.muted}>
                Użyjemy umowy pakietu {packageResolution.packageName} i aktualnych danych ślubu.
              </p>
            </div>
            {!semanticInputsReady ? (
              <p className={styles.muted} role="status">
                Pobieramy dane lokalizacji i usług dodatkowych…
              </p>
            ) : null}
            {(weddingPlacesQuery.isError || extrasQuery.isError) ? (
              <p className={styles.error} role="alert">
                Nie udało się pobrać danych lokalizacji lub usług dodatkowych.
              </p>
            ) : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
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
                disabled={!canGenerate}
                data-testid="generate-contract-button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void generate()
                }}
              >
                {generatePending ? 'Tworzymy umowę' : 'Utwórz umowę'}
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
              setStep('resolve')
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
              <p role="alert" className={styles.error} data-failure-code={semanticFailureCode ?? undefined}>
                {error}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setError(null)
                  setStep('resolve')
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

        {step === 'generating' || step === 'resuming' ? (
          <section className={`${styles.card} ${styles.generating}`} aria-hidden>
            <p className={styles.eyebrow}>Przygotowanie</p>
            <h2>Tworzymy gotową umowę</h2>
            <p className={styles.muted}>
              Uzupełniamy dane i przygotowujemy dokument.
            </p>
          </section>
        ) : null}

        <ContractGenerationOverlay
          open={(step === 'generating' || step === 'resuming') && !showGenerationSuccess}
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
                  onClick={() => setStep('resolve')}
                >
                  Wróć do generatora
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
              setStep('resolve')
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
      <MissingContractDataDialog
        open={showMissingData}
        validation={missingValidation}
        onClose={() => {
          setShowMissingData(false)
          setMissingValidation(null)
        }}
        onCorrect={(kind: MissingDataCorrectionKind) => {
          setShowMissingData(false)
          setMissingValidation(null)
          if (kind === 'edit_travel_fee' || kind === 'edit_couple' || kind === 'multi') {
            navigate(`/sluby/${wedding.id}?tab=overview`)
            return
          }
          if (kind === 'edit_package' || kind === 'edit_payments') {
            navigate(`/sluby/${wedding.id}?tab=contract_finance`)
            return
          }
          if (kind === 'company_settings') {
            navigate('/ustawienia/firma')
          }
        }}
      />
      <SemanticMissingDataModal
        open={Boolean(semanticPendingState) && step === 'waiting_for_user_input'}
        busy={resumePending}
        requirements={semanticRequirements}
        dataset={semanticCanonicalDataset}
        values={semanticRequirementValues}
        errors={semanticRequirementErrors}
        onChange={(id, value) => {
          setSemanticRequirementValues((current) => ({ ...current, [id]: value }))
          setSemanticRequirementErrors((current) => {
            const next = { ...current }
            delete next[id]
            return next
          })
        }}
        onSubmit={() => void resumeSemanticGeneration()}
        onCancel={discardSemanticRequirements}
      />
    </AppLayout>
  )
}
