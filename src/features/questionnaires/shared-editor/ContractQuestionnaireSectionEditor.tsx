/**
 * Contract Questionnaire section editor — same product pattern as Pre-Wedding.
 * Persists to studio_details.questionnaire_config via blocks adapter.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { LocalReadOnlyNotice } from '@/features/billing/LocalReadOnlyNotice'
import { companyDetailsService } from '@/lib/api/companyDetailsService'
import { packageService } from '@/lib/api/packageService'
import { extraServiceService } from '@/lib/api/extraServiceService'
import { syncLegacyFieldsFromBlocks } from '@/lib/forms/questionnaireBlocks'
import { normalizeContractQuestionnaireConfig } from '@/lib/forms/contractQuestionnaireSnapshot'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { formEngine } from '@/lib/forms/formEngine'
import type { AnswerValue } from '@/types/form'
import {
  groupQuestionsIntoSections,
  isFullWidthQuestion,
  isLocationsSection,
} from '@/features/forms/formSections'
import { QuestionField } from '@/features/forms/QuestionField'
import type { ContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import {
  blocksToEditorSections,
  CONTRACT_ADDABLE_TYPES,
  CONTRACT_FIELD_TYPE_LABELS,
  createEditorQuestion,
  createEditorSection,
  editorSectionsToBlocks,
  friendlyContractTypeLabel,
  type ContractAddableType,
  type ContractEditorQuestion,
  type ContractEditorSection,
} from '@/features/questionnaires/shared-editor/contractBlocksAdapter'
import editorStyles from '@/pages/PreWeddingTemplatesPage.module.css'
import publicStyles from '@/features/forms/FormPublicPage.module.css'

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

function QuestionRow({
  question,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  defaultExpanded,
  readOnly,
}: {
  question: ContractEditorQuestion
  onChange: (q: ContractEditorQuestion) => void
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  defaultExpanded?: boolean
  readOnly?: boolean
}) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded))
  const [sawDefaultExpanded, setSawDefaultExpanded] = useState(
    Boolean(defaultExpanded),
  )
  const labelRef = useRef<HTMLInputElement>(null)

  // Adjust expand when focus moves onto this row (prop change during render).
  if (defaultExpanded && !sawDefaultExpanded) {
    setSawDefaultExpanded(true)
    setExpanded(true)
  } else if (!defaultExpanded && sawDefaultExpanded) {
    setSawDefaultExpanded(false)
  }

  useEffect(() => {
    if (!defaultExpanded) return
    const id = requestAnimationFrame(() => labelRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [defaultExpanded])

  return (
    <div
      className={editorStyles.questionEditor}
      data-testid={`contract-question-${question.id}`}
    >
      <div className={editorStyles.questionEditorHeader}>
        <div className={editorStyles.questionEditorMoveControls}>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={readOnly || !onMoveUp}
            className={editorStyles.moveBtn}
            aria-label="Przesuń w górę"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={readOnly || !onMoveDown}
            className={editorStyles.moveBtn}
            aria-label="Przesuń w dół"
          >
            ↓
          </button>
        </div>
        <button
          type="button"
          className={editorStyles.questionCollapseBtn}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className={editorStyles.questionLabelPreview}>
            {question.label || '(bez etykiety)'}
          </span>
          <span className={editorStyles.questionTypeBadge}>
            {question.editorType === 'system_field'
              ? 'Pole systemowe'
              : `${friendlyContractTypeLabel(question.editorType)}${
                  question.systemBadge ? ' · Pole systemowe' : ''
                }`}
          </span>
          <span className={editorStyles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </button>
        {question.protected || readOnly ? (
          <button
            type="button"
            className={editorStyles.deleteBtn}
            disabled
            title={
              readOnly
                ? 'Tryb tylko do odczytu'
                : 'To pole jest potrzebne do przygotowania umowy i nie może zostać usunięte.'
            }
            aria-label={
              readOnly
                ? 'Tryb tylko do odczytu — nie można usunąć'
                : 'Pole chronione — nie można usunąć'
            }
          >
            ×
          </button>
        ) : (
          <button
            type="button"
            className={editorStyles.deleteBtn}
            onClick={onDelete}
            aria-label="Usuń pytanie"
          >
            ×
          </button>
        )}
      </div>

      {expanded ? (
        <div className={editorStyles.questionEditorBody}>
          {question.systemBadge ? (
            <p className={editorStyles.instanceNote}>
              To pole jest wykorzystywane podczas przygotowania umowy.
            </p>
          ) : null}

          <div className={editorStyles.fieldRow}>
            <label className={editorStyles.fieldLabel}>Etykieta pytania</label>
            <input
              ref={labelRef}
              type="text"
              className={editorStyles.fieldInput}
              value={question.label}
              readOnly={readOnly}
              onChange={(e) => onChange({ ...question, label: e.target.value })}
              data-testid="question-label-input"
            />
          </div>

          <div className={editorStyles.fieldRow}>
            <label className={editorStyles.fieldLabel}>Typ pola</label>
            <select
              className={editorStyles.fieldSelect}
              value={question.editorType}
              disabled={readOnly || question.typeLocked}
              onChange={(e) =>
                onChange({ ...question, editorType: e.target.value })
              }
              data-testid="question-type-select"
            >
              {question.typeLocked ? (
                <option value={question.editorType}>
                  {friendlyContractTypeLabel(question.editorType)}
                </option>
              ) : (
                CONTRACT_ADDABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONTRACT_FIELD_TYPE_LABELS[t]}
                  </option>
                ))
              )}
            </select>
          </div>

          {question.editorType !== 'information' ? (
            <div className={editorStyles.fieldRowInline}>
              <label className={editorStyles.fieldLabel}>
                <input
                  type="checkbox"
                  checked={question.required}
                  disabled={readOnly}
                  onChange={(e) =>
                    onChange({ ...question, required: e.target.checked })
                  }
                  data-testid="question-required-checkbox"
                />{' '}
                Wymagane
              </label>
            </div>
          ) : null}

          {(question.editorType === 'single_choice' ||
            question.editorType === 'multiple_choice') && (
            <div className={editorStyles.fieldRow}>
              <label className={editorStyles.fieldLabel}>Opcje odpowiedzi</label>
              <textarea
                className={editorStyles.fieldTextarea}
                rows={4}
                value={question.optionLabels.join('\n')}
                readOnly={readOnly}
                onChange={(e) =>
                  onChange({
                    ...question,
                    optionLabels: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                data-testid="question-options-textarea"
              />
            </div>
          )}

          <div className={editorStyles.fieldRow}>
            <label className={editorStyles.fieldLabel}>Tekst pomocniczy</label>
            <input
              type="text"
              className={editorStyles.fieldInput}
              value={question.helpText}
              readOnly={readOnly}
              onChange={(e) =>
                onChange({ ...question, helpText: e.target.value })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SectionCard({
  section,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  focusQuestionId,
  readOnly,
}: {
  section: ContractEditorSection
  onChange: (s: ContractEditorSection) => void
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  focusQuestionId?: string | null
  readOnly?: boolean
}) {
  const [addOpen, setAddOpen] = useState(false)

  function updateQuestion(qi: number, q: ContractEditorQuestion) {
    if (readOnly) return
    const questions = [...section.questions]
    questions[qi] = q
    onChange({ ...section, questions })
  }

  function addQuestion(type: ContractAddableType) {
    if (readOnly) return
    const q = createEditorQuestion(type)
    onChange({ ...section, questions: [...section.questions, q] })
    setAddOpen(false)
  }

  return (
    <div
      className={editorStyles.sectionEditor}
      data-testid={`contract-section-${section.id}`}
    >
      <div className={editorStyles.sectionEditorHeader}>
        <div className={editorStyles.sectionMoveControls}>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={readOnly || !onMoveUp}
            className={editorStyles.moveBtn}
            aria-label="Przesuń sekcję w górę"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={readOnly || !onMoveDown}
            className={editorStyles.moveBtn}
            aria-label="Przesuń sekcję w dół"
          >
            ↓
          </button>
        </div>
        <input
          type="text"
          className={editorStyles.sectionTitleInput}
          value={section.title}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
          placeholder="Nazwa sekcji"
          data-testid="section-title-input"
        />
        {section.questions.some((q) => q.protected) || readOnly ? (
          <button
            type="button"
            className={editorStyles.deleteBtn}
            disabled
            title={
              readOnly
                ? 'Tryb tylko do odczytu'
                : 'Sekcja zawiera pola potrzebne do umowy.'
            }
            aria-label={
              readOnly ? 'Tryb tylko do odczytu' : 'Sekcja chroniona'
            }
          >
            ×
          </button>
        ) : (
          <button
            type="button"
            className={editorStyles.deleteBtn}
            onClick={onDelete}
            aria-label="Usuń sekcję"
          >
            ×
          </button>
        )}
      </div>

      <div className={editorStyles.sectionQuestions}>
        {section.questions.map((q, qi) => (
          <QuestionRow
            key={q.id}
            question={q}
            readOnly={readOnly}
            defaultExpanded={focusQuestionId === q.id}
            onChange={(updated) => updateQuestion(qi, updated)}
            onDelete={() => {
              if (readOnly || q.protected) return
              onChange({
                ...section,
                questions: section.questions.filter((_, i) => i !== qi),
              })
            }}
            onMoveUp={
              !readOnly && qi > 0
                ? () => {
                    const questions = [...section.questions]
                    ;[questions[qi - 1], questions[qi]] = [
                      questions[qi]!,
                      questions[qi - 1]!,
                    ]
                    onChange({ ...section, questions })
                  }
                : undefined
            }
            onMoveDown={
              !readOnly && qi < section.questions.length - 1
                ? () => {
                    const questions = [...section.questions]
                    ;[questions[qi], questions[qi + 1]] = [
                      questions[qi + 1]!,
                      questions[qi]!,
                    ]
                    onChange({ ...section, questions })
                  }
                : undefined
            }
          />
        ))}
      </div>

      {!readOnly ? (
        <div className={editorStyles.moreWrap}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAddOpen((v) => !v)}
            data-testid="add-question-btn"
          >
            + Dodaj pytanie
          </Button>
          {addOpen ? (
            <div className={editorStyles.menu} role="menu">
              {CONTRACT_ADDABLE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="menuitem"
                  onClick={() => addQuestion(t)}
                >
                  {CONTRACT_FIELD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ContractPreview({
  config,
  packages,
  extras,
}: {
  config: ContractQuestionnaireConfig
  packages: Array<{ id: string; name: string }>
  extras: Array<{ id: string; name: string }>
}) {
  const template = buildContractQuestionnaireTemplate({
    packages,
    additionalServices: extras,
    config,
  })
  const [values, setValues] = useState<Record<string, AnswerValue>>({})
  const sections = groupQuestionsIntoSections(template.questions)

  return (
    <div className={publicStyles.shell} data-testid="questionnaire-preview">
      <header className={publicStyles.header}>
        <p className={publicStyles.eyebrow}>Podgląd — nie zapisuje odpowiedzi</p>
        <h2 className={publicStyles.title}>{template.title}</h2>
        <p className={publicStyles.lead}>{template.description}</p>
      </header>
      <div className={publicStyles.form}>
        {sections.map((section) => (
          <section key={section.id} className={publicStyles.card}>
            {section.title ? (
              <h3 className={publicStyles.cardTitle}>{section.title}</h3>
            ) : null}
            <div
              className={
                isLocationsSection(section)
                  ? publicStyles.cardBodyStack
                  : publicStyles.cardBodyGrid
              }
            >
              {section.questions
                .filter((q) => !formEngine.isDisplayQuestion(q))
                .map((question) => (
                  <div
                    key={question.id}
                    className={
                      isFullWidthQuestion(question)
                        ? publicStyles.fullWidth
                        : undefined
                    }
                  >
                    <QuestionField
                      question={question}
                      value={values[question.id] ?? ''}
                      onChange={(v) =>
                        setValues((prev) => ({ ...prev, [question.id]: v }))
                      }
                    />
                  </div>
                ))}
            </div>
          </section>
        ))}
        <div className={publicStyles.actions}>
          <Button type="button" variant="primary" disabled>
            {template.submitLabel} (podgląd)
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ContractQuestionnaireSectionEditor({
  initialConfig,
  dataUpdatedAt,
  readOnly = false,
}: {
  initialConfig?: ContractQuestionnaireConfig | null
  dataUpdatedAt?: number
  readOnly?: boolean
}) {
  const navigate = useNavigate()
  const { requirePro } = useProAccessGate()
  const [hydratedAt, setHydratedAt] = useState(dataUpdatedAt)
  const [config, setConfig] = useState(() =>
    normalizeContractQuestionnaireConfig(initialConfig ?? null),
  )
  const [sections, setSections] = useState(() =>
    blocksToEditorSections(config.blocks ?? []),
  )
  const [internalName, setInternalName] = useState('Domyślna ankieta do umowy')
  const [clientTitle, setClientTitle] = useState(
    config.questionnaireTitle || 'Dane potrzebne do przygotowania umowy',
  )
  const [introduction, setIntroduction] = useState(config.greeting ?? '')
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null)
  const [catalogPackages, setCatalogPackages] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [catalogExtras, setCatalogExtras] = useState<
    Array<{ id: string; name: string }>
  >([])

  const dirtyRef = useRef(false)

  // Re-hydrate from query only when the source revision changes and the user
  // has no unsaved edits (React “adjust state when props change” pattern).
  if (dataUpdatedAt !== hydratedAt && !dirty) {
    const next = normalizeContractQuestionnaireConfig(initialConfig ?? null)
    setHydratedAt(dataUpdatedAt)
    setConfig(next)
    setSections(blocksToEditorSections(next.blocks ?? []))
    setClientTitle(
      next.questionnaireTitle || 'Dane potrzebne do przygotowania umowy',
    )
    setIntroduction(next.greeting ?? '')
    setDirty(false)
    setSaveStatus('idle')
  }

  useEffect(() => {
    void (async () => {
      try {
        const [pkgs, extras] = await Promise.all([
          packageService.list({ activeOnly: true }),
          extraServiceService.list({ activeOnly: true }),
        ])
        setCatalogPackages(pkgs.map((p) => ({ id: p.id, name: p.name })))
        setCatalogExtras(extras.map((e) => ({ id: e.id, name: e.name })))
      } catch {
        setCatalogPackages([])
        setCatalogExtras([])
      }
    })()
  }, [])

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function markDirty(nextSections: ContractEditorSection[]) {
    if (readOnly) return
    dirtyRef.current = true
    setDirty(true)
    setSaveStatus('dirty')
    setSections(nextSections)
    const blocks = editorSectionsToBlocks(nextSections, config.blocks ?? [], {
      greeting: introduction,
      footer: config.footerText,
    })
    setConfig((prev) => ({
      ...prev,
      greeting: introduction,
      questionnaireTitle: clientTitle,
      blocks,
    }))
  }

  async function persist() {
    if (
      readOnly ||
      !requirePro(undefined, { actionKey: 'edit_questionnaire_template' })
    ) {
      return
    }
    const blocks = editorSectionsToBlocks(sections, config.blocks ?? [], {
      greeting: introduction,
      footer: config.footerText,
    })
    const nextConfig: ContractQuestionnaireConfig = {
      ...config,
      greeting: introduction,
      questionnaireTitle: clientTitle,
      blocks,
    }
    const snapshot = syncLegacyFieldsFromBlocks(nextConfig)
    setSaveStatus('saving')
    setSaveError(null)
    try {
      await companyDetailsService.upsert({ questionnaireConfig: snapshot })
      dirtyRef.current = false
      setDirty(false)
      setConfig(snapshot)
      setSaveStatus('saved')
    } catch (err) {
      setSaveStatus('error')
      setSaveError(
        err instanceof Error ? err.message : 'Nie udało się zapisać ankiety',
      )
    }
  }

  const statusLabel =
    saveStatus === 'saving'
      ? 'Zapisywanie…'
      : saveStatus === 'saved' && !dirty
        ? 'Zapisano'
        : saveStatus === 'error'
          ? 'Błąd zapisu'
          : dirty
            ? 'Niezapisane zmiany'
            : 'Zapisano'

  const saveUi =
    saveStatus === 'saving'
      ? {
          state: 'saving' as const,
          label: 'Zapisywanie…',
          showPrimarySave: true,
          disabled: true,
        }
      : dirty || saveStatus === 'error'
        ? {
            state: (saveStatus === 'error' && !dirty
              ? 'error'
              : 'dirty') as 'dirty' | 'error',
            label: 'Zapisz',
            showPrimarySave: true,
            disabled: false,
          }
        : {
            state: 'saved' as const,
            label: 'Zapisano',
            showPrimarySave: false,
            disabled: true,
          }

  const previewConfig: ContractQuestionnaireConfig = {
    ...config,
    greeting: introduction,
    questionnaireTitle: clientTitle,
    blocks: editorSectionsToBlocks(sections, config.blocks ?? [], {
      greeting: introduction,
      footer: config.footerText,
    }),
  }

  return (
    <div
      className={editorStyles.page}
      data-testid="contract-section-editor"
    >
      <div className={editorStyles.templateEditor}>
        <div className={editorStyles.editorHeader}>
          <div className={editorStyles.editorHeaderIdentity}>
            <button
              type="button"
              className={editorStyles.backLink}
              onClick={() => navigate('/ankiety')}
              data-testid="back-to-library"
            >
              ← Ankiety
            </button>
            <h2 className={editorStyles.editorTitle}>{internalName}</h2>
            <p className={editorStyles.editorType}>Do umowy</p>
          </div>
          <div className={editorStyles.editorHeaderActions}>
            <div className={editorStyles.editorSecondaryActions}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate('/ankiety')}
              >
                Anuluj
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPreviewOpen(true)}
              >
                Podgląd
              </Button>
            </div>
            {saveUi.showPrimarySave ? (
              <Button
                size="sm"
                variant="primary"
                disabled={saveUi.disabled}
                className={editorStyles.editorPrimarySave}
                onClick={() => {
                  requirePro(
                    () => void persist(),
                    { actionKey: 'edit_questionnaire_template' },
                  )
                }}
                data-testid="save-template-btn"
                data-save-state={saveUi.state}
              >
                {saveUi.label}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled
                className={`${editorStyles.savedAction} ${editorStyles.editorPrimarySave}`}
                data-testid="questionnaire-save-status"
                data-status={saveUi.state}
                data-save-state={saveUi.state}
                aria-live="polite"
              >
                {saveUi.label}
              </Button>
            )}
            {saveUi.showPrimarySave && saveStatus === 'error' ? (
              <span
                className={editorStyles.muted}
                data-testid="questionnaire-save-error-hint"
                role="status"
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
        </div>

        <LocalReadOnlyNotice visible={readOnly} />

        {saveError ? (
          <p className={editorStyles.errorList} role="alert">
            {saveError}
          </p>
        ) : null}

        <div className={editorStyles.editorSection}>
          <h3 className={editorStyles.editorSectionTitle}>Ustawienia szablonu</h3>
          <div className={editorStyles.fieldRow}>
            <label className={editorStyles.fieldLabel}>Nazwa wewnętrzna</label>
            <input
              type="text"
              className={editorStyles.fieldInput}
              value={internalName}
              readOnly={readOnly}
              onChange={(e) => {
                if (readOnly) return
                setInternalName(e.target.value)
                dirtyRef.current = true
                setDirty(true)
                setSaveStatus('dirty')
              }}
              data-testid="template-name-input"
            />
          </div>
          <div className={editorStyles.fieldRow}>
            <label className={editorStyles.fieldLabel}>
              Tytuł widoczny dla pary
            </label>
            <input
              type="text"
              className={editorStyles.fieldInput}
              value={clientTitle}
              readOnly={readOnly}
              onChange={(e) => {
                if (readOnly) return
                setClientTitle(e.target.value)
                dirtyRef.current = true
                setDirty(true)
                setSaveStatus('dirty')
              }}
              data-testid="template-title-input"
            />
          </div>
          <div className={editorStyles.fieldRow}>
            <label className={editorStyles.fieldLabel}>Wprowadzenie</label>
            <textarea
              className={editorStyles.fieldTextarea}
              rows={4}
              value={introduction}
              readOnly={readOnly}
              onChange={(e) => {
                if (readOnly) return
                setIntroduction(e.target.value)
                dirtyRef.current = true
                setDirty(true)
                setSaveStatus('dirty')
              }}
              data-testid="template-intro-input"
            />
          </div>
        </div>

        <div className={editorStyles.editorSection}>
          <h3 className={editorStyles.editorSectionTitle}>Sekcje i pytania</h3>
          <p className={editorStyles.instanceNote}>
            Zmiany dotyczą nowo wysyłanych ankiet. Istniejące odpowiedzi par
            pozostają bez zmian.
          </p>

          {sections.map((section, si) => (
            <SectionCard
              key={section.id}
              section={section}
              readOnly={readOnly}
              focusQuestionId={focusQuestionId}
              onChange={(updated) => {
                const next = [...sections]
                next[si] = updated
                const lastQ = updated.questions[updated.questions.length - 1]
                if (
                  lastQ &&
                  updated.questions.length > (section.questions.length ?? 0)
                ) {
                  setFocusQuestionId(lastQ.id)
                }
                markDirty(next)
              }}
              onDelete={() => {
                if (readOnly || section.questions.some((q) => q.protected)) return
                markDirty(sections.filter((_, i) => i !== si))
              }}
              onMoveUp={
                !readOnly && si > 0
                  ? () => {
                      const next = [...sections]
                      ;[next[si - 1], next[si]] = [next[si]!, next[si - 1]!]
                      markDirty(next)
                    }
                  : undefined
              }
              onMoveDown={
                !readOnly && si < sections.length - 1
                  ? () => {
                      const next = [...sections]
                      ;[next[si], next[si + 1]] = [next[si + 1]!, next[si]!]
                      markDirty(next)
                    }
                  : undefined
              }
            />
          ))}

          {!readOnly ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                markDirty([...sections, createEditorSection()])
              }}
              data-testid="add-section-btn"
            >
              + Dodaj sekcję
            </Button>
          ) : null}
        </div>
      </div>

        <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Podgląd ankiety"
        size="lg"
        hideFooter
        showClose
      >
        <ContractPreview
          config={previewConfig}
          packages={catalogPackages}
          extras={catalogExtras}
        />
      </Modal>
    </div>
  )
}
