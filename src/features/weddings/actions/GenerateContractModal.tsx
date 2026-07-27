/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import {
  applyDocxParagraphEdits,
  paragraphsToPrintHtml,
  printHtmlAsPdf,
  saveGeneratedContract,
  type DocxParagraph,
  type TransformContractResult,
} from '@/features/documents/template'
import { PDF_EXPORT_UNAVAILABLE_MESSAGE } from '@/features/documents/template/ContractExportService'
import type { TemplatePickerDiagnosis } from '@/features/documents/template/contractTemplatePicker'
import {
  WeddingContractGenerationService,
  buildGenerationReviewState,
  type ConfiguredContractCompletenessReport,
} from '@/features/documents/template/WeddingContractGenerationService'
import { useDocumentTemplates } from '@/features/documents/hooks/useDocumentTemplates'
import { startDocumentsPerf } from '@/features/documents/performance/documentsPerformance'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import type { Wedding } from '@/types/wedding'
import { ContractDocumentPreview } from './ContractDocumentPreview'
import styles from './GenerateContractModal.module.css'

type Step = 'template' | 'completeness' | 'editor' | 'saved'

interface GenerateContractModalProps {
  open: boolean
  onClose: () => void
  wedding: Wedding
}

function paragraphsDirty(
  current: DocxParagraph[],
  baseline: DocxParagraph[],
): boolean {
  if (current.length !== baseline.length) return true
  return current.some(
    (p, i) => p.index !== baseline[i]?.index || p.text !== baseline[i]?.text,
  )
}

