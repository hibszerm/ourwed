import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconCheck } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { useContractPdfDownload } from '@/features/documents/contract-experience'
import { useDocumentTemplates } from '@/features/documents/hooks/useDocumentTemplates'
import {
  GeneratedWeddingContractService,
  type GeneratedWeddingContract,
} from '@/features/documents/template'
import { resolvePackageContractForWedding } from '@/features/documents/template/packageContractAssignment'
import { weddingContractRecoveryRepository } from '@/features/wedding-contract-recovery/repository'
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

type UtilityPanel = 'history' | 'answers' | 'source' | null

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
  const [travelFeeOpen, setTravelFeeOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Payment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const [confirmSign, setConfirmSign] = useState(false)
  const [confirmUnsign, setConfirmUnsign] = useState(false)
  const [signBusy, setSignBusy] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data: templates = [] } = useDocumentTemplates()
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
  const older = sorted.slice(1)
  const hasGenerated = (contractsQuery.data ?? []).length > 0
  const hasTemplate =
    packageQuery.isPending && !packageQuery.data
      ? null
      : packageQuery.data?.status === 'ok'

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
  const templateNames = new Map(templates.map((item) => [item.id, item.name]))
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
              queryFn: () =>
                GeneratedWeddingContractService.downloadArtifact(
                  wedding.id,
                  latestContractId,
                  'docx',
                ),
            })
        : undefined,
  })

  function toggleUtility(next: UtilityPanel) {
    setUtility((current) => (current === next ? null : next))
  }

  async function downloadContract(contract: GeneratedWeddingContract) {
    const key = `${contract.draft.id}:docx`
    setDownloading(key)
    try {
      const url = await GeneratedWeddingContractService.getArtifactDownloadUrl(
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
        className={`${styles.sheet} ${styles.contract}`}
        aria-labelledby="modern-contract-title"
        data-testid="modern-contract-record"
        data-kind={headline.kind}
      >
        <div className={styles.sheetHead}>
          <p className={styles.eyebrow}>Umowa</p>
        </div>
        <div className={styles.statusBlock}>
          <h2
            id="modern-contract-title"
            className={styles.statusTitle}
            data-kind={headline.kind}
          >
            {headline.kind === 'signed' ? (
              <IconCheck
                className={styles.signedMark}
                width={15}
                height={15}
                aria-hidden
              />
            ) : null}
            {headline.title}
          </h2>
          {headline.kind === 'signed' && headline.support ? (
            <p className={styles.signedDate}>{headline.support}</p>
          ) : headline.support ? (
            <p className={styles.statusSupport}>{headline.support}</p>
          ) : null}
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
            <p className={styles.documentTitle}>{latestMeta.title}</p>
            <p className={styles.documentMeta}>
              {latestMeta.versionLabel} · {latestMeta.formatsLabel} ·{' '}
              {latestMeta.generatedAtLabel}
            </p>
            <div className={styles.docActions}>
              <Link
                className={styles.docAction}
                to={`/sluby/${wedding.id}/umowy/${latest.draft.id}`}
              >
                Podgląd
              </Link>
              {latestFormats.includes('docx') ? (
                <button
                  type="button"
                  className={styles.docAction}
                  disabled={downloading === `${latest.draft.id}:docx`}
                  onClick={() => void downloadContract(latest)}
                >
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
                    className={styles.quietLink}
                    data-testid="contracts-generate"
                    onClick={() => onAction('generate_contract')}
                  >
                    Generuj ponownie
                  </button>
                ) : null}
                {canMarkSent ? (
                  <button
                    type="button"
                    className={styles.quietLink}
                    data-testid="contract-mark-sent"
                    onClick={() => setConfirmSent(true)}
                  >
                    Oznacz jako wysłaną
                  </button>
                ) : null}
                {canSign ? (
                  <button
                    type="button"
                    className={styles.quietLink}
                    data-testid="contract-mark-signed"
                    onClick={() => setConfirmSign(true)}
                  >
                    Oznacz jako podpisaną
                  </button>
                ) : null}
                {isSigned ? (
                  <button
                    type="button"
                    className={styles.quietLink}
                    data-testid="contract-unsign"
                    onClick={() => setConfirmUnsign(true)}
                  >
                    Cofnij oznaczenie
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {headline.kind === 'ready' ? (
          <div className={styles.primaryCta}>
            <Button
              type="button"
              variant="primary"
              data-testid="contracts-generate"
              onClick={() => onAction('generate_contract')}
            >
              Generuj umowę
            </Button>
          </div>
        ) : null}

        {headline.kind === 'no_template' ? (
          <div className={styles.manageRow}>
            <Link className={styles.quietLink} to="/studio/pakiety">
              Przejdź do pakietu
            </Link>
          </div>
        ) : null}

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

        <div className={styles.utilities}>
          {older.length > 0 ? (
            <button
              type="button"
              className={styles.discloseRow}
              data-active={utility === 'history' ? 'true' : undefined}
              aria-expanded={utility === 'history'}
              data-testid="wedding-version-history-toggle"
              onClick={() => toggleUtility('history')}
            >
              <span className={styles.discloseLabel}>Historia wersji</span>
              <span className={styles.discloseMeta}>
                {older.length === 1
                  ? '1 wcześniejsza'
                  : `${older.length} wcześniejsze`}
              </span>
            </button>
          ) : null}
          {utility === 'history' && older.length > 0 ? (
            <div
              className={styles.disclosure}
              data-testid="wedding-version-history"
            >
              <ul className={styles.historyList}>
                {older.map((contract) => {
                  const meta = composeContractDocumentMeta(contract)
                  const formats = [
                    ...new Set(contract.artifacts.map((item) => item.format)),
                  ]
                  return (
                    <li
                      key={contract.draft.id}
                      className={styles.historyItem}
                      data-testid="wedding-contract-older"
                    >
                      <span>
                        <span className={styles.historyTitle}>
                          {meta.versionLabel}
                        </span>
                        {' · '}
                        {templateNames.get(contract.templateId) ??
                          'Szablon archiwalny'}
                        {' · '}
                        {meta.generatedAtLabel}
                      </span>
                      <span className={styles.historyActions}>
                        <Link
                          className={styles.quietLink}
                          to={`/sluby/${wedding.id}/umowy/${contract.draft.id}`}
                        >
                          Podgląd
                        </Link>
                        {formats.includes('docx') ? (
                          <button
                            type="button"
                            className={styles.quietLink}
                            onClick={() => void downloadContract(contract)}
                          >
                            Pobierz
                          </button>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            className={styles.discloseRow}
            data-active={utility === 'answers' ? 'true' : undefined}
            aria-expanded={utility === 'answers'}
            data-testid="contract-answers-toggle"
            onClick={() => toggleUtility('answers')}
          >
            <span className={styles.discloseLabel}>Dane z ankiety</span>
            <span className={styles.discloseMeta}>{answers.line}</span>
          </button>
          {utility === 'answers' ? (
            <div
              className={styles.disclosure}
              data-testid="contract-finance-questionnaire"
            >
              <p className={styles.muted} data-testid="contract-answers-summary">
                {answers.line}
                {wedding.packageName?.trim()
                  ? ` · ${wedding.packageName.trim()}`
                  : ''}
              </p>
              {answers.completed ? (
                <div data-testid="contract-answers-expanded">
                  <WeddingContractQuestionnaireAnswers
                    weddingId={wedding.id}
                    enabled
                  />
                </div>
              ) : (
                <p className={styles.muted}>
                  Pełne odpowiedzi pojawią się po wypełnieniu ankiety do umowy.
                </p>
              )}
            </div>
          ) : null}

          <button
            type="button"
            className={styles.discloseRow}
            data-active={utility === 'source' ? 'true' : undefined}
            aria-expanded={utility === 'source'}
            data-testid="modern-source-contract-toggle"
            onClick={() => toggleUtility('source')}
          >
            <span className={styles.discloseLabel}>Umowa źródłowa</span>
            <span className={styles.discloseMeta}>
              {sourceContracts.length === 0
                ? 'Brak pliku'
                : sourceContracts.length === 1
                  ? '1 plik'
                  : sourceContracts.length < 5
                    ? `${sourceContracts.length} pliki`
                    : `${sourceContracts.length} plików`}
            </span>
          </button>
          {utility === 'source' ? (
            <div className={styles.disclosure}>
              {sourceContracts.length === 0 ? (
                <p className={styles.muted}>Brak wgranych umów źródłowych.</p>
              ) : (
                <ul className={styles.sourceList}>
                  {sourceContracts.map((contract) => (
                    <li key={contract.id} className={styles.sourceItem}>
                      <span className={styles.sourceName}>
                        {contract.originalFileName}
                      </span>
                      <button
                        type="button"
                        className={styles.quietLink}
                        onClick={() => void openSourceFile(contract.filePath)}
                      >
                        Otwórz
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.manageRow}>
                <button
                  type="button"
                  className={styles.quietLink}
                  onClick={() =>
                    navigate(`/sluby/${wedding.id}/uzupelnij-z-umowy`)
                  }
                >
                  Uzupełnij dane z umowy
                </button>
              </div>
            </div>
          ) : null}
        </div>
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
