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
  recoverContractGeneration,
  startContractGeneration,
  type MissingInput,
} from '@/features/contract-generation-spike/contractGenerationBoundaryClient'
import {
  clearGenerationConnection,
  readGenerationConnection,
  writeGenerationConnection,
  type GenerationConnection,
} from '@/features/contract-generation-spike/generationConnection'
import { ContractGenerationMissingInputForm } from '@/features/contract-generation-spike/ContractGenerationMissingInputForm'

type WizardStep =
  | 'resolve'
  | 'generating'
  | 'recovering'
  | 'waiting_for_user_input'
  | 'preview'
  | 'saved'
  | 'conflict'
  | 'stale'
  | 'precondition'
  | 'failed'

type PageGeneratedContract = Omit<Pick<TransformContractResult,
  'draftId' | 'templateId' | 'templateVersionId' | 'title' | 'resolved' | 'omittedKeys' |
  'paragraphs' | 'docxBytes' | 'usedMock' | 'qualityRetries' | 'executionSnapshot' | 'finalArtifact'>, 'draftId'> & {
    draftId?: string
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
  const [boundaryErrorKind, setBoundaryErrorKind] = useState<'safety' | 'temporary' | 'auth' | null>(null)
  const [generatePending, setGeneratePending] = useState(false)
  const [recoveryPending, setRecoveryPending] = useState(false)
  const generateInFlightRef = useRef(false)
  const recoveryAttemptedRef = useRef<string | null>(null)

  const canGenerate = packageResolution?.status === 'ok' && !generatePending && !recoveryPending

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
    if (typeof window !== 'undefined' && weddingId) clearGenerationConnection(window.localStorage, weddingId)
  }

  function setSafeClientError(error: unknown) {
    if (error instanceof ContractGenerationBoundaryClientError) {
      if (error.code === 'unauthorized') {
        setError('Twoja sesja logowania wygasła. Zaloguj się ponownie i wróć do umowy.')
        setBoundaryErrorKind('auth')
      } else if (error.code === 'forbidden') {
        setError('Nie masz dostępu do tego ślubu.')
        setBoundaryErrorKind('auth')
      } else if (error.code === 'generation_safety') {
        setError('Nie udało się bezpiecznie zaakceptować umowy. Dokument nie został utworzony.')
        setBoundaryErrorKind('safety')
      } else {
        setError('Wystąpił chwilowy problem. Możesz rozpocząć nowe podejście.')
        setBoundaryErrorKind('temporary')
      }
      return
    }
    setError(getUserFacingErrorMessage(error, 'Wystąpił chwilowy problem. Możesz rozpocząć nowe podejście.'))
    setBoundaryErrorKind('temporary')
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
    }
    setGenerated(prepared)
    setDocxBytes(bytes)
    setParagraphs(extracted.map(({ index, text }) => ({ index, text })))
    setMissingInputs([])
    setBoundaryErrorKind(null)
    setError(null)
    setStep('preview')
  }

  async function applyBoundaryResult(
    result: import('@/features/contract-generation-spike/serverBoundary').ContractGenerationBoundaryResponse,
    connection: GenerationConnection,
  ) {
    if (result.status === 'awaiting_input' || result.status === 'processing' || result.status === 'ready'
      || result.status === 'unresolved_conflict') {
      writeGenerationConnection(window.localStorage, weddingId, {
        ...connection,
        sessionId: result.sessionId,
      })
    }
    if (result.status === 'awaiting_input') {
      setMissingInputs(result.missingInputs)
      setError(null)
      setBoundaryErrorKind(null)
      setStep('waiting_for_user_input')
      return
    }
    if (result.status === 'processing') {
      setError(null)
      setStep('recovering')
      return
    }
    if (result.status === 'ready') {
      setStep('generating')
      await showAcceptedCandidate(result)
      return
    }
    if (result.status === 'unresolved_conflict') {
      clearConnection()
      setError(result.message)
      setStep('conflict')
      return
    }
    clearConnection()
    if (result.status === 'precondition') {
      setError('Umowa nie jest jeszcze gotowa do utworzenia. Sprawdź ustawienia umowy przed ponowną próbą.')
      setStep('precondition')
      return
    }
    if (result.status === 'stale') {
      setError(result.code === 'authority_changed'
        ? 'Dane ślubu zmieniły się podczas przygotowania umowy. Rozpocznij generowanie ponownie.'
        : 'Poprzedniej sesji generowania nie można już kontynuować.')
      setStep('stale')
      return
    }
    if (result.status === 'error') {
      setError(result.code === 'unauthorized'
        ? 'Twoja sesja logowania wygasła. Zaloguj się ponownie i wróć do umowy.'
        : 'Nie masz dostępu do tego ślubu.')
      setBoundaryErrorKind('auth')
      setStep('failed')
      return
    }
    setError(result.code === 'generation_safety'
      ? 'Nie udało się bezpiecznie zaakceptować umowy. Dokument nie został utworzony.'
      : 'Wystąpił chwilowy problem. Możesz rozpocząć nowe podejście.')
    setBoundaryErrorKind(result.code === 'generation_safety' ? 'safety' : 'temporary')
    setStep('failed')
  }

  async function recoverConnection(connection?: GenerationConnection) {
    const current = connection ?? (weddingId ? readGenerationConnection(window.localStorage, weddingId) : null)
    if (!current || !weddingId || recoveryPending || generateInFlightRef.current) return
    setRecoveryPending(true)
    setError(null)
    setStep('recovering')
    try {
      const result = await recoverContractGeneration({
        weddingId,
        ...(current.sessionId ? { sessionId: current.sessionId } : { requestId: current.requestId }),
      })
      await applyBoundaryResult(result, current)
    } catch (err) {
      setSafeClientError(err)
      setStep('failed')
    } finally {
      setRecoveryPending(false)
    }
  }

  useEffect(() => {
    if (!wedding || weddingLoading || !weddingId || recoveryAttemptedRef.current === weddingId) return
    const connection = readGenerationConnection(window.localStorage, weddingId)
    if (!connection) return
    const recoveryTimer = window.setTimeout(() => {
      if (recoveryAttemptedRef.current === weddingId) return
      recoveryAttemptedRef.current = weddingId
      void recoverConnection(connection)
    }, 0)
    return () => window.clearTimeout(recoveryTimer)
    // recoverConnection uses current page state and this effect runs once per wedding route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wedding, weddingId, weddingLoading])

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
    writeGenerationConnection(window.localStorage, wedding.id, connection)
    generateInFlightRef.current = true
    setGeneratePending(true)
    setGenerated(null)
    setDocxBytes(null)
    setParagraphs([])
    setDownloadUrl(null)
    setMissingInputs([])
    setBoundaryErrorKind(null)
    setError(null)
    setStep('generating')
    try {
      const result = await startContractGeneration({ weddingId: wedding.id, requestId: connection.requestId })
      await applyBoundaryResult(result, connection)
    } catch (err) {
      clearConnection()
      setSafeClientError(err)
      setStep('failed')
    } finally {
      generateInFlightRef.current = false
      setGeneratePending(false)
    }
  }

  async function continueGeneration(answers: import('@/features/contract-generation-spike/generationProtocol').ContractGenerationAnswer[]) {
    if (generateInFlightRef.current || !weddingId) return
    const connection = readGenerationConnection(window.localStorage, weddingId)
    if (!connection?.sessionId) {
      clearConnection()
      setError('Poprzedniej sesji generowania nie można już kontynuować.')
      setStep('stale')
      return
    }
    generateInFlightRef.current = true
    setGeneratePending(true)
    setError(null)
    setStep('generating')
    try {
      const result = await continueContractGeneration({ sessionId: connection.sessionId, answers })
      await applyBoundaryResult(result, connection)
    } catch (err) {
      setSafeClientError(err)
      setStep('failed')
    } finally {
      generateInFlightRef.current = false
      setGeneratePending(false)
    }
  }

  async function save(): Promise<boolean> {
    if (!generated || !docxBytes || !wedding) return false
    setError(null)
    try {
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

  const visibleStep = step === 'saved' ? 'preview'
    : step === 'recovering' ? 'generating'
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

        {step === 'failed' || step === 'conflict' || step === 'stale' || step === 'precondition' ? (
          <section className={styles.card} role={step === 'failed' ? 'alert' : 'region'} aria-labelledby="generation-state-title">
            <div>
              <p className={styles.eyebrow}>
                {step === 'conflict' ? 'Wymaga korekty' : step === 'precondition' ? 'Ustawienia umowy' : step === 'stale' ? 'Sesja wygasła' : 'Nie udało się'}
              </p>
              <h2 id="generation-state-title">
                {step === 'conflict'
                  ? 'Nie można bezpiecznie przygotować tej umowy'
                  : step === 'precondition'
                    ? 'Umowa nie jest gotowa do utworzenia'
                    : step === 'stale'
                      ? 'Rozpocznij nową sesję'
                      : 'Nie udało się wygenerować umowy'}
              </h2>
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.actions}>
              {step === 'stale' || (step === 'failed' && boundaryErrorKind === 'temporary') ? (
                <Button type="button" variant="primary" disabled={generatePending} onClick={() => void generate()}>
                  {step === 'stale' ? 'Rozpocznij ponownie' : 'Spróbuj ponownie'}
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

        {step === 'recovering' ? (
          <section className={`${styles.card} ${styles.generating}`} aria-live="polite">
            {recoveryPending ? <span className={styles.spinner} aria-hidden="true" /> : null}
            <h2>{recoveryPending ? 'Sprawdzamy sesję umowy' : 'Generowanie trwa'}</h2>
            <p className={styles.muted}>
              {recoveryPending ? 'Pobieramy aktualny stan z bezpiecznej sesji.' : 'Możesz sprawdzić stan ponownie.'}
            </p>
            {!recoveryPending ? (
              <Button type="button" variant="secondary" onClick={() => void recoverConnection()}>
                Sprawdź stan
              </Button>
            ) : null}
          </section>
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