export function GenerateContractModal({
  open,
  onClose,
  wedding,
}: GenerateContractModalProps) {
  const invalidate = useInvalidateWedding()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const {
    data: templates = [],
    isLoading: templatesLoading,
    isError: templatesError,
    error: templatesQueryError,
    isFetching: templatesFetching,
  } = useDocumentTemplates()

  const selection = useMemo(
    () =>
      WeddingContractGenerationService.selectTemplates(
        templates,
        wedding.packageName,
      ),
    [templates, wedding.packageName],
  )
  const classification = selection.classification
  const recommended = selection.recommended
  const otherSelectable = selection.alternatives

  const [step, setStep] = useState<Step>('template')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [report, setReport] =
    useState<ConfiguredContractCompletenessReport | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [generated, setGenerated] = useState<TransformContractResult | null>(
    null,
  )
  const [paragraphs, setParagraphs] = useState<DocxParagraph[]>([])
  const [baselineParagraphs, setBaselineParagraphs] = useState<
    DocxParagraph[]
  >([])
  const [docxBytes, setDocxBytes] = useState<ArrayBuffer | null>(null)
  const [docxUrl, setDocxUrl] = useState<string | null>(null)
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(true)
  /** Created once per modal open / generation attempt — preview + export share it. */
  const [generationStartedAt, setGenerationStartedAt] = useState<Date | null>(
    null,
  )
  const effectiveTemplateId =
    selectedTemplateId ?? selection.preselectedTemplateId

  useEffect(() => {
    if (!open) return
    const perf = startDocumentsPerf('generate-picker')
    perf.stamp('modalOpenedAt')
    setStep('template')
    setBusy(false)
    setError(null)
    setSelectedTemplateId(null)
    setReport(null)
    setOverrides({})
    setGenerated(null)
    setParagraphs([])
    setBaselineParagraphs([])
    setDocxBytes(null)
    setDocxUrl(null)
    setSummaryPanelOpen(true)
    setGenerationStartedAt(new Date())
    // Use shared React Query cache — do not invalidate or refetch on every open.
    if (templates.length > 0 || !templatesLoading) {
      perf.stamp('pickerDataAvailableAt')
      perf.stamp('pickerRenderedAt')
      perf.finish({
        totalTemplateCount: templates.length,
        numberOfNetworkRequests: templatesFetching && templates.length === 0 ? 1 : 0,
        analysisFunctionsCalled: 0,
        binaryFilesFetched: 0,
      })
    }
  }, [open, wedding.id])

  useEffect(() => {
    if (!open) return
    if (templatesLoading && templates.length === 0) return
    console.info('[documents-performance]', {
      phase: 'generate-picker-data',
      pickerDataAvailableAt: performance.now(),
      totalTemplateCount: templates.length,
      fromCache: !templatesFetching,
    })
  }, [open, templates, templatesLoading, templatesFetching])

  function requestClose() {
    if (busy) return
    if (
      step === 'editor' &&
      paragraphsDirty(paragraphs, baselineParagraphs)
    ) {
      const ok = window.confirm(
        'Masz niezapisane zmiany w podglądzie umowy. Zamknąć mimo to?',
      )
      if (!ok) return
    }
    onClose()
  }

  function goBackToVariables() {
    if (report) {
      setStep('completeness')
      setError(null)
      return
    }
    setStep('template')
    setError(null)
  }

  async function runGenerate(input: {
    overrides: Record<string, string>
  }) {
    const startedAt = generationStartedAt ?? new Date()
    if (!generationStartedAt) setGenerationStartedAt(startedAt)

    if (!report) throw new Error('Najpierw sprawdź dane umowy.')
    const attempt = await WeddingContractGenerationService.generate({
      wedding,
      report,
      overrides: input.overrides,
      generationDate: startedAt,
    })
    if (attempt.status === 'needs_review') {
      throw new Error(
        attempt.reviewStatePatch.contextualMessages.join('\n') ||
          'Uzupełnij wymagane dane przed generowaniem.',
      )
    }
    const filled = attempt.artifact
    setGenerated(filled)
    setDocxBytes(filled.docxBytes)
    const nextParas = filled.paragraphs.map((p) => ({ ...p }))
    setParagraphs(nextParas)
    setBaselineParagraphs(nextParas.map((p) => ({ ...p })))
    setStep('editor')
  }

  async function afterTemplateSelected(templateId: string) {
    setBusy(true)
    setError(null)
    setSelectedTemplateId(templateId)
    try {
      const startedAt = generationStartedAt ?? new Date()
      if (!generationStartedAt) setGenerationStartedAt(startedAt)

      const next = await WeddingContractGenerationService.prepareVerification({
        wedding,
        templateId,
        overrides,
        generationStartedAt: startedAt,
      })
      setReport(next)

      if (next.allComplete) {
        setStep('completeness')
      } else {
        setStep('completeness')
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Nie udało się przygotować generowania umowy.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleGenerate() {
    if (!selectedTemplateId || !report) return
    setBusy(true)
    setError(null)
    try {
      const review = buildGenerationReviewState({
        report,
        overrides,
      })
      if (!review.generationAllowed) {
        if (review.editableMissingFields.length > 0) {
          throw new Error('Uzupełnij brakujące pola poniżej i spróbuj ponownie.')
        }
        throw new Error(
          review.blockingUserInputs.map((item) => item.message).join('\n') ||
            'Uzupełnij wymagane odpowiedzi i spróbuj ponownie.',
        )
      }

      await runGenerate({
        overrides,
      })
    } catch (err) {
      const raw =
        err instanceof Error ? err.message : 'Nie udało się wygenerować umowy.'
      const review = report
        ? buildGenerationReviewState({ report, overrides })
        : null
      if (
        review &&
        review.editableMissingFields.length === 0 &&
        /brakujące pola poniżej/i.test(raw)
      ) {
        setError('Nie udało się wygenerować umowy. Spróbuj ponownie.')
      } else {
        setError(raw)
      }
    } finally {
      setBusy(false)
    }
  }

  async function persistGenerated() {
    if (!generated || !docxBytes || !report) return
    setBusy(true)
    setError(null)
    try {
      const edited = await applyDocxParagraphEdits(
        docxBytes,
        paragraphs.map((p) => ({ index: p.index, text: p.text })),
      )
      setDocxBytes(edited)

      const saved = await saveGeneratedContract({
        wedding,
        draftId: generated.draftId,
        templateId: generated.templateId,
        templateVersionId: generated.templateVersionId,
        title: generated.title,
        docxBytes: edited,
        packageSnapshot: report.packageSnapshot,
        manualOverrides: overrides,
        resolvedValues: generated.resolved,
        omittedKeys: generated.omittedKeys,
        templateMeta: templates.find((item) => item.id === generated.templateId)?.meta,
        executionSnapshot: generated.executionSnapshot
          ? {
              contractExecutionDate:
                generated.executionSnapshot.contractExecutionDate ?? null,
              contractExecutionCity:
                generated.executionSnapshot.contractExecutionCity ?? null,
            }
          : null,
        auditSummary: {
          browserEditsApplied: true,
          qualityRetries: generated.qualityRetries,
          usedMock: generated.usedMock,
        },
      })

      await weddingActionsService.markContractGenerated(wedding.id, {
        missingFields: generated.omittedKeys,
        hadDocument: true,
      })
      await invalidate(wedding.id)

      setDocxUrl(saved.docxDownloadUrl)
      setBaselineParagraphs(paragraphs.map((p) => ({ ...p })))
      setStep('saved')
      showToast('Umowa zapisana (DOCX).', 'success')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się zapisać umowy.',
      )
    } finally {
      setBusy(false)
    }
  }

  function handlePrintPdf() {
    if (!docxBytes) return
    try {
      const html = paragraphsToPrintHtml(
        generated?.title ?? 'Umowa',
        paragraphs,
      )
      printHtmlAsPdf(html)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Nie udało się otworzyć podglądu PDF.',
      )
    }
  }

  const isEditor = step === 'editor'

  const description = isEditor
    ? 'Sprawdź treść przed zapisaniem dokumentów.'
    : step === 'template'
      ? 'Wybierz szablon. Dane pobierzemy automatycznie ze Ślubu, ankiet, pakietu i firmy.'
      : step === 'completeness'
        ? `Brakuje ${report?.missing.length ?? 0} ${
            (report?.missing.length ?? 0) === 1 ? 'wartości' : 'wartości'
          }. Reszta pochodzi z OurWed.`
        : 'Umowa jest gotowa do pobrania.'

  const primaryAction = (() => {
    if (step === 'template') {
      return (
        <Button
          type="button"
          variant="primary"
          disabled={busy || !effectiveTemplateId}
          onClick={() => {
            if (effectiveTemplateId) void afterTemplateSelected(effectiveTemplateId)
          }}
        >
          {busy ? 'Przygotowywanie…' : 'Dalej'}
        </Button>
      )
    }
    if (step === 'completeness') {
      return (
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => void handleGenerate()}
        >
          {busy ? 'Transformacja…' : 'Generuj umowę'}
        </Button>
      )
    }
    if (step === 'editor') {
      return (
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => void persistGenerated()}
        >
          {busy ? 'Zapisywanie…' : 'Zapisz DOCX'}
        </Button>
      )
    }
    return (
      <Button type="button" variant="primary" onClick={requestClose}>
        Zamknij
      </Button>
    )
  })()

  const secondaryAction = step === 'editor' ? (
      <Button
        type="button"
        variant="secondary"
        disabled
        title={PDF_EXPORT_UNAVAILABLE_MESSAGE}
      >
        PDF niedostępny
      </Button>
    ) : undefined

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={isEditor ? 'Podgląd umowy' : 'Generuj umowę'}
      description={description}
      busy={busy}
      size={isEditor ? 'document' : 'lg'}
      showClose={isEditor}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      cancelLabel={
        step === 'saved' ? 'Zamknij' : isEditor ? 'Wróć' : 'Anuluj'
      }
      onCancel={isEditor ? goBackToVariables : requestClose}
      statusBadge={
        isEditor ? (
          <span className={styles.statusBadge}>Wygenerowano poprawnie</span>
        ) : null
      }
      headerActions={
        isEditor ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={goBackToVariables}
          >
            Powrót do zmiennych
          </Button>
        ) : null
      }
    >
      {step === 'template' ? (
        <TemplatePicker
          loading={templatesLoading || templatesFetching}
          queryError={
            templatesError
              ? templatesQueryError instanceof Error
                ? templatesQueryError.message
                : 'Nie udało się wczytać szablonów.'
              : null
          }
          recommended={recommended}
          otherSelectable={otherSelectable}
          incomplete={classification.incomplete}
          selectedId={effectiveTemplateId}
          onSelect={setSelectedTemplateId}
          onReanalyze={(id) => {
            onClose()
            navigate(`/ustawienia/dokumenty/szablony/${id}/konfiguracja`)
          }}
        />
      ) : null}

      {step === 'completeness' && report ? (
        <CompletenessStep
          report={report}
          overrides={overrides}
          onOverride={(key, value) =>
            setOverrides((prev) => ({ ...prev, [key]: value }))
          }
        />
      ) : null}

      {step === 'editor' ? (
        <ContractDocumentPreview
          paragraphs={paragraphs}
          baselineParagraphs={baselineParagraphs}
          resolvedValues={generated?.resolved ?? {}}
          omittedKeys={generated?.omittedKeys ?? []}
          busy={busy}
          panelOpen={summaryPanelOpen}
          onTogglePanel={() => setSummaryPanelOpen((v) => !v)}
          onBackToVariables={goBackToVariables}
          onChangeParagraph={(index, text) =>
            setParagraphs((prev) =>
              prev.map((p) =>
                p.index === index
                  ? {
                      ...p,
                      text: text === '\u00a0' ? '' : text,
                    }
                  : p,
              ),
            )
          }
          onReplaceAll={setParagraphs}
        />
      ) : null}

      {step === 'saved' ? (
        <SavedStep
          docxUrl={docxUrl}
          onPrintPdf={handlePrintPdf}
        />
      ) : null}

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </Modal>
  )
}

