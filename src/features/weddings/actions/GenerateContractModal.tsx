import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
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
import {
  documentTemplateKeys,
  useDocumentTemplates,
} from '@/features/documents/hooks/useDocumentTemplates'
import { useInvalidateWedding } from '@/features/weddings/hooks/useInvalidateWedding'
import { weddingActionsService } from '@/lib/api/weddingActionsService'
import type { Wedding } from '@/types/wedding'
import styles from './GenerateContractModal.module.css'

type Step = 'template' | 'completeness' | 'editor' | 'saved'

interface GenerateContractModalProps {
  open: boolean
  onClose: () => void
  wedding: Wedding
}

export function GenerateContractModal({
  open,
  onClose,
  wedding,
}: GenerateContractModalProps) {
  const invalidate = useInvalidateWedding()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    data: templates = [],
    isLoading: templatesLoading,
    isError: templatesError,
    error: templatesQueryError,
    refetch: refetchTemplates,
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
  const [docxBytes, setDocxBytes] = useState<ArrayBuffer | null>(null)
  const [docxUrl, setDocxUrl] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep('template')
    setBusy(false)
    setError(null)
    setSelectedTemplateId(null)
    setReport(null)
    setOverrides({})
    setOmitted({})
    setGenerated(null)
    setParagraphs([])
    setDocxBytes(null)
    setDocxUrl(null)
    setPdfUrl(null)
    // Always refresh — analysis may have completed since last open
    void queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all })
    void refetchTemplates()
  }, [open, wedding.id, queryClient, refetchTemplates])

  async function runGenerate(input: {
    templateId: string
    overrides: Record<string, string>
    omittedKeys: string[]
    questionnaireAnswers?: Record<string, string>
  }) {
    const filled = await transformContract({
      wedding,
      templateId: input.templateId,
      overrides: input.overrides,
      omittedKeys: input.omittedKeys,
      questionnaireAnswers: input.questionnaireAnswers,
    })
    setGenerated(filled)
    setDocxBytes(filled.docxBytes)
    setParagraphs(filled.paragraphs.filter((p) => p.text.trim().length > 0))
    setStep('editor')
  }

  async function afterTemplateSelected(templateId: string) {
    setBusy(true)
    setError(null)
    setSelectedTemplateId(templateId)
    try {
      const next = await buildContractCompletenessReport({
        wedding,
        templateId,
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

  async function handleSave() {
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
      })

      await weddingActionsService.markContractGenerated(wedding.id, {
        missingFields: generated.omittedKeys,
        hadDocument: true,
      })
      await invalidate(wedding.id)

      setDocxUrl(saved.docxDownloadUrl)
      setPdfUrl(saved.pdfDownloadUrl)
      setStep('saved')
      showToast('Umowa zapisana (DOCX + PDF).', 'success')
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

  const description =
    step === 'template'
      ? 'Wybierz szablon. Dane pobierzemy automatycznie ze Ślubu, ankiet, pakietu i firmy.'
      : step === 'completeness'
        ? `Brakuje ${report?.missing.length ?? 0} ${
            (report?.missing.length ?? 0) === 1 ? 'wartości' : 'wartości'
          }. Reszta pochodzi z OurWed.`
        : step === 'editor'
          ? 'Podgląd po transformacji. Możesz poprawić tekst przed zapisem.'
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
          onClick={() => void handleSave()}
        >
          {busy ? 'Zapisywanie…' : 'Zapisz DOCX i PDF'}
        </Button>
      )
    }
    return (
      <Button type="button" variant="primary" onClick={onClose}>
        Zamknij
      </Button>
    )
  })()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generuj umowę"
      description={description}
      busy={busy}
      size="lg"
      primaryAction={primaryAction}
      cancelLabel={step === 'saved' ? 'Zamknij' : 'Anuluj'}
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
            navigate(`/ustawienia/dokumenty/szablony/${id}`)
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
        <EditorStep
          paragraphs={paragraphs}
          onChange={(index, text) =>
            setParagraphs((prev) =>
              prev.map((p) => (p.index === index ? { ...p, text } : p)),
            )
          }
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
                      ? ` · brakuje powiązania ${row.unresolvedSlotCount} ${
                          row.unresolvedSlotCount === 1 ? 'pola' : 'pól'
                        }`
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

function EditorStep({
  paragraphs,
  onChange,
}: {
  paragraphs: DocxParagraph[]
  onChange: (index: number, text: string) => void
}) {
  if (paragraphs.length === 0) {
    return (
      <p className={styles.muted}>
        Dokument nie zawiera edytowalnych akapitów tekstowych. Możesz zapisać
        wygenerowany DOCX bez zmian.
      </p>
    )
  }
  return (
    <div className={styles.editor}>
      {paragraphs.map((p) => (
        <textarea
          key={p.index}
          className={styles.paragraph}
          value={p.text}
          rows={Math.min(6, Math.max(2, Math.ceil(p.text.length / 72)))}
          onChange={(e) => onChange(p.index, e.target.value)}
        />
      ))}
    </div>
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
