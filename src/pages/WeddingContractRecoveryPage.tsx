import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { useWedding } from '@/features/weddings/hooks/useWedding'
import { ContractRecoveryError } from '@/features/wedding-contract-recovery/errors'
import {
  applyWeddingContractRecoveryProposal,
  runRecoveryAnalysis,
  uploadAndStartRecovery,
} from '@/features/wedding-contract-recovery/recoveryService'
import { weddingContractRecoveryRepository } from '@/features/wedding-contract-recovery/repository'
import { applyDecisionsToProposal } from '@/features/wedding-contract-recovery/buildComparisonProposal'
import { groupSectionEvidence } from '@/features/wedding-contract-recovery/groupSectionEvidence'
import { validateSourceContractFile } from '@/features/wedding-contract-recovery/validateSourceFile'
import {
  RecoveryFieldComparisonRow,
  RecoverySectionSummaryGrid,
  SharedEvidenceBlocks,
} from '@/features/wedding-contract-recovery/components/RecoveryFieldComparisonRow'
import { PackageSnapshotCard } from '@/features/wedding-contract-recovery/components/PackageSnapshotCard'
import { RecoveryConfirmationPanel } from '@/features/wedding-contract-recovery/components/RecoveryConfirmationPanel'
import { RecoveryProgressPanel } from '@/features/wedding-contract-recovery/components/RecoveryProgressPanel'
import { RecoveryUploadPanel } from '@/features/wedding-contract-recovery/components/RecoveryUploadPanel'
import {
  WeddingContractRecoveryStepper,
  type RecoveryWizardStep,
} from '@/features/wedding-contract-recovery/components/WeddingContractRecoveryStepper'
import type {
  RecoveryDecisionAction,
  RecoveryFieldComparison,
  RecoveryProposal,
  RecoverySectionSummary,
  WeddingContractRecovery,
  WeddingSourceContract,
} from '@/features/wedding-contract-recovery/types'
import styles from './WeddingContractRecoveryPage.module.css'

function scrollToRecoveryTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export function WeddingContractRecoveryPage() {
  const [searchParams] = useSearchParams()
  const recoveryIdFromUrl = searchParams.get('recoveryId')
  const { weddingId = '' } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: wedding, isLoading } = useWedding(weddingId)

  const [step, setStep] = useState<RecoveryWizardStep>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [progressIndex, setProgressIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [recoveryId, setRecoveryId] = useState<string | null>(null)
  const [sourceContractId, setSourceContractId] = useState<string | null>(null)
  const [sourceContract, setSourceContract] = useState<WeddingSourceContract | null>(null)
  const [proposal, setProposal] = useState<RecoveryProposal | null>(null)
  const [fields, setFields] = useState<RecoveryFieldComparison[]>([])
  const [sections, setSections] = useState<RecoverySectionSummary[]>([])
  const [includePackageSnapshot, setIncludePackageSnapshot] = useState(true)
  const [applying, setApplying] = useState(false)
  const [appliedChanges, setAppliedChanges] = useState<string[]>([])

  const queryClient = useQueryClient()

  useEffect(() => {
    if (!recoveryIdFromUrl) return
    setRecoveryId(recoveryIdFromUrl)
    void weddingContractRecoveryRepository.getRecovery(recoveryIdFromUrl).then(async (row) => {
      if (!row?.comparisonProposal) return
      setSourceContractId(row.sourceContractId)
      setProposal(row.comparisonProposal)
      setFields(row.comparisonProposal.fields)
      setSections(row.comparisonProposal.sections)
      setIncludePackageSnapshot(Boolean(row.comparisonProposal.packageSnapshotProposal))
      const source = await weddingContractRecoveryRepository.getSourceContract(
        row.sourceContractId,
      )
      setSourceContract(source)
      setStep(row.status === 'applied' ? 'done' : 'review')
    })
  }, [recoveryIdFromUrl])

  const { data: recovery } = useQuery({
    queryKey: ['wedding-contract-recovery', recoveryId],
    queryFn: () =>
      recoveryId
        ? weddingContractRecoveryRepository.getRecovery(recoveryId)
        : Promise.resolve(null),
    enabled: Boolean(recoveryId),
  })

  const groupedFields = useMemo(() => {
    const groups = new Map<string, RecoveryFieldComparison[]>()
    for (const field of fields) {
      const list = groups.get(field.sectionKey) ?? []
      list.push(field)
      groups.set(field.sectionKey, list)
    }
    return groups
  }, [fields])

  async function startAnalysis() {
    if (!file || !weddingId) return
    const validation = validateSourceContractFile(file)
    if (!validation.ok) {
      setError('Obsługiwane są tylko pliki PDF i DOCX do 15 MB.')
      return
    }

    setStep('processing')
    setError(null)
    setConfirmError(null)
    setProgressIndex(0)
    setRecoveryId(null)
    setSourceContractId(null)
    setSourceContract(null)
    setProposal(null)

    try {
      setProgressIndex(1)
      const { sourceContract: uploaded, recovery: created } = await uploadAndStartRecovery(
        weddingId,
        file,
      )
      setRecoveryId(created.id)
      setSourceContractId(uploaded.id)
      setSourceContract(uploaded)
      setProgressIndex(2)
      const result = await runRecoveryAnalysis(created.id)
      setProgressIndex(3)
      await applyAnalysisResult(result)
    } catch (err) {
      handleAnalysisError(err)
    }
  }

  async function retryAnalysis() {
    if (!recoveryId) return

    setStep('processing')
    setError(null)
    setConfirmError(null)
    setProgressIndex(2)

    try {
      const result = await runRecoveryAnalysis(recoveryId)
      setProgressIndex(3)
      await applyAnalysisResult(result)
    } catch (err) {
      handleAnalysisError(err)
    }
  }

  async function applyAnalysisResult(result: WeddingContractRecovery) {
    setRecoveryId(result.id)
    setSourceContractId(result.sourceContractId)
    const nextProposal = result.comparisonProposal
    if (!nextProposal) throw new Error('Brak propozycji porównania.')
    setProposal(nextProposal)
    setFields(nextProposal.fields)
    setSections(nextProposal.sections)
    setIncludePackageSnapshot(Boolean(nextProposal.packageSnapshotProposal))
    if (!sourceContract) {
      const source = await weddingContractRecoveryRepository.getSourceContract(
        result.sourceContractId,
      )
      setSourceContract(source)
    }
    await queryClient.invalidateQueries({
      queryKey: ['wedding-contract-recovery', result.id],
    })
    setStep('summary')
    scrollToRecoveryTop()
  }

  function handleAnalysisError(err: unknown) {
    const message =
      err instanceof ContractRecoveryError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Analiza nie powiodła się.'
    setError(message)
    showToast(message, 'error')
  }

  function updateFieldAction(fieldKey: string, action: RecoveryDecisionAction) {
    setFields((prev) =>
      prev.map((field) =>
        field.fieldKey === fieldKey ? { ...field, selectedAction: action } : field,
      ),
    )
  }

  function goToConfirm() {
    setConfirmError(null)

    const baseProposal =
      proposal ??
      (recovery?.comparisonProposal
        ? { ...recovery.comparisonProposal, fields }
        : null)

    if (!baseProposal || fields.length === 0) {
      const message =
        'Nie udało się przygotować podsumowania. Wróć do analizy lub wgraj umowę ponownie.'
      setConfirmError(message)
      showToast(message, 'error')
      return
    }

    const nextProposal = applyDecisionsToProposal(
      { ...baseProposal, fields, sections },
      fields.map((f) => ({ fieldKey: f.fieldKey, action: f.selectedAction })),
      includePackageSnapshot,
    )
    setProposal(nextProposal)
    setStep('confirm')
    scrollToRecoveryTop()
  }

  async function applyApproved() {
    if (applying) return
    if (!recoveryId || !sourceContractId || !weddingId) {
      const message = 'Brakuje danych sesji analizy. Spróbuj ponownie.'
      setConfirmError(message)
      showToast(message, 'error')
      return
    }

    const expectedUpdatedAt =
      recovery?.weddingUpdatedAtSnapshot ??
      (await weddingContractRecoveryRepository.getWeddingUpdatedAt(weddingId)) ??
      ''

    setApplying(true)
    setConfirmError(null)
    try {
      const result = await applyWeddingContractRecoveryProposal({
        recoveryId,
        weddingId,
        sourceContractId,
        decisions: fields.map((f) => ({
          fieldKey: f.fieldKey,
          action: f.selectedAction,
        })),
        includePackageSnapshot,
        expectedWeddingUpdatedAt: expectedUpdatedAt,
      })
      const labels = fields
        .filter((f) => result.appliedFieldKeys.includes(f.fieldKey))
        .map((f) => f.label)
      setAppliedChanges(labels)
      setStep('done')
      scrollToRecoveryTop()
      showToast('Dane z umowy zostały zapisane', 'success')
      await queryClient.invalidateQueries({ queryKey: ['wedding', weddingId] })
      await queryClient.invalidateQueries({
        queryKey: ['wedding-source-contracts', weddingId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['wedding-contract-package-snapshots', weddingId],
      })
    } catch (err) {
      const message =
        err instanceof ContractRecoveryError
          ? err.message
          : 'Nie udało się zapisać danych.'
      setConfirmError(message)
      showToast(message, 'error')
    } finally {
      setApplying(false)
    }
  }

  if (isLoading || !wedding) {
    return (
      <AppLayout>
        <PageContainer width="wide">Ładowanie…</PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              <Link to={`/sluby/${weddingId}`}>Wróć do zlecenia</Link>
            </p>
            <h1 className={styles.title}>Uzupełnij dane z umowy</h1>
            <p className={styles.description}>
              Wgraj istniejącą umowę PDF lub DOCX. OurWed odczyta dane i pokaże je do
              sprawdzenia przed zapisaniem.
            </p>
          </div>
        </div>

        <WeddingContractRecoveryStepper current={step} />

        {step === 'upload' ? (
          <section className={styles.panel}>
            <RecoveryUploadPanel selectedFile={file} onFile={setFile} />
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => navigate(`/sluby/${weddingId}`)}>
                Anuluj
              </Button>
              <Button disabled={!file} onClick={() => void startAnalysis()}>
                Rozpocznij analizę
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'processing' ? (
          <section className={styles.panel}>
            <RecoveryProgressPanel activeIndex={progressIndex} error={error} />
            {error && recoveryId ? (
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => navigate(`/sluby/${weddingId}`)}>
                  Wróć do zlecenia
                </Button>
                <Button onClick={() => void retryAnalysis()}>Spróbuj ponownie</Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 'summary' ? (
          <section className={styles.panel}>
            <RecoverySectionSummaryGrid sections={sections} />
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setStep('upload')}>
                Wgraj inny plik
              </Button>
              <Button
                onClick={() => {
                  setStep('review')
                  scrollToRecoveryTop()
                }}
              >
                Przejdź do porównania
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'review' ? (
          <section className={styles.panel}>
            {Array.from(groupedFields.entries()).map(([sectionKey, sectionFields]) => {
              const { fieldRefs, sharedSources } = groupSectionEvidence(sectionFields)
              return (
                <div key={sectionKey} className={styles.section}>
                  <h2 className={styles.sectionTitle}>
                    {sections.find((s) => s.sectionKey === sectionKey)?.label ?? sectionKey}
                  </h2>
                  <div className={styles.fieldList}>
                    {sectionFields.map((field) => (
                      <RecoveryFieldComparisonRow
                        key={field.fieldKey}
                        field={field}
                        evidenceRef={fieldRefs.get(field.fieldKey)}
                        sharedSources={sharedSources}
                        onActionChange={(action) => updateFieldAction(field.fieldKey, action)}
                      />
                    ))}
                  </div>
                  <SharedEvidenceBlocks sources={sharedSources} />
                </div>
              )
            })}

            {proposal?.packageSnapshotProposal ? (
              <PackageSnapshotCard
                model={{
                  name: proposal.packageSnapshotProposal.name,
                  originalDescription: proposal.packageSnapshotProposal.originalDescription,
                  includedItems: proposal.packageSnapshotProposal.includedItems,
                  coverageHours: proposal.packageSnapshotProposal.coverageHours,
                  coverageTimeRange: proposal.packageSnapshotProposal.coverageTimeRange,
                  deliveryDeadlineText: proposal.packageSnapshotProposal.deliveryDeadlineText,
                  sourceFileName: sourceContract?.originalFileName ?? null,
                  includeToggle: {
                    checked: includePackageSnapshot,
                    onChange: setIncludePackageSnapshot,
                  },
                }}
              />
            ) : null}

            {confirmError ? <p className={styles.error}>{confirmError}</p> : null}

            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setStep('summary')}>
                Wróć do podsumowania
              </Button>
              <Button onClick={goToConfirm}>Przejdź do potwierdzenia</Button>
            </div>
          </section>
        ) : null}

        {step === 'confirm' && proposal ? (
          <RecoveryConfirmationPanel
            proposal={proposal}
            fields={fields}
            sourceFileName={sourceContract?.originalFileName ?? null}
            sourceMimeType={sourceContract?.mimeType ?? null}
            sourceCreatedAt={sourceContract?.createdAt ?? null}
            includePackageSnapshot={includePackageSnapshot}
            error={confirmError}
            applying={applying}
            onBack={() => {
              setStep('review')
              scrollToRecoveryTop()
            }}
            onApply={() => void applyApproved()}
          />
        ) : null}

        {step === 'done' ? (
          <section className={styles.panel}>
            <h2>Dane z umowy zostały zapisane</h2>
            {appliedChanges.length > 0 ? (
              <ul>
                {appliedChanges.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : (
              <p>Nie zapisano nowych pól. Pakiet z umowy mógł zostać dodany osobno.</p>
            )}
            <div className={styles.actions}>
              <Button onClick={() => navigate(`/sluby/${weddingId}`)}>
                Wróć do zlecenia
              </Button>
            </div>
          </section>
        ) : null}
      </PageContainer>
    </AppLayout>
  )
}
