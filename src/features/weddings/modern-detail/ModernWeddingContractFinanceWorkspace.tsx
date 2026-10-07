import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight,
  CircleCheck,
  Download,
  Eye,
  FileText,
  History,
  Paperclip,
  RefreshCw,
  Send,
  Upload,
  Undo2,
} from 'lucide-react'
import { IconCheck } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { useContractPdfDownload } from '@/features/documents/contract-experience'
import {
  GeneratedWeddingContractService,
  type GeneratedWeddingContract,
} from '@/features/documents/template'
import {
  CONTRACT_FRESHNESS_COPY,
  getLatestContractArtifactSnapshot,
  isGeneratedContractContentStale,
} from '@/features/documents/template/contractDocumentFreshness'
import { resolveContractVariables } from '@/features/documents/template/resolveContractVariables'
import { resolvePackageContractForWedding } from '@/features/documents/template/packageContractAssignment'
import { weddingContractRecoveryRepository } from '@/features/wedding-contract-recovery/repository'
import {
  reanalyzeSourceContract,
  runRecoveryAnalysis,
  uploadAndStartRecovery,
} from '@/features/wedding-contract-recovery/recoveryService'
import { storeSourceContractOnly } from '@/features/wedding-contract-recovery/storeSourceContractOnly'
import { validateSourceContractFile } from '@/features/wedding-contract-recovery/validateSourceFile'
import type { WeddingSourceContract } from '@/features/wedding-contract-recovery/types'
import { documentStorage } from '@/lib/api/documents/storage'
import { TravelFeeResolveModal } from '@/features/weddings/detail/travel-fee/TravelFeeResolveModal'
import { WeddingContractQuestionnaireAnswers } from '@/features/weddings/detail/v2/WeddingContractQuestionnaireAnswers'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import { contractService } from '@/lib/api/contractService'
import { paymentService } from '@/lib/api/paymentService'
import { timelineEventService } from '@/lib/api/timelineEventService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import { hasPaidDepositPayment } from '@/lib/finance/hasPaidDepositPayment'
import { formatCurrency } from '@/lib/utils/currency'
import type { WeddingHeroAction } from '@/features/weddings/detail/weddingHeroActions'
import type { WeddingExtraService } from '@/types/package'
import type { Payment, Wedding } from '@/types/wedding'
import {
  composeContractDocumentMeta,
  composeModernAgreementTerms,
  composeModernContractHeadline,
  composeModernSettlementView,
  paymentDisplayLabel,
  paymentPaidLine,
  questionnaireSummary,
  sortGeneratedContractsNewestFirst,
} from './modernWeddingContractFinanceModel'
import styles from './ModernWeddingContractFinanceWorkspace.module.css'

interface Props {
  wedding: Wedding
  payments: Payment[]
  extras: WeddingExtraService[]
  onAction: (action: WeddingHeroAction) => void
  forcePackageOpen?: boolean
  onEditPackage?: () => void
  onEditFinances?: () => void
  onEditPayment?: (payment: Payment) => void
  onContractStatusChanged?: () => void
  onWeddingUpdated?: (wedding: Wedding) => void
}

function deletePaymentCopy(payment: Payment): { title: string; body: string } {
  if (payment.type === 'deposit') {
    return {
      title: 'Usunąć zadatek?',
      body: 'Ta operacja usunie wpis zadatku i ponownie przeliczy kwotę wpłaconą oraz pozostałą do zapłaty. Ustalona kwota zadatku w umowie pozostanie bez zmian.',
    }
  }
  return {
    title: 'Usunąć wpłatę?',
    body: 'Ta operacja usunie wpis płatności i ponownie przeliczy kwotę wpłaconą oraz pozostałą do zapłaty.',
  }
}

function HistoricalContractVersion({
  contract,
  weddingId,
  current,
}: {
  contract: GeneratedWeddingContract
  weddingId: string
  current: boolean
}) {
  const { showToast } = useToast()
  const [docxBusy, setDocxBusy] = useState(false)
  const meta = composeContractDocumentMeta(contract)
  const docx = [...contract.artifacts]
    .filter((item) => item.format === 'docx')
    .sort((a, b) => b.generationVersion - a.generationVersion)[0] ?? null
  const pdf = useContractPdfDownload({
    docxBytes: null,
    fileName: `${contract.draft.title || 'umowa'}.docx`,
    weddingId,
    documentId: contract.draft.id,
    loadDocxBytes: docx?.filePath
      ? () => documentStorage.download(docx.filePath)
      : undefined,
  })

  async function downloadDocx() {
    if (!docx) return
    setDocxBusy(true)
    try {
      const url = docx.filePath
        ? await documentStorage.signedUrl(docx.filePath, 3600)
        : await GeneratedWeddingContractService.getArtifactDownloadUrl(
            weddingId,
            contract.draft.id,
            'docx',
          )
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się pobrać umowy.'),
        'error',
      )
    } finally {
      setDocxBusy(false)
    }
  }

  return (
    <li className={styles.historyItem} data-testid="wedding-contract-version">
      <div className={styles.historyVersionText}>
        <strong>{meta.versionLabel}</strong>
        {current ? <span className={styles.currentVersion}>Aktualna</span> : null}
        <span>{meta.generatedAtLabel}</span>
      </div>
      <div className={styles.historyActions}>
        <Link
          className={styles.quietLink}
          to={`/sluby/${weddingId}/umowy/${contract.draft.id}`}
        >
          Podgląd
        </Link>
        {docx ? (
          <>
            <button
              type="button"
              className={styles.quietLink}
              disabled={docxBusy}
              onClick={() => void downloadDocx()}
            >
              Pobierz DOCX
            </button>
            <button
              type="button"
              className={styles.quietLink}
              disabled={pdf.busy}
              onClick={() => void pdf.downloadPdf()}
            >
              {pdf.busy ? 'Przygotowywanie PDF…' : 'Pobierz PDF'}
            </button>
          </>
        ) : null}
        {pdf.error ? <span className={styles.error} role="alert">{pdf.error}</span> : null}
      </div>
    </li>
  )
}