function TemplatePicker({
  loading,
  queryError,
  recommended,
  otherSelectable,
  incomplete,
  selectedId,
  onSelect,
  onReanalyze,
}: {
  loading: boolean
  queryError: string | null
  recommended: TemplatePickerDiagnosis[]
  otherSelectable: TemplatePickerDiagnosis[]
  incomplete: TemplatePickerDiagnosis[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReanalyze: (id: string) => void
}) {
  if (loading) {
    return <p className={styles.muted}>Ładowanie szablonów…</p>
  }

  if (queryError) {
    return (
      <div className={styles.pickerBlock}>
        <p role="alert" className={styles.error}>
          Nie udało się wczytać szablonów. {queryError}
        </p>
        <p className={styles.muted}>
          To nie oznacza braku szablonów — sprawdź połączenie / uprawnienia
          (RLS) i spróbuj ponownie.
        </p>
      </div>
    )
  }

  const selectable = [...recommended, ...otherSelectable]
  const hasSelectable = selectable.length > 0
  const hasIncomplete = incomplete.length > 0

  return (
    <div className={styles.pickerBlock}>
      {!hasSelectable ? (
        <p className={styles.muted}>
          Nie masz jeszcze gotowego szablonu umowy.
        </p>
      ) : null}

      {recommended.length > 0 ? (
        <section className={styles.pickerSection}>
          <h3 className={styles.pickerHeading}>Rekomendowane</h3>
          <SelectableList
            items={recommended}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </section>
      ) : null}

      {otherSelectable.length > 0 ? (
        <section className={styles.pickerSection}>
          <h3 className={styles.pickerHeading}>
            {recommended.length > 0 ? 'Pozostałe szablony' : 'Szablony umów'}
          </h3>
          <SelectableList
            items={otherSelectable}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </section>
      ) : null}

      {hasIncomplete ? (
        <section className={styles.pickerSection}>
          <h3 className={styles.pickerHeading}>
            Szablony wymagające dokończenia
          </h3>
          <ul className={styles.incompleteList}>
            {incomplete.map((row) => (
              <li key={row.template.id} className={styles.incompleteItem}>
                <div>
                  <span className={styles.templateName}>
                    {row.template.name}
                  </span>
                  <span className={styles.templateMeta}>
                    Wymaga dokończenia przygotowania
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onReanalyze(row.template.id)}
                >
                  Dokończ konfigurację
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!hasSelectable && !hasIncomplete ? (
        <p className={styles.muted}>
          Prześlij wzór umowy w Pakietach — będzie używany przy generowaniu na ślubie.
        </p>
      ) : null}
    </div>
  )
}

function SelectableList({
  items,
  selectedId,
  onSelect,
}: {
  items: TemplatePickerDiagnosis[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <fieldset className={styles.templateList}>
      <legend className={styles.srOnly}>Wybierz szablon</legend>
      {items.map((row) => {
        const t = row.template
        return (
          <label key={t.id} className={styles.templateOption}>
            <input
              type="radio"
              name="contract-template"
              checked={selectedId === t.id}
              onChange={() => onSelect(t.id)}
            />
            <span>
              <span className={styles.templateName}>{t.name}</span>
              <span className={styles.templateMeta}>
                {row.boundSlotCount || t.variableCount}{' '}
                {(row.boundSlotCount || t.variableCount) === 1
                  ? 'zmienna'
                  : 'zmiennych'}
                {t.category ? ` · ${t.category}` : ''}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

function CompletenessStep({
  report,
  overrides,
  onOverride,
}: {
  report: ConfiguredContractCompletenessReport
  overrides: Record<string, string>
  onOverride: (key: string, value: string) => void
}) {
  const review = buildGenerationReviewState({ report, overrides })
  const resolved = review.resolvedValues
  const missing = review.editableMissingFields

  return (
    <div className={styles.completeness}>
      {resolved.length > 0 ? (
        <div>
          <h3 className={styles.pickerHeading}>Uzupełnione ze zlecenia</h3>
          <ul className={styles.incompleteList}>
            {resolved.map((field) => (
              <li key={field.slotId} className={styles.incompleteItem}>
                <div>
                  <span className={styles.templateName}>{field.label}</span>
                  <span className={styles.templateMeta}>
                    {overrides[field.registryKey]?.trim() || field.value}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missing.length > 0 ? (
        <div>
          <h3 className={styles.pickerHeading}>Brakuje</h3>
          <div className={styles.tableWrap}>
            {missing.map((field) => (
              <label key={field.slotId} className={styles.fieldBlock}>
                <span className={styles.templateName}>{field.label}</span>
                <input
                  className={styles.missingInput}
                  type="text"
                  value={overrides[field.registryKey] ?? ''}
                  onChange={(e) => onOverride(field.registryKey, e.target.value)}
                  placeholder={field.label}
                  aria-label={field.label}
                />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.ok}>Wszystkie potrzebne dane są uzupełnione.</p>
      )}
    </div>
  )
}

function SavedStep({
  docxUrl,
  onPrintPdf,
}: {
  docxUrl: string | null
  onPrintPdf: () => void
}) {
  return (
    <div className={styles.saved}>
      <p className={styles.ok}>Umowa została zapisana.</p>
      <div className={styles.downloadRow}>
        {docxUrl ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              window.open(docxUrl, '_blank', 'noopener,noreferrer')
            }
          >
            Pobierz DOCX
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onPrintPdf}>
          Drukuj (starsza funkcja)
        </Button>
        <span className={styles.muted}>{PDF_EXPORT_UNAVAILABLE_MESSAGE}</span>
      </div>
    </div>
  )
}
