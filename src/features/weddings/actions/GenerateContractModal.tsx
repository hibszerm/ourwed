import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import {
  applyDocxParagraphEdits,
  buildContractCompletenessReport,
  paragraphsToPrintHtml,
  printHtmlAsPdf,
  saveGeneratedContract,
  transformContract,
  type CompletenessField,
  type ContractCompletenessReport,
  type DocxParagraph,
  type TransformContractResult,
} from '@/features/documents/template'
import {
  classifyTemplatesForGeneration,
  splitRecommended,
  type TemplatePickerDiagnosis,
} from '@/features/documents/template/contractTemplatePicker'
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

  const classification = useMemo(
    () => classifyTemplatesForGeneration(templates),
    [templates],
  )

  const { recommended, other: otherSelectable } = useMemo(
    () =>
      splitRecommended(classification.selectable, wedding.packageName ?? null),
    [classification.selectable, wedding.packageName],
  )

  const [step, setStep] = useState<Step>('template')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  )
  const [report, setReport] = useState<ContractCompletenessReport | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [omitted, setOmitted] = useState<Record<string, boolean>>({})
  const [generated, setGenerated] = useState<TransformContractResult | null>(
    null,
  )
  const [paragraphs, setParagraphs] = useState<DocxParagraph[]>([])
  const [baselineParagraphs, setBaselineParagraphs] = useState<
    DocxParagraph[]
  >([])
  const [docxBytes, setDocxBytes] = useState<ArrayBuffer | null>(null)
  const [docxUrl, setDocxUrl] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(true)
  /** Created once per modal open / generation attempt — preview + export share it. */
  const [generationStartedAt, setGenerationStartedAt] = useState<Date | null>(
    null,
  )

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
    setOmitted({})
    setGenerated(null)
    setParagraphs([])
    setBaselineParagraphs([])
    setDocxBytes(null)
    setDocxUrl(null)
    setPdfUrl(null)
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
    templateId: string
    overrides: Record<string, string>
    omittedKeys: string[]
    questionnaireAnswers?: Record<string, string>
  }) {
    const startedAt = generationStartedAt ?? new Date()
    if (!generationStartedAt) setGenerationStartedAt(startedAt)

    const filled = await transformContract({
      wedding,
      templateId: input.templateId,
      overrides: input.overrides,
      omittedKeys: input.omittedKeys,
      questionnaireAnswers: input.questionnaireAnswers,
      generationDate: startedAt,
    })
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

      const next = await buildContractCompletenessReport({
        wedding,
        templateId,
        generationStartedAt: startedAt,
      })
      setReport(next)
      setOverrides({})
      setOmitted({})

      if (next.allComplete) {
        await runGenerate({
          templateId,
          overrides: {},
          omittedKeys: [],
          questionnaireAnswers: next.questionnaireAnswers,
        })
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
      const omittedKeys = Object.entries(omitted)
        .filter(([, v]) => v)
        .map(([k]) => k)

      for (const field of report.missing) {
        if (omitted[field.registryKey]) continue
        const value = overrides[field.registryKey]?.trim() ?? ''
        if (!value) {
          throw new Error(`Uzupełnij lub pomiń pole: ${field.label}`)
        }
      }

      await runGenerate({
        templateId: selectedTemplateId,
        overrides,
        omittedKeys,
        questionnaireAnswers: report.questionnaireAnswers,
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się wygenerować umowy.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function persistGenerated(includePdf: boolean) {
    if (!generated || !docxBytes) return
    setBusy(true)
    setError(null)
    try {
      const edited = await applyDocxParagraphEdits(
        docxBytes,
        paragraphs.map((p) => ({ index: p.index, text: p.text })),
      )
      setDocxBytes(edited)

      const saved = await saveGeneratedContract({
        weddingId: wedding.id,
        draftId: generated.draftId,
        templateId: generated.templateId,
        templateVersionId: generated.templateVersionId,
        versionNumber: generated.versionNumber,
        title: generated.title,
        docxBytes: edited,
        includePdf,
        executionSnapshot: generated.executionSnapshot,
      })

      await weddingActionsService.markContractGenerated(wedding.id, {
        missingFields: generated.omittedKeys,
        hadDocument: true,
      })
      await invalidate(wedding.id)

      setDocxUrl(saved.docxDownloadUrl)
      setPdfUrl(saved.pdfDownloadUrl)
      setBaselineParagraphs(paragraphs.map((p) => ({ ...p })))
      setStep('saved')
      showToast(
        includePdf ? 'Umowa zapisana (DOCX + PDF).' : 'Umowa zapisana (DOCX).',
        'success',
      )
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
          disabled={busy || !selectedTemplateId}
          onClick={() => {
            if (selectedTemplateId) void afterTemplateSelected(selectedTemplateId)
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
          onClick={() => void persistGenerated(true)}
        >
          {busy ? 'Zapisywanie…' : 'Zapisz DOCX i PDF'}
        </Button>
      )
    }
    return (
      <Button type="button" variant="primary" onClick={requestClose}>
        Zamknij
      </Button>
    )
  })()

  const secondaryAction =
    step === 'editor' ? (
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => void persistGenerated(false)}
      >
        Zapisz tylko DOCX
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
          selectedId={selectedTemplateId}
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
          omitted={omitted}
          onOverride={(key, value) =>
            setOverrides((prev) => ({ ...prev, [key]: value }))
          }
          onOmit={(key, value) =>
            setOmitted((prev) => ({ ...prev, [key]: value }))
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
          pdfUrl={pdfUrl}
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
                    Status: {row.template.status}
                    {row.unresolvedSlotCount > 0
                      ? ` · ${row.unresolvedSlotCount} wymaganych bez powiązania`
                      : ''}
                  </span>
                  <span className={styles.templateMeta}>{row.reason}</span>
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
          Prześlij kontrakt w module Dokumenty → Szablony umów i uruchom analizę.
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
  omitted,
  onOverride,
  onOmit,
}: {
  report: ContractCompletenessReport
  overrides: Record<string, string>
  omitted: Record<string, boolean>
  onOverride: (key: string, value: string) => void
  onOmit: (key: string, value: boolean) => void
}) {
  const resolvedCount = report.fields.length - report.missing.length

  return (
    <div className={styles.completeness}>
      <p className={styles.ok}>
        Automatycznie uzupełniono {resolvedCount} z {report.fields.length}{' '}
        zmiennych z OurWed.
      </p>

      {report.fields.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.varTable}>
            <thead>
              <tr>
                <th>Zmienna</th>
                <th>Źródło</th>
                <th>Status</th>
                <th>Wartość</th>
              </tr>
            </thead>
            <tbody>
              {report.fields.map((field) => (
                <VariableRow
                  key={field.slotId}
                  field={field}
                  override={overrides[field.registryKey] ?? ''}
                  omit={Boolean(omitted[field.registryKey])}
                  onOverride={onOverride}
                  onOmit={onOmit}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function VariableRow({
  field,
  override,
  omit,
  onOverride,
  onOmit,
}: {
  field: CompletenessField
  override: string
  omit: boolean
  onOverride: (key: string, value: string) => void
  onOmit: (key: string, value: boolean) => void
}) {
  if (!field.missing) {
    return (
      <tr>
        <td>{field.label}</td>
        <td>{field.sourceLabel}</td>
        <td className={styles.statusOk}>✓</td>
        <td>{field.value}</td>
      </tr>
    )
  }

  return (
    <tr className={styles.rowMissing}>
      <td>{field.label}</td>
      <td>{field.sourceLabel}</td>
      <td>Brak</td>
      <td>
        <input
          className={styles.missingInput}
          type="text"
          value={override}
          disabled={omit}
          onChange={(e) => onOverride(field.registryKey, e.target.value)}
          placeholder="Wpisz wartość"
          aria-label={field.label}
        />
        <label className={styles.omitLabel}>
          <input
            type="checkbox"
            checked={omit}
            onChange={(e) => onOmit(field.registryKey, e.target.checked)}
          />
          Pomiń
        </label>
      </td>
    </tr>
  )
}

function SavedStep({
  docxUrl,
  pdfUrl,
  onPrintPdf,
}: {
  docxUrl: string | null
  pdfUrl: string | null
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
          Drukuj / Zapisz PDF
        </Button>
        {pdfUrl ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
          >
            Otwórz podgląd HTML
          </Button>
        ) : null}
      </div>
    </div>
  )
}