type UtilityPanel = 'history' | 'answers' | 'source' | 'upload-choice' | null

function sourceDocumentCountLabel(count: number): string {
  if (count === 0) return 'Brak dokumentów'
  if (count === 1) return '1 dokument'
  const lastTwo = count % 100
  const last = count % 10
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
    ? `${count} dokumenty`
    : `${count} dokumentów`
}

/**
 * Modern commercial-agreement record for Umowa i finanse.
 * Domain math, generation, travel, and payments stay on existing services.
 */
export function ModernWeddingContractFinanceWorkspace({
  wedding,
  payments,
  extras,
  onAction,
  forcePackageOpen = false,
  onEditPackage,
  onEditFinances,
  onEditPayment,
  onContractStatusChanged,
  onWeddingUpdated,
}: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateWedding()
  const { showToast } = useToast()
  const { requirePro } = useProAccessGate()
  const [contentsOpen, setContentsOpen] = useState(forcePackageOpen)
  const [utility, setUtility] = useState<UtilityPanel>(null)
  const [selectedUpload, setSelectedUpload] = useState<File | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [analysisRetryId, setAnalysisRetryId] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [travelFeeOpen, setTravelFeeOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const [confirmSign, setConfirmSign] = useState(false)
  const [confirmUnsign, setConfirmUnsign] = useState(false)
  const [signBusy, setSignBusy] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const contractsQuery = useQuery({
    queryKey: ['generated-wedding-contracts', wedding.id],
    queryFn: () => GeneratedWeddingContractService.listForWedding(wedding.id),
  })
  const packageQuery = useQuery({
    queryKey: [
      'package-contract-for-wedding',
      wedding.id,
      wedding.packageId ?? null,
    ],
    queryFn: () =>
      resolvePackageContractForWedding({
        packageId: wedding.packageId,
        packageName: wedding.packageName,
      }),
    staleTime: 30_000,
  })
  const sourceQuery = useQuery({
    queryKey: ['wedding-source-contracts', wedding.id],
    queryFn: () =>
      weddingContractRecoveryRepository.listSourceContractsByWedding(
        wedding.id,
      ),
  })

  const sorted = useMemo(
    () => sortGeneratedContractsNewestFirst(contractsQuery.data ?? []),
    [contractsQuery.data],
  )
  const latest = sorted[0] ?? null
  const hasGenerated = (contractsQuery.data ?? []).length > 0
  const hasTemplate =
    packageQuery.isPending && !packageQuery.data
      ? null
      : packageQuery.data?.status === 'ok'

  const latestSnapshot = useMemo(
    () => getLatestContractArtifactSnapshot(latest),
    [latest],
  )
  const freshnessQuery = useQuery({
    queryKey: [
      'contract-document-freshness',
      wedding.id,
      latest?.draft.id ?? null,
      latest?.generationVersion ?? null,
      // Re-check when contract-relevant wedding fields change.
      wedding.price,
      wedding.depositAmount,
      wedding.packageId,
      wedding.packageName,
      wedding.date,
      wedding.couple.partner1,
      wedding.couple.partner2,
      wedding.couple.email,
      wedding.couple.phone,
      wedding.couple.partner1Email,
      wedding.couple.partner2Email,
      wedding.couple.partner1Phone,
      wedding.couple.partner2Phone,
      wedding.contractAddress,
      wedding.ceremonyLocation,
      wedding.receptionLocation,
      wedding.preparationLocation,
      wedding.bridePreparationLocation,
      wedding.groomPreparationLocation,
      wedding.travelFeeStatus,
      wedding.travelFeeAmount,
      wedding.finalPaymentDueDate,
      wedding.finalPaymentTerms,
      wedding.coverageHours,
      wedding.overtimeRate,
      wedding.deliveryMonths,
      wedding.deliveryDays,
      extras.map((e) => `${e.id}:${e.priceSnapshot}:${e.quantity}`).join('|'),
    ],
    enabled: Boolean(latest && latestSnapshot && hasGenerated),
    staleTime: 15_000,
    queryFn: async () => {
      const stored = latestSnapshot?.provenance.replacement.resolvedValues
      if (!stored) return { stale: false as const }
      const overrides =
        latestSnapshot?.sourceDataSnapshot.manualOverrides ?? {}
      const current = await resolveContractVariables({
        wedding,
        overrides,
      })
      return {
        stale: isGeneratedContractContentStale({
          storedResolvedValues: stored,
          currentResolvedValues: current.resolved,
        }),
      }
    },
  })
  const isContractStale = freshnessQuery.data?.stale === true

  const headline = composeModernContractHeadline({
    weddingStatus: wedding.status,
    contractStatus: wedding.contract?.status ?? 'none',
    signedAt: wedding.contract?.signedAt,
    hasTemplate,
    hasGenerated,
  })
  const settlement = composeModernSettlementView(wedding)
  const terms = composeModernAgreementTerms(wedding, extras)
  const answers = questionnaireSummary(wedding)
  const sourceContracts = sourceQuery.data ?? []
  const canRegenerate =
    hasTemplate === true && Boolean(latest) && headline.kind !== 'archived'
  const canMarkSent =
    wedding.contract?.status === 'generated' && hasGenerated
  const canSign = wedding.contract?.status === 'sent' && hasGenerated
  const isSigned = wedding.contract?.status === 'signed'
  const addDeposit = !hasPaidDepositPayment(payments)
  const deleteCopy = pendingDelete ? deletePaymentCopy(pendingDelete) : null
  const latestMeta = latest ? composeContractDocumentMeta(latest) : null
  const latestFormats = latest
    ? [...new Set(latest.artifacts.map((item) => item.format))]
    : []
  const latestDocx = latest
    ? [...latest.artifacts]
        .filter((item) => item.format === 'docx')
        .sort((a, b) => b.generationVersion - a.generationVersion)[0] ?? null
    : null
  const latestContractId = latest?.draft.id
  const pdfDownload = useContractPdfDownload({
    docxBytes: null,
    fileName: `${latest?.draft.title || 'umowa'}.docx`,
    weddingId: wedding.id,
    documentId: latestContractId,
    loadDocxBytes:
      latestDocx && latestContractId
        ? () =>
            queryClient.fetchQuery({
              queryKey: [
                'generated-wedding-contract-docx-bytes',
                wedding.id,
                latestContractId,
                latestDocx.id,
              ],
              // Prefer known filePath — avoids reloading every draft/export for the wedding.
              queryFn: () => documentStorage.download(latestDocx.filePath),
            })
        : undefined,
  })

  function selectExternalDocument(file: File | undefined) {
    if (!file) return
    const validation = validateSourceContractFile(file)
    if (!validation.ok) {
      showToast(
        validation.code === 'CONTRACT_RECOVERY_FILE_TOO_LARGE'
          ? 'Plik jest zbyt duży. Maksymalny rozmiar to 15 MB.'
          : 'Obsługiwane są tylko pliki PDF i DOCX.',
        'error',
      )
      return
    }
    setSelectedUpload(file)
    setAnalysisRetryId(null)
    setAnalysisError(null)
    setUtility('upload-choice')
  }

  async function saveUploadOnly() {
    if (!selectedUpload || uploadBusy) return
    setUploadBusy(true)
    try {
      await storeSourceContractOnly(wedding.id, selectedUpload)
      setSelectedUpload(null)
      setUtility('source')
      await queryClient.invalidateQueries({
        queryKey: ['wedding-source-contracts', wedding.id],
      })
      showToast('Dokument został zapisany przy tym zleceniu.', 'success')
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się zapisać dokumentu.'),
        'error',
      )
    } finally {
      setUploadBusy(false)
    }
  }

  async function uploadAndAnalyze() {
    if (!selectedUpload || uploadBusy) return
    setUploadBusy(true)
    try {
      const { recovery } = await uploadAndStartRecovery(wedding.id, selectedUpload)
      setAnalysisRetryId(recovery.id)
      await finishRecoveryAnalysis(recovery.id)
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się przesłać dokumentu.'),
        'error',
      )
    } finally {
      setUploadBusy(false)
    }
  }

  async function finishRecoveryAnalysis(recoveryId: string) {
    setAnalysisError(null)
    try {
      const analyzed = await runRecoveryAnalysis(recoveryId)
      setSelectedUpload(null)
      setAnalysisRetryId(null)
      setUtility(null)
      navigate(
        `/sluby/${wedding.id}/uzupelnij-z-umowy?recoveryId=${analyzed.id}`,
      )
    } catch (err) {
      setAnalysisError(
        getUserFacingErrorMessage(err, 'Nie udało się odczytać danych z dokumentu.'),
      )
    }
  }

  async function retryRecoveryAnalysis() {
    if (!analysisRetryId || uploadBusy) return
    setUploadBusy(true)
    try {
      await finishRecoveryAnalysis(analysisRetryId)
    } finally {
      setUploadBusy(false)
    }
  }

  async function analyzeExistingDocument(contract: WeddingSourceContract) {
    setUploadBusy(true)
    try {
      const recovery = await reanalyzeSourceContract(contract.id)
      setUtility(null)
      navigate(
        `/sluby/${wedding.id}/uzupelnij-z-umowy?recoveryId=${recovery.id}`,
      )
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się ponowić analizy.'),
        'error',
      )
    } finally {
      setUploadBusy(false)
    }
  }

  async function downloadContract(contract: GeneratedWeddingContract) {
    const key = `${contract.draft.id}:docx`
    setDownloading(key)
    try {
      const docx = [...contract.artifacts]
        .filter((item) => item.format === 'docx')
        .sort((a, b) => b.generationVersion - a.generationVersion)[0]
      const url = docx?.filePath
        ? await documentStorage.signedUrl(docx.filePath, 3600)
        : await GeneratedWeddingContractService.getArtifactDownloadUrl(
            wedding.id,
            contract.draft.id,
            'docx',
          )
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się pobrać umowy.'),
        'error',
      )
    } finally {
      setDownloading(null)
    }
  }

  async function markSent() {
    setSignBusy(true)
    try {
      await contractService.updateStatus(wedding.id, 'sent')
      showToast('Umowa oznaczona jako wysłana.', 'success')
      setConfirmSent(false)
      onContractStatusChanged?.()
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się oznaczyć wysyłki.'),
        'error',
      )
    } finally {
      setSignBusy(false)
    }
  }

  async function markSigned() {
    setSignBusy(true)
    try {
      await contractService.updateStatus(wedding.id, 'signed')
      await timelineEventService.create({
        weddingId: wedding.id,
        type: 'contract_signed',
        title: 'Oznaczono umowę jako podpisaną',
        description:
          'Status podpisania zapisany ręcznie w OurWed (podpis poza systemem).',
        systemGenerated: true,
      })
      showToast('Umowa oznaczona jako podpisana.', 'success')
      setConfirmSign(false)
      onContractStatusChanged?.()
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się oznaczyć podpisu.'),
        'error',
      )
    } finally {
      setSignBusy(false)
    }
  }

  async function unmarkSigned() {
    setSignBusy(true)
    try {
      const next =
        wedding.contract?.generatedAt || wedding.contract?.status === 'signed'
          ? 'generated'
          : 'none'
      await contractService.updateStatus(
        wedding.id,
        next === 'none' ? 'none' : 'generated',
      )
      await timelineEventService.create({
        weddingId: wedding.id,
        type: 'contract_signed',
        title: 'Cofnięto oznaczenie podpisu umowy',
        description:
          'Zmiana dotyczy tylko statusu w OurWed — nie zmienia pliku umowy.',
        systemGenerated: true,
      })
      showToast('Cofnięto oznaczenie podpisu.', 'success')
      setConfirmUnsign(false)
      onContractStatusChanged?.()
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się cofnąć oznaczenia.'),
        'error',
      )
    } finally {
      setSignBusy(false)
    }
  }

  async function confirmDeletePayment() {
    if (!pendingDelete) return
    const payment = pendingDelete
    setDeleting(true)
    try {
      await paymentService.delete(payment.id)
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się usunąć wpłaty.'),
        'error',
      )
      setDeleting(false)
      return
    }
    setPendingDelete(null)
    setDeleting(false)
    showToast(
      payment.type === 'deposit'
        ? 'Zadatek został usunięty.'
        : 'Wpłata została usunięta.',
      'success',
    )
    try {
      await invalidate(wedding.id)
    } catch {
      // Non-fatal: ledger delete already committed.
    }
  }

  async function openSourceFile(filePath: string) {
    try {
      const url = await documentStorage.signedUrl(filePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się otworzyć pliku.'),
        'error',
      )
    }
  }

  return (
    <div
      className={styles.page}
      data-testid="modern-wedding-contract-finance"
    >
      <section
        className={`${styles.sheet} ${styles.contract} ${styles.workspace}`}
        aria-labelledby="modern-contract-title"
        data-testid="modern-contract-record"
        data-kind={headline.kind}
      >
        <div className={styles.contractColumn}>
        <div className={styles.sheetHead}>
          <p className={styles.eyebrow}>Umowa</p>
        </div>

        {contractsQuery.isLoading ? (
          <p className={styles.muted}>Ładowanie umów…</p>
        ) : null}
        {contractsQuery.isError ? (
          <p className={styles.error} role="alert">
            Nie udało się wczytać zapisanych umów.
          </p>
        ) : null}

        {latest && latestMeta ? (
          <div
            className={styles.document}
            data-testid="modern-contract-current"
          >
            <div className={styles.statusRow}>
              <p
                className={styles.statusPill}
                data-kind={headline.kind}
                data-testid="modern-contract-status"
              >
                {headline.kind === 'signed' ? (
                  <IconCheck
                    className={styles.statusIcon}
                    width={14}
                    height={14}
                    aria-hidden
                  />
                ) : headline.kind === 'generated' &&
                  headline.title === 'Wygenerowana' ? (
                  <CircleCheck
                    className={styles.statusIcon}
                    size={14}
                    strokeWidth={1.85}
                    aria-hidden
                  />
                ) : null}
                {headline.title}
              </p>
              {headline.kind === 'signed' && headline.support ? (
                <span className={styles.signedDate}>{headline.support}</span>
              ) : null}
            </div>
            <h2
              id="modern-contract-title"
              className={styles.documentTitle}
            >
              {latestMeta.title}
            </h2>
            <p className={styles.documentMeta}>
              {latestMeta.versionLabel} · {latestMeta.formatsLabel} ·{' '}
              {latestMeta.generatedAtLabel}
            </p>
            {isContractStale ? (
              <div
                className={styles.freshnessNotice}
                data-testid="contract-freshness-notice"
                role="status"
              >
                <p className={styles.freshnessTitle}>
                  {CONTRACT_FRESHNESS_COPY.title}
                </p>
                <p className={styles.freshnessSupport}>
                  {isSigned
                    ? CONTRACT_FRESHNESS_COPY.signedSupport
                    : CONTRACT_FRESHNESS_COPY.support}
                </p>
                {canRegenerate ? (
                  <button
                    type="button"
                    className={styles.freshnessAction}
                    data-testid="contract-freshness-regenerate"
                    onClick={() => onAction('generate_contract')}
                  >
                    {CONTRACT_FRESHNESS_COPY.action}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className={styles.docActions}>
              <Link
                className={`${styles.docAction} ${styles.docActionPrimary}`}
                to={`/sluby/${wedding.id}/umowy/${latest.draft.id}`}
              >
                <Eye
                  className={styles.docActionIcon}
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden
                />
                Podgląd
              </Link>
              {latestFormats.includes('docx') ? (
                <button
                  type="button"
                  className={styles.docAction}
                  disabled={downloading === `${latest.draft.id}:docx`}
                  onClick={() => void downloadContract(latest)}
                >
                  <Download
                    className={styles.docActionIcon}
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  Pobierz DOCX
                </button>
              ) : null}
              {latestFormats.includes('docx') ? (
                <button
                  type="button"
                  className={styles.docAction}
                  disabled={pdfDownload.busy}
                  data-testid="contract-pdf-download-button"
                  onClick={() => void pdfDownload.downloadPdf()}
                >
                  <Download
                    className={styles.docActionIcon}
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  {pdfDownload.busy ? 'Przygotowywanie PDF…' : 'Pobierz PDF'}
                </button>
              ) : null}
            </div>
            {pdfDownload.error ? (
              <p className={styles.error} role="alert">
                {pdfDownload.error}
              </p>
            ) : null}
            {canRegenerate || canMarkSent || canSign || isSigned ? (
              <div className={styles.manageRow}>
                {canRegenerate ? (
                  <button
                    type="button"
                    className={styles.workflowAction}
                    data-testid="contracts-generate"
                    onClick={() => onAction('generate_contract')}
                  >
                    <RefreshCw
                      className={styles.workflowIcon}
                      size={15}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    Generuj ponownie
                  </button>
                ) : null}
                {canMarkSent ? (
                  <button
                    type="button"
                    className={styles.workflowAction}
                    data-testid="contract-mark-sent"
                    onClick={() => setConfirmSent(true)}
                  >
                    <Send
                      className={styles.workflowIcon}
                      size={15}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    Oznacz jako wysłaną
                  </button>
                ) : null}
                {canSign ? (
                  <button
                    type="button"
                    className={styles.workflowAction}
                    data-testid="contract-mark-signed"
                    onClick={() => setConfirmSign(true)}
                  >
                    <CircleCheck
                      className={styles.workflowIcon}
                      size={15}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    Oznacz jako podpisaną
                  </button>
                ) : null}
                {isSigned ? (
                  <button
                    type="button"
                    className={styles.workflowAction}
                    data-testid="contract-unsign"
                    onClick={() => setConfirmUnsign(true)}
                  >
                    <Undo2
                      className={styles.workflowIcon}
                      size={15}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    Cofnij oznaczenie
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.statusBlock}>
            <h2
              id="modern-contract-title"
              className={styles.statusPill}
              data-kind={headline.kind}
              data-testid="modern-contract-status"
            >
              {headline.kind === 'signed' ? (
                <IconCheck
                  className={styles.statusIcon}
                  width={14}
                  height={14}
                  aria-hidden
                />
              ) : headline.kind === 'generated' &&
                headline.title === 'Wygenerowana' ? (
                <CircleCheck
                  className={styles.statusIcon}
                  size={14}
                  strokeWidth={1.85}
                  aria-hidden
                />
              ) : null}
              {headline.title}
            </h2>
            {headline.support ? (
              <p className={styles.statusSupport}>{headline.support}</p>
            ) : null}
          </div>
        )}

        {!latest && canMarkSent ? (
          <div className={styles.manageRow}>
            <button
              type="button"
              className={styles.quietLink}
              data-testid="contract-mark-sent"
              onClick={() => setConfirmSent(true)}
            >
              Oznacz jako wysłaną
            </button>
          </div>
        ) : null}

        {!latest && canSign ? (
          <div className={styles.manageRow}>
            <button
              type="button"
              className={styles.quietLink}
              data-testid="contract-mark-signed"
              onClick={() => setConfirmSign(true)}
            >
              Oznacz jako podpisaną
            </button>
          </div>
        ) : null}
        </div>

        <aside className={styles.documentsColumn} aria-labelledby="contract-documents-title">
          <div className={styles.documentsHeader}>
            <h3 id="contract-documents-title">Dokumenty i dane</h3>
            <p>Pliki umowy i odpowiedzi w jednym miejscu.</p>
          </div>

          <div className={styles.entryActions}>
            {headline.kind === 'ready' ? (
              <Button
                type="button"
                variant="primary"
                data-testid="contracts-generate"
                onClick={() => onAction('generate_contract')}
              >
                Wygeneruj umowę
              </Button>
            ) : null}
            {headline.kind === 'no_template' ? (
              <Link className={styles.entryLink} to="/studio/pakiety">
                Przejdź do pakietu
              </Link>
            ) : null}
            <button
              type="button"
              className={styles.uploadAction}
              onClick={() => uploadInputRef.current?.click()}
              data-testid="contract-upload-document"
            >
              <Upload size={16} aria-hidden />
              Wgraj dokument
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className={styles.hiddenInput}
              data-testid="contract-upload-input"
              onChange={(event) => {
                selectExternalDocument(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }}
            />
            <p className={styles.uploadHint}>PDF lub DOCX z innego źródła</p>
          </div>

          <nav className={styles.utilities} aria-label="Dokumenty i dane">
            {sorted.length > 0 ? (
              <button
                type="button"
                className={styles.discloseRow}
                data-testid="wedding-version-history-toggle"
                onClick={() => setUtility('history')}
              >
                <span className={styles.discloseLead}>
                  <History className={styles.discloseIcon} size={16} aria-hidden />
                  <span className={styles.discloseLabel}>Historia wersji</span>
                </span>
                <span className={styles.discloseTrail}>
                  <span className={styles.discloseMeta}>
                    {sorted.length === 1 ? '1 wersja' : `${sorted.length} wersje`}
                  </span>
                  <ChevronRight className={styles.discloseChevron} size={15} aria-hidden />
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className={styles.discloseRow}
              data-testid="contract-answers-toggle"
              onClick={() => setUtility('answers')}
            >
              <span className={styles.discloseLead}>
                <FileText className={styles.discloseIcon} size={16} aria-hidden />
                <span className={styles.discloseLabel}>Dane z ankiety</span>
              </span>
              <span className={styles.discloseTrail}>
                <span className={styles.discloseMeta}>{answers.line}</span>
                <ChevronRight className={styles.discloseChevron} size={15} aria-hidden />
              </span>
            </button>
            <button
              type="button"
              className={styles.discloseRow}
              data-testid="modern-source-contract-toggle"
              onClick={() => setUtility('source')}
            >
              <span className={styles.discloseLead}>
                <Paperclip className={styles.discloseIcon} size={16} aria-hidden />
                <span className={styles.discloseLabel}>Wgrane dokumenty</span>
              </span>
              <span className={styles.discloseTrail}>
                <span className={styles.discloseMeta}>
                  {sourceDocumentCountLabel(sourceContracts.length)}
                </span>
                <ChevronRight className={styles.discloseChevron} size={15} aria-hidden />
              </span>
            </button>
          </nav>
        </aside>
      </section>

      <section
        className={`${styles.sheet} ${styles.settlement}`}
        aria-labelledby="modern-settlement-title"
        data-testid="modern-settlement-record"
        data-payment={settlement.paymentKind}
      >
        <div className={styles.settlementHead}>
          <h2 id="modern-settlement-title" className={styles.sectionTitle}>
            Rozliczenie
          </h2>
          {onEditFinances ? (
            <button
              type="button"
              className={styles.quietLink}
              onClick={onEditFinances}
            >
              Edytuj finanse
            </button>
          ) : null}
        </div>

        <div
          className={styles.summary}
          data-paid={settlement.paymentKind === 'paid' ? 'true' : 'false'}
        >
          <div className={styles.summaryCol}>
            <p className={styles.summaryLabel}>Wartość umowy</p>
            <p
              className={styles.summaryAmount}
              data-rank="value"
              data-testid="modern-settlement-value"
            >
              {settlement.contractValueLabel}
            </p>
          </div>
          <div className={styles.summaryCol}>
            <p className={styles.summaryLabel}>
              {settlement.paymentKind === 'none' ? 'Wpłaty' : 'Wpłacono'}
            </p>
            <p
              className={styles.summaryAmount}
              data-rank="paid"
              data-tone={
                settlement.paymentKind === 'none' ? 'none' : undefined
              }
              data-testid="modern-settlement-paid"
            >
              {settlement.paymentKind === 'none'
                ? 'Brak wpłat'
                : settlement.paidLabel}
            </p>
          </div>
          <div className={styles.summaryCol}>
            <p className={styles.summaryLabel}>Pozostało</p>
            <p
              className={styles.summaryAmount}
              data-rank="remaining"
              data-tone={
                settlement.paymentKind === 'paid'
                  ? 'paid'
                  : settlement.paymentTone === 'overdue'
                    ? 'overdue'
                    : undefined
              }
              data-testid="modern-settlement-remaining"
            >
              {settlement.paymentKind === 'paid'
                ? formatCurrency(0)
                : settlement.headlineAmount}
            </p>
          </div>
          <div
            className={styles.summaryCol}
            data-tone={
              settlement.dueTone === 'overdue' ? 'overdue' : undefined
            }
          >
            <p className={styles.summaryLabel}>Termin płatności</p>
            <p className={styles.summaryPrimary}>
              {settlement.dueDateOnly ?? settlement.dueLabel}
            </p>
            {settlement.dueDateOnly && settlement.dueTermsLabel ? (
              <p className={styles.summarySupport}>{settlement.dueTermsLabel}</p>
            ) : null}
          </div>
          <div
            className={styles.summaryCol}
            data-testid="travel-fee-summary"
            data-tone={
              settlement.travelUnresolved ? 'unresolved' : undefined
            }
          >
            <p className={styles.summaryLabel}>Dojazd</p>
            <p className={styles.summaryPrimary}>{settlement.travelLabel}</p>
            <button
              type="button"
              className={styles.quietLink}
              data-testid="travel-fee-resolve-open"
              onClick={() => setTravelFeeOpen(true)}
            >
              {settlement.travelUnresolved
                ? 'Ustal koszt dojazdu'
                : 'Edytuj dojazd'}
            </button>
          </div>
        </div>

        <div className={styles.ledger}>
          <div className={styles.blockHead}>
            <h3 className={styles.sectionTitle}>Płatności</h3>
            {addDeposit ? (
              <button
                type="button"
                className={styles.quietLink}
                data-testid="finance-add-deposit"
                onClick={() => onAction('add_deposit')}
              >
                Dodaj zadatek
              </button>
            ) : (
              <button
                type="button"
                className={styles.quietLink}
                data-testid="finance-add-payment"
                onClick={() => onAction('add_payment')}
              >
                Dodaj wpłatę
              </button>
            )}
          </div>
          {payments.length === 0 ? (
            <p className={styles.muted}>Brak wpłat.</p>
          ) : (
            <ul className={styles.paymentList}>
              {payments.map((payment) => (
                <li key={payment.id} className={styles.paymentRow}>
                  <div>
                    <p className={styles.paymentName}>
                      {paymentDisplayLabel(payment)}
                    </p>
                    <p className={styles.paymentState}>
                      {paymentPaidLine(payment)}
                    </p>
                  </div>
                  <div className={styles.paymentEnd}>
                    <p className={styles.paymentAmount}>
                      {formatCurrency(payment.amount)}
                    </p>
                    <div className={styles.paymentActions}>
                      {onEditPayment ? (
                        <button
                          type="button"
                          className={styles.quietLink}
                          data-testid="finance-edit-payment"
                          onClick={() => onEditPayment(payment)}
                        >
                          Edytuj
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`${styles.quietLink} ${styles.quietDanger}`}
                        data-testid="finance-delete-payment"
                        disabled={deleting && pendingDelete?.id === payment.id}
                        onClick={() =>
                          requirePro(() => setPendingDelete(payment))
                        }
                      >
                        Usuń
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        className={`${styles.sheet} ${styles.package}`}
        aria-labelledby="modern-package-title"
        id="package-details-anchor"
        data-testid="modern-agreement-terms"
      >
        <div className={styles.settlementHead}>
          <h2 id="modern-package-title" className={styles.sectionTitle}>
            Szczegóły pakietu
          </h2>
          {onEditPackage ? (
            <button
              type="button"
              className={styles.quietLink}
              onClick={onEditPackage}
            >
              Edytuj pakiet
            </button>
          ) : null}
        </div>
        <p className={styles.packageName}>{terms.name}</p>
        {terms.coverage ? (
          <p className={styles.packageCoverage}>{terms.coverage}</p>
        ) : null}
        <dl className={styles.packageFacts}>
          <div className={styles.packageFact}>
            <dt>Zaliczka</dt>
            <dd>{terms.agreedDepositLabel}</dd>
          </div>
          {terms.overtime ? (
            <div className={styles.packageFact}>
              <dt>Nadgodzina</dt>
              <dd>{terms.overtime}</dd>
            </div>
          ) : null}
          {terms.delivery ? (
            <div className={styles.packageFact}>
              <dt>Oddanie</dt>
              <dd>{terms.delivery}</dd>
            </div>
          ) : null}
          {terms.extrasLabel ? (
            <div className={styles.packageFact}>
              <dt>Usługi dodatkowe</dt>
              <dd>{terms.extrasLabel}</dd>
            </div>
          ) : null}
        </dl>
        <button
          type="button"
          className={`${styles.quietLink} ${styles.packageReveal}`}
          aria-expanded={contentsOpen}
          onClick={() => setContentsOpen((value) => !value)}
        >
          {contentsOpen ? 'Ukryj zawartość' : 'Pokaż zawartość'}
        </button>
        {contentsOpen ? (
          <ul className={styles.packageItems}>
            {terms.items.length === 0 ? (
              <li>Brak pozycji w snapshotcie.</li>
            ) : (
              terms.items.map((item, index) => (
                <li key={item.sourceItemId ?? `${item.title}-${index}`}>
                  {item.title}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </section>

      <Modal
        open={utility !== null}
        title={
          utility === 'history'
            ? 'Historia wersji'
            : utility === 'answers'
              ? 'Dane z ankiety'
              : utility === 'upload-choice'
                ? 'Wgraj dokument'
                : 'Wgrane dokumenty'
        }
        description={
          utility === 'history'
            ? 'Wszystkie wygenerowane wersje umowy.'
            : utility === 'answers'
              ? answers.completed
                ? `${answers.line}${wedding.packageName?.trim() ? ` · ${wedding.packageName.trim()}` : ''}`
                : 'Odpowiedzi do umowy.'
              : utility === 'upload-choice'
                ? 'Co chcesz zrobić z tym dokumentem?'
                : 'Dokumenty dodane do tego zlecenia.'
        }
        onClose={() => {
          if (!uploadBusy) {
            setUtility(null)
            if (utility === 'upload-choice') setSelectedUpload(null)
          }
        }}
        busy={uploadBusy}
        hideFooter
        showClose
        size="story"
        mobilePresentation="sheet"
        panelClassName={styles.detailModal}
      >
        {utility === 'history' ? (
          <ul className={styles.modalList} data-testid="wedding-version-history">
            {sorted.map((contract) => (
              <HistoricalContractVersion
                key={contract.draft.id}
                contract={contract}
                weddingId={wedding.id}
                current={contract.draft.id === latest?.draft.id}
              />
            ))}
          </ul>
        ) : null}

        {utility === 'answers' ? (
          <div
            className={styles.answersModalContent}
            data-testid="contract-finance-questionnaire"
          >
            {answers.completed ? (
              <WeddingContractQuestionnaireAnswers
                weddingId={wedding.id}
                enabled
              />
            ) : (
              <p className={styles.muted} data-testid="contract-answers-empty">
                Brak przesłanych odpowiedzi do umowy.
              </p>
            )}
          </div>
        ) : null}

        {utility === 'source' ? (
          <div className={styles.uploadedDocuments} data-testid="uploaded-documents-modal">
            {sourceContracts.length === 0 ? (
              <p className={styles.muted}>Nie dodano jeszcze dokumentów.</p>
            ) : (
              <ul className={styles.modalList}>
                {sourceContracts.map((contract) => (
                  <li key={contract.id} className={styles.sourceItem}>
                    <div className={styles.sourceInfo}>
                      <strong className={styles.sourceName} title={contract.originalFileName}>
                        {contract.originalFileName}
                      </strong>
                      <span className={styles.sourceMeta}>
                        {contract.mimeType.includes('pdf') ? 'PDF' : 'DOCX'} ·{' '}
                        {new Intl.DateTimeFormat('pl-PL', {
                          dateStyle: 'medium',
                        }).format(new Date(contract.createdAt))}
                      </span>
                      {contract.status === 'ready_for_review' ? (
                        <span className={styles.sourceState}>Dane zostały odczytane</span>
                      ) : contract.status === 'applied' ? (
                        <span className={styles.sourceState}>Dane zastosowane</span>
                      ) : contract.status === 'failed' ? (
                        <span className={styles.sourceState}>Analiza nie powiodła się</span>
                      ) : contract.status === 'analyzing' || contract.status === 'extracting' ? (
                        <span className={styles.sourceState}>Analiza w toku</span>
                      ) : null}
                    </div>
                    <div className={styles.sourceActions}>
                      <button
                        type="button"
                        className={styles.quietLink}
                        onClick={() => void openSourceFile(contract.filePath)}
                      >
                        Otwórz
                      </button>
                      {contract.status !== 'uploaded' ? (
                        <button
                          type="button"
                          className={styles.quietLink}
                          disabled={uploadBusy}
                          onClick={() => void analyzeExistingDocument(contract)}
                        >
                          Analizuj ponownie
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className={styles.modalUploadButton}
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload size={16} aria-hidden />
              Wgraj dokument
            </button>
          </div>
        ) : null}

        {utility === 'upload-choice' && selectedUpload ? (
          <div className={styles.uploadChoice} data-testid="upload-document-choice">
            <div className={styles.selectedFile}>
              <FileText size={18} aria-hidden />
              <span title={selectedUpload.name}>{selectedUpload.name}</span>
              <button
                type="button"
                className={styles.changeFile}
                disabled={uploadBusy}
                onClick={() => uploadInputRef.current?.click()}
              >
                Zmień
              </button>
            </div>
            <button
              type="button"
              className={styles.uploadChoiceOption}
              disabled={uploadBusy}
              onClick={() => void saveUploadOnly()}
              data-testid="upload-document-store-only"
            >
              <strong>{uploadBusy ? 'Zapisywanie…' : 'Tylko zachowaj dokument'}</strong>
              <span>Dokument zostanie zapisany przy tym zleceniu.</span>
            </button>
            <button
              type="button"
              className={styles.uploadChoiceOption}
              disabled={uploadBusy}
              onClick={() => void uploadAndAnalyze()}
              data-testid="upload-document-analyze"
            >
              <strong>{uploadBusy ? 'Przygotowywanie…' : 'Uzupełnij dane z dokumentu'}</strong>
              <span>OurWed odczyta dokument i pokaże dane do przeniesienia do zlecenia.</span>
            </button>
            {analysisError ? (
              <div className={styles.analysisRetry} role="alert">
                <p>{analysisError}</p>
                <button
                  type="button"
                  className={styles.quietLink}
                  disabled={uploadBusy}
                  onClick={() => void retryRecoveryAnalysis()}
                >
                  Ponów odczytywanie
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <TravelFeeResolveModal
        open={travelFeeOpen}
        wedding={wedding}
        extras={extras}
        onClose={() => setTravelFeeOpen(false)}
        onSaved={(updated) => onWeddingUpdated?.(updated)}
      />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (!deleting) setPendingDelete(null)
        }}
        title={deleteCopy?.title ?? 'Usunąć wpłatę?'}
        description={deleteCopy?.body}
        busy={deleting}
        cancelLabel="Anuluj"
        primaryAction={
          <Button
            type="button"
            variant="danger"
            disabled={deleting}
            data-testid="finance-delete-payment-confirm"
            onClick={() => void confirmDeletePayment()}
          >
            {deleting ? 'Usuwanie…' : 'Usuń'}
          </Button>
        }
      >
        {pendingDelete ? (
          <p className={styles.muted} style={{ margin: 0 }}>
            {pendingDelete.label} · {formatCurrency(pendingDelete.amount)}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={confirmSent}
        title="Oznacz umowę jako wysłaną"
        description="To zapisuje fakt biznesowy w OurWed. Nie wysyła e-maila i nie zmienia pliku umowy."
        onClose={() => setConfirmSent(false)}
        busy={signBusy}
        primaryAction={
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={signBusy}
            data-testid="contract-mark-sent-confirm"
            onClick={() => void markSent()}
          >
            {signBusy ? 'Zapisywanie…' : 'Oznacz jako wysłaną'}
          </Button>
        }
      >
        <p>
          Potwierdź, że wysłałeś umowę klientowi poza OurWed (np. e-mailem lub
          komunikatorem).
        </p>
      </Modal>

      <Modal
        open={confirmSign}
        title="Oznacz umowę jako podpisaną"
        description="To zapisuje fakt biznesowy w OurWed. Nie generuje podpisu elektronicznego ani nie zmienia pliku umowy."
        onClose={() => setConfirmSign(false)}
        busy={signBusy}
        primaryAction={
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={signBusy}
            data-testid="contract-mark-signed-confirm"
            onClick={() => void markSigned()}
          >
            {signBusy ? 'Zapisywanie…' : 'Oznacz jako podpisaną'}
          </Button>
        }
      >
        <p>
          Potwierdź, że umowa została podpisana poza OurWed (np. papierowo lub
          innym narzędziem).
        </p>
      </Modal>

      <Modal
        open={confirmUnsign}
        title="Cofnij oznaczenie podpisu"
        description="Zmiana dotyczy tylko statusu w OurWed. Plik umowy pozostaje bez zmian."
        onClose={() => setConfirmUnsign(false)}
        busy={signBusy}
        primaryAction={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={signBusy}
            data-testid="contract-unsign-confirm"
            onClick={() => void unmarkSigned()}
          >
            {signBusy ? 'Zapisywanie…' : 'Cofnij oznaczenie'}
          </Button>
        }
      >
        <p>Umowa wróci do statusu wygenerowanej.</p>
      </Modal>
    </div>
  )
}
