import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import {
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
import { resolvePackageContractForWedding } from '@/features/documents/template/packageContractAssignment'
import { packageSnapshotFromWedding } from '@/features/documents/template/resolveContractVariables'
import {
  DocxActionButton,
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
import { devInfo } from '@/lib/debug/devConsole'
import { documentDraftService } from '@/lib/api/documents'
import { getWeddingCommercialSummary } from '@/lib/utils/commercial'
import {
  continueContractGeneration,
  ContractGenerationBoundaryClientError,
  downloadAcceptedContractCandidate,
  finalizeContractGeneration,
  validateContractGenerationCandidate,
  startContractGeneration,
  type MissingInput,
} from '@/features/contract-generation-spike/contractGenerationBoundaryClient'
import {
  type GenerationConnection,
  advanceGenerationUiRun,
  type GenerationUiRun,
} from '@/features/contract-generation-spike/generationConnection'
import { ContractGenerationMissingInputForm } from '@/features/contract-generation-spike/ContractGenerationMissingInputForm'
import type { BoundaryReviewerState } from '@/features/contract-generation-spike/serverBoundary'

type WizardStep =
  | 'resolve'
  | 'generating'
  | 'waiting_for_user_input'
  | 'preview'
  | 'saved'
  | 'conflict'
  | 'precondition'
  | 'failed'

type PageGeneratedContract = Omit<Pick<TransformContractResult,
  'draftId' | 'templateId' | 'templateVersionId' | 'title' | 'resolved' | 'omittedKeys' |
  'paragraphs' | 'docxBytes' | 'usedMock' | 'qualityRetries' | 'executionSnapshot' | 'finalArtifact'>, 'draftId'> & {
    draftId?: string
    reviewer?: BoundaryReviewerState
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

  const [step, setStep] = useState<WizardStep>('resolve')
  const [connectionState, setConnectionState] = useState<GenerationConnection | null>(null)
  const [generated, setGenerated] = useState<PageGeneratedContract | null>(
    null,
  )
  const [missingInputs, setMissingInputs] = useState<MissingInput[]>([])
  const [paragraphs, setParagraphs] = useState<DocxParagraph[]>([])
  const [docxBytes, setDocxBytes] = useState<ArrayBuffer | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [qualitySummary, setQualitySummary] = useState<
    import('@/features/documents/template/payment-schedule').FriendlyQualitySummary | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [generatePending, setGeneratePending] = useState(false)
  const generateInFlightRef = useRef(false)
  const connectionRef = useRef<GenerationConnection | null>(null)
  const generationUiRunRef = useRef<GenerationUiRun | null>(null)
  const operationFinishedRef = useRef<Promise<void> | null>(null)
  const finishOperationRef = useRef<(() => void) | null>(null)
  const navigationCleanupRef = useRef(false)
  const connection = connectionState

  const canGenerate = packageResolution?.status === 'ok' && !generatePending

  const blocker = useBlocker(Boolean(connection))

  function updateConnection(value: GenerationConnection | null) {
    connectionRef.current = value
    setConnectionState(value)
  }

  function beginOperation() {
    let finish!: () => void
    operationFinishedRef.current = new Promise<void>((resolve) => { finish = resolve })
    finishOperationRef.current = () => {
      finish()
      operationFinishedRef.current = null
      finishOperationRef.current = null
    }
  }

  useEffect(() => {
    if (blocker.state !== 'blocked' || navigationCleanupRef.current) return
    navigationCleanupRef.current = true
    void (async () => {
      const inFlight = operationFinishedRef.current
      if (inFlight) await inFlight
      const current = connectionRef.current
      if (current) {
        await finalizeContractGeneration({
          weddingId,
          ...(current.sessionId ? { sessionId: current.sessionId } : { requestId: current.requestId }),
          ...(current.saveToken ? { saveToken: current.saveToken } : {}),
          reason: 'abandoned',
        }).catch(() => undefined)
        updateConnection(null)
      }
      blocker.proceed()
      navigationCleanupRef.current = false
    })()
    // A blocked transition is handled once; ordinary renders must not abandon it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state, weddingId])

  useEffect(() => {
    if (!wedding || packageContractQuery.isLoading) return
    if (!packageResolution) return
    if (packageResolution.status !== 'ok') return
    devInfo('[package-contract-page-load]', {
      weddingId: wedding.id,
      packageId: wedding.packageId,
      resolvedTemplateId: packageResolution.templateId,
      resolvedTemplateVersionId: packageResolution.templateVersionId,
      packageContractMode: true,
      generationSourceType: 'authenticated_server_boundary',
    })
  }, [wedding, packageResolution, packageContractQuery.isLoading])

  function clearConnection() {
    updateConnection(null)
  }

  function setSafeClientError(error: unknown) {
    if (error instanceof ContractGenerationBoundaryClientError) {
      if (error.code === 'unauthorized') {
        setError('Twoja sesja logowania wygasła. Zaloguj się ponownie i wróć do umowy.')
      } else if (error.code === 'forbidden') {
        setError('Nie masz dostępu do tego ślubu.')
      } else if (error.code === 'generation_safety') {
        setError('Nie udało się bezpiecznie zaakceptować umowy. Dokument nie został utworzony.')
      } else {
        setError('Wystąpił chwilowy problem. Możesz rozpocząć nowe podejście.')
      }
      return
    }
    setError(getUserFacingErrorMessage(error, 'Wystąpił chwilowy problem. Możesz rozpocząć nowe podejście.'))
  }

  async function showAcceptedCandidate(
    result: Extract<import('@/features/contract-generation-spike/serverBoundary').ContractGenerationBoundaryResponse, { status: 'ready' }>,
  ) {
    if (!wedding) throw new Error('wedding_context_unavailable')
    const bytes = await downloadAcceptedContractCandidate({
      weddingId: wedding.id,
      candidateId: result.candidateId,
    })
    const title = `${wedding.packageName?.trim() || 'Umowa'} — ${wedding.couple.partner1} & ${wedding.couple.partner2}`
    const extracted = await extractDocxParagraphsIncludingEmpty(bytes)
    const prepared: PageGeneratedContract = {
      templateId: result.templateId,
      templateVersionId: result.templateVersionId,
      title,
      resolved: {},
      omittedKeys: [],
      paragraphs: extracted,
      docxBytes: bytes,
      usedMock: false,
      qualityRetries: 0,
      executionSnapshot: null,
      finalArtifact: null,
      reviewer: result.reviewer,
    }
    setGenerated(prepared)
    setDocxBytes(bytes)
    setParagraphs(extracted.map(({ index, text }) => ({ index, text })))
    setMissingInputs([])
    setError(null)
    setStep('preview')
  }

  async function applyBoundaryResult(
    result: import('@/features/contract-generation-spike/serverBoundary').ContractGenerationBoundaryResponse,
    connection: GenerationConnection,
  ) {
    if (result.status === 'candidate_valid' || result.status === 'finalized') return
    const runResult = result.status === 'awaiting_input' || result.status === 'processing' || result.status === 'ready'
      ? result.status
      : 'failed'
    const advancedRun = advanceGenerationUiRun(generationUiRunRef.current, connection, runResult,
      'sessionId' in result ? result.sessionId : undefined)
    if (!advancedRun) return
    generationUiRunRef.current = advancedRun
    if (result.status === 'awaiting_input' || result.status === 'processing' || result.status === 'ready'
      || result.status === 'unresolved_conflict') {
      updateConnection({ ...connection, sessionId: result.sessionId })
    }
    if (result.status === 'awaiting_input') {
      setMissingInputs(result.missingInputs)
      setError(null)
      setStep('waiting_for_user_input')
      return
    }
    if (result.status === 'processing') {
      setMissingInputs([])
      setError(null)
      setStep('generating')
      return
    }
    if (result.status === 'ready') {
      setMissingInputs([])
      setStep('generating')
      await showAcceptedCandidate(result)
      return
    }
    if (result.status === 'unresolved_conflict') {
      clearConnection()
      setMissingInputs([])
      setError(result.message)
      setStep('conflict')
      return
    }
    clearConnection()
    setMissingInputs([])
    if (result.status === 'precondition') {
      setError('Umowa nie jest jeszcze gotowa do utworzenia. Sprawdź ustawienia umowy przed ponowną próbą.')
      setStep('precondition')
      return
    }
    if (result.status === 'stale') {
      setError(result.code === 'authority_changed'
        ? 'Dane ślubu zmieniły się podczas przygotowania umowy. Rozpocznij generowanie ponownie.'
        : 'Ta próba nie jest już aktywna. Możesz rozpocząć nowe generowanie.')
      setStep('failed')
      return
    }
    if (result.status === 'error') {
      setMissingInputs([])
      setError(result.code === 'unauthorized'
        ? 'Twoja sesja logowania wygasła. Zaloguj się ponownie i wróć do umowy.'
        : 'Nie masz dostępu do tego ślubu.')
      setStep('failed')
      return
    }
    setMissingInputs([])
    setError(result.code === 'generation_safety'
      ? 'Nie udało się bezpiecznie zaakceptować umowy. Dokument nie został utworzony.'
      : 'Wystąpił chwilowy problem. Możesz rozpocząć nowe podejście.')
    setStep('failed')
  }

  async function generate() {
    if (!wedding) {
      setError('Nie można rozpocząć generowania — brak danych ślubu.')
      return
    }
    if (generatePending || generateInFlightRef.current) return
    if (!canGenerate) {
      setError('Poczekaj, aż przygotujemy dane umowy.')
      return
    }
    if (packageResolution?.status !== 'ok' || !wedding.packageId) {
      setError('Brak szablonu umowy w pakiecie.')
      return
    }

    const connection: GenerationConnection = { requestId: crypto.randomUUID() }
    generationUiRunRef.current = { ...connection, state: 'active' }
    updateConnection(connection)
    beginOperation()
    generateInFlightRef.current = true
    setGeneratePending(true)
    setGenerated(null)
    setDocxBytes(null)
    setParagraphs([])
    setDownloadUrl(null)
    setMissingInputs([])
    setError(null)
    setStep('generating')
    try {
      const result = await startContractGeneration({ weddingId: wedding.id, requestId: connection.requestId })
      await applyBoundaryResult(result, connection)
    } catch (err) {
      await finalizeContractGeneration({ weddingId: wedding.id, requestId: connection.requestId, reason: 'abandoned' }).catch(() => undefined)
      if (generationUiRunRef.current?.requestId === connection.requestId && generationUiRunRef.current.state === 'active') {
        generationUiRunRef.current = { ...generationUiRunRef.current, state: 'terminal' }
        clearConnection()
        setMissingInputs([])
        setSafeClientError(err)
        setStep('failed')
      }
    } finally {
      generateInFlightRef.current = false
      setGeneratePending(false)
      finishOperationRef.current?.()
    }
  }

  async function continueGeneration(answers: import('@/features/contract-generation-spike/generationProtocol').ContractGenerationAnswer[]) {
    if (generateInFlightRef.current || !weddingId) return
    const connection = connectionRef.current
    if (!connection?.sessionId) {
      clearConnection()
      const currentRun = generationUiRunRef.current
      if (connection && currentRun?.requestId === connection.requestId) {
        generationUiRunRef.current = { ...currentRun, state: 'terminal' }
      }
      setMissingInputs([])
      setError('Ta próba została przerwana. Możesz rozpocząć nowe generowanie.')
      setStep('resolve')
      return
    }
    generateInFlightRef.current = true
    setGeneratePending(true)
    beginOperation()
    setError(null)
    setStep('generating')
    try {
      const result = await continueContractGeneration({ sessionId: connection.sessionId, answers })
      await applyBoundaryResult(result, connection)
    } catch (err) {
      await finalizeContractGeneration({ weddingId: weddingId, sessionId: connection.sessionId, reason: 'abandoned' }).catch(() => undefined)
      if (generationUiRunRef.current?.requestId === connection.requestId && generationUiRunRef.current.state === 'active') {
        generationUiRunRef.current = { ...generationUiRunRef.current, state: 'terminal' }
        setMissingInputs([])
        setSafeClientError(err)
        setStep('failed')
      }
    } finally {
      generateInFlightRef.current = false
      setGeneratePending(false)
      finishOperationRef.current?.()
    }
  }

  async function discardGeneration(startFresh = false) {
    const current = connectionRef.current
    if (generateInFlightRef.current) return
    generateInFlightRef.current = true
    beginOperation()
    setGeneratePending(true)
    try {
      if (current) {
        await finalizeContractGeneration({
          weddingId,
          ...(current.sessionId ? { sessionId: current.sessionId } : { requestId: current.requestId }),
          ...(current.saveToken ? { saveToken: current.saveToken } : {}),
          reason: 'discarded',
        }).catch(() => undefined)
      }
      clearConnection()
      const currentRun = generationUiRunRef.current
      if (current && currentRun?.requestId === current.requestId) {
        generationUiRunRef.current = { ...currentRun, state: 'terminal' }
      }
      setMissingInputs([])
      setGenerated(null)
      setDocxBytes(null)
      setParagraphs([])
      setDownloadUrl(null)
      setError(null)
      setStep('resolve')
    } finally {
      generateInFlightRef.current = false
      setGeneratePending(false)
      finishOperationRef.current?.()
    }
    if (startFresh) await generate()
  }

  async function save(): Promise<boolean> {
    if (!generated || !docxBytes || !wedding || generateInFlightRef.current) return false
    generateInFlightRef.current = true
    setGeneratePending(true)
    beginOperation()
    setError(null)
    let activeConnection: GenerationConnection | null = null
    let durableSaved = false
    try {
      activeConnection = connectionRef.current
      if (!activeConnection?.sessionId) {
        setGenerated(null)
        setDocxBytes(null)
        setStep('resolve')
        setError('Podgląd tej próby nie jest już aktywny. Rozpocznij nowe generowanie.')
        return false
      }
      const sessionId = activeConnection.sessionId
      const saveToken = crypto.randomUUID()
      activeConnection = { ...activeConnection, saveToken }
      updateConnection(activeConnection)
      const candidateCheck = await validateContractGenerationCandidate({
        weddingId: wedding.id,
        sessionId,
        saveToken,
      })
      if (candidateCheck.status !== 'candidate_valid') {
        await finalizeContractGeneration({
          weddingId: wedding.id,
          sessionId,
          saveToken,
          reason: 'abandoned',
        }).catch(() => undefined)
        clearConnection()
        setGenerated(null)
        setDocxBytes(null)
        setStep('resolve')
        setError('Podgląd tej próby nie jest już aktywny. Rozpocznij nowe generowanie.')
        return false
      }
      let draftId = generated.draftId
      if (!draftId) {
        const summary = getWeddingCommercialSummary(wedding)
        const draft = await documentDraftService.create({
          weddingId: wedding.id,
          templateId: generated.templateId,
          templateVersionId: generated.templateVersionId,
          title: generated.title,
          fieldValues: {},
          packageSnapshot: packageSnapshotFromWedding(wedding),
          money: {
            price: summary.contractValue,
            deposit: summary.agreedDeposit,
            remaining: summary.remainingAfterDeposit,
            discount: 0,
            currency: summary.currency,
          },
        })
        draftId = draft.id
        setGenerated((current) => current ? { ...current, draftId } : current)
      }
      const { bytes: bytesToSave, editsApplied } = await resolveContractSaveBytes({
        docxBytes,
        generated,
        currentParagraphs: paragraphs,
      })
      const saved = await saveGeneratedContract({
        wedding,
        draftId,
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
      durableSaved = true
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
            contractValueOk: getWeddingCommercialSummary(wedding).contractValue > 0,
            paymentSchedule: null,
            paymentWasManual: false,
          }),
        )
      }
      // Cache refresh is non-critical for "saved" — do not block the Save spinner
      // on weddings/calendar/dashboard/finance refetches.
      void invalidateWedding(wedding.id)
      void queryClient.invalidateQueries({
        queryKey: ['generated-wedding-contracts'],
      })
      await finalizeContractGeneration({
        weddingId: wedding.id,
        sessionId: activeConnection.sessionId,
        saveToken,
        reason: 'saved',
      }).catch(() => undefined)
      clearConnection()
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
      if (activeConnection?.sessionId && activeConnection.saveToken) {
        await finalizeContractGeneration({
          weddingId: wedding.id,
          sessionId: activeConnection.sessionId,
          saveToken: activeConnection.saveToken,
          reason: durableSaved ? 'saved' : 'abandoned',
        }).catch(() => undefined)
        clearConnection()
        if (durableSaved) {
          setStep('saved')
        } else {
          setGenerated(null)
          setDocxBytes(null)
          setParagraphs([])
          setStep('resolve')
        }
      }
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
    } finally {
      generateInFlightRef.current = false
      setGeneratePending(false)
      finishOperationRef.current?.()
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

  const visibleStep = step === 'saved' ? 'preview'
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

        {step === 'failed' || step === 'conflict' || step === 'precondition' ? (
          <section className={styles.card} role={step === 'failed' ? 'alert' : 'region'} aria-labelledby="generation-state-title">
            <div>
              <p className={styles.eyebrow}>
                {step === 'conflict' ? 'Wymaga korekty' : step === 'precondition' ? 'Ustawienia umowy' : 'Nie udało się'}
              </p>
              <h2 id="generation-state-title">
                {step === 'conflict'
                  ? 'Nie można bezpiecznie przygotować tej umowy'
                  : step === 'precondition'
                    ? 'Umowa nie jest gotowa do utworzenia'
                    : 'Nie udało się wygenerować umowy'}
              </h2>
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.actions}>
              {step === 'failed' || step === 'conflict' ? (
                <Button type="button" variant="primary" disabled={generatePending} onClick={() => void generate()}>
                  Rozpocznij nowe generowanie
                </Button>
              ) : null}
              {step === 'precondition' ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => navigate(packageResolution?.status === 'missing_contract'
                    ? packageResolution.packagePath
                    : `/sluby/${wedding.id}?tab=contract_finance`)}
                >
                  Sprawdź ustawienia umowy
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => navigate(`/sluby/${wedding.id}`)}>
                Wróć do ślubu
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'generating' ? (
          <section className={`${styles.card} ${styles.generating}`} role="status" aria-live="polite" aria-busy="true">
            <span className={styles.spinner} aria-hidden="true" />
            <h2>Tworzymy gotową umowę</h2>
            <p className={styles.muted}>Przygotowujemy dokument do podglądu.</p>
          </section>
        ) : null}

        {step === 'preview' && generated ? (
          <section className={`${styles.card} ${styles.previewCard}`}>
            {generated.reviewer?.status === 'findings' ? (
              <aside className={styles.reviewNotice} aria-label="Wynik automatycznej kontroli">
                <p>Umowa została wygenerowana, ale automatyczna kontrola wykryła elementy, które warto sprawdzić przed zapisaniem.</p>
                <ul>
                  {[...new Set(generated.reviewer.findingCategories)].map((category) => (
                    <li key={category}>{reviewerCategoryMessage[category]}</li>
                  ))}
                </ul>
              </aside>
            ) : null}
            {generated.reviewer?.status === 'unavailable' ? (
              <aside className={styles.reviewNotice} aria-label="Wynik automatycznej kontroli">
                Automatyczna kontrola dokumentu nie była dostępna. Sprawdź umowę przed zapisaniem.
              </aside>
            ) : null}
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
                  disabled={generatePending}
                  onClick={() => void discardGeneration(true)}
                >
                  Odrzuć i wygeneruj ponownie
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
              setStep('resolve')
            }}
            qualitySummary={qualitySummary}
            weddingId={wedding.id}
          />
        ) : null}

        {error && (step === 'preview' || step === 'saved' || (step === 'resolve' && packageResolution?.status !== 'ok')) ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </PageContainer>
      <ContractGenerationMissingInputForm
        key={missingInputs.map((item) => item.id).join('|')}
        open={Boolean(missingInputs.length) && step === 'waiting_for_user_input'}
        busy={generatePending}
        requirements={missingInputs}
        onSubmit={(answers) => void continueGeneration(answers)}
        onCancel={() => navigate(`/sluby/${wedding.id}`)}
      />
    </AppLayout>
  )
}

const reviewerCategoryMessage: Record<import('@/features/contract-generation-spike/generationProtocol').ReviewerFindingCategory, string> = {
  source_mismatch: 'Porównaj dokument z umową źródłową.',
  omitted_required_content: 'Sprawdź, czy wymagane zapisy są obecne.',
  unsupported_addition: 'Sprawdź dodatkowe treści w dokumencie.',
  authoritative_fact_mismatch: 'Sprawdź dane umowy względem danych ślubu.',
  product_rule_violation: 'Sprawdź zgodność umowy z zasadami produktu.',
  structural_issue: 'Sprawdź układ i kompletność dokumentu.',
  other_material_issue: 'Sprawdź wskazane elementy przed zapisaniem.',
}
