import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { LocalReadOnlyNotice } from '@/features/billing/LocalReadOnlyNotice'
import {
  QUESTIONNAIRE_TEMPLATES_QUERY_KEY,
  questionnaireTemplateService,
} from '@/lib/api/preweddingQuestionnaireService'
import { validateQuestionnaireTemplate } from '@/features/prewedding/validateQuestionnaireTemplate'
import { PREWEDDING_FIELD_TYPE_LABELS } from '@/types/preweddingQuestionnaire'
import type {
  QuestionnaireTemplate,
  PreWeddingSection,
  PreWeddingQuestion,
  PreWeddingFieldType,
  PreWeddingTemplateSchema,
} from '@/types/preweddingQuestionnaire'
import styles from './PreWeddingTemplatesPage.module.css'

// ---------------------------------------------------------------------------
// Template list
// ---------------------------------------------------------------------------

function TemplateList({
  templates,
  onSelect,
  onNew,
  onDuplicate,
  onArchive,
  onSetDefault,
  selectedId,
}: {
  templates: QuestionnaireTemplate[]
  onSelect: (t: QuestionnaireTemplate) => void
  onNew: () => void
  onDuplicate: (t: QuestionnaireTemplate) => void
  onArchive: (t: QuestionnaireTemplate) => void
  onSetDefault: (t: QuestionnaireTemplate) => void
  selectedId?: string
}) {
  const active = templates.filter((t) => !t.isArchived)
  const archived = templates.filter((t) => t.isArchived)

  return (
    <div className={styles.templateList}>
      <div className={styles.listHeader}>
        <h2 className={styles.listTitle}>Szablony ankiet</h2>
        <Button size="sm" variant="primary" onClick={onNew} data-testid="new-template-btn">
          + Nowy szablon
        </Button>
      </div>

      {active.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`${styles.templateItem} ${selectedId === t.id ? styles.templateItemActive : ''}`}
          onClick={() => onSelect(t)}
          data-testid={`template-item-${t.id}`}
        >
          <div className={styles.templateItemName}>
            {t.name}
            {t.isDefault && (
              <span className={styles.defaultBadge} data-testid="default-badge">
                Domyślny
              </span>
            )}
          </div>
          <div className={styles.templateItemMeta}>v{t.version}</div>
          <div className={styles.templateItemActions}>
            {!t.isDefault && (
              <button
                type="button"
                className={styles.actionLink}
                onClick={(e) => { e.stopPropagation(); onSetDefault(t) }}
              >
                Ustaw domyślny
              </button>
            )}
            <button
              type="button"
              className={styles.actionLink}
              onClick={(e) => { e.stopPropagation(); onDuplicate(t) }}
            >
              Duplikuj
            </button>
            <button
              type="button"
              className={`${styles.actionLink} ${styles.actionLinkDanger}`}
              onClick={(e) => { e.stopPropagation(); onArchive(t) }}
            >
              Archiwizuj
            </button>
          </div>
        </button>
      ))}

      {archived.length > 0 && (
        <details className={styles.archivedSection}>
          <summary className={styles.archivedSummary}>
            Zarchiwizowane ({archived.length})
          </summary>
          {archived.map((t) => (
            <div key={t.id} className={`${styles.templateItem} ${styles.templateItemArchived}`}>
              <span className={styles.templateItemName}>{t.name}</span>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Question editor row
// ---------------------------------------------------------------------------

function QuestionEditor({
  question,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  question: PreWeddingQuestion
  onChange: (q: PreWeddingQuestion) => void
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={styles.questionEditor} data-testid={`question-editor-${question.id}`}>
      <div className={styles.questionEditorHeader}>
        <div className={styles.questionEditorMoveControls}>
          <button type="button" onClick={onMoveUp} disabled={!onMoveUp} className={styles.moveBtn} aria-label="Przesuń w górę">↑</button>
          <button type="button" onClick={onMoveDown} disabled={!onMoveDown} className={styles.moveBtn} aria-label="Przesuń w dół">↓</button>
        </div>
        <button type="button" className={styles.questionCollapseBtn} onClick={() => setExpanded(!expanded)}>
          <span className={styles.questionLabelPreview}>
            {question.label || '(bez etykiety)'}
          </span>
          <span className={styles.questionTypeBadge}>{PREWEDDING_FIELD_TYPE_LABELS[question.type]}</span>
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </button>
        <button type="button" className={styles.deleteBtn} onClick={onDelete} aria-label="Usuń pytanie">×</button>
      </div>

      {expanded && (
        <div className={styles.questionEditorBody}>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Etykieta pytania</label>
            <input
              type="text"
              className={styles.fieldInput}
              value={question.label}
              onChange={(e) => onChange({ ...question, label: e.target.value })}
              data-testid="question-label-input"
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Typ pola</label>
            <select
              className={styles.fieldSelect}
              value={question.type}
              onChange={(e) =>
                onChange({ ...question, type: e.target.value as PreWeddingFieldType })
              }
              data-testid="question-type-select"
            >
              {(Object.keys(PREWEDDING_FIELD_TYPE_LABELS) as PreWeddingFieldType[]).map((t) => (
                <option key={t} value={t}>
                  {PREWEDDING_FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.fieldRowInline}>
            <label className={styles.fieldLabel}>
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => onChange({ ...question, required: e.target.checked })}
                data-testid="question-required-checkbox"
              />{' '}
              Wymagane
            </label>
          </div>

          {(question.type === 'single_choice' || question.type === 'multiple_choice' || question.type === 'yes_no') && (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Opcje (jedna na linię)</label>
              <textarea
                className={styles.fieldTextarea}
                rows={4}
                value={(question.options ?? []).join('\n')}
                onChange={(e) =>
                  onChange({
                    ...question,
                    options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                  })
                }
                data-testid="question-options-textarea"
              />
            </div>
          )}

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Tekst pomocniczy</label>
            <input
              type="text"
              className={styles.fieldInput}
              value={question.helpText ?? ''}
              onChange={(e) => onChange({ ...question, helpText: e.target.value || undefined })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section editor
// ---------------------------------------------------------------------------

function SectionEditor({
  section,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddQuestion,
}: {
  section: PreWeddingSection
  onChange: (s: PreWeddingSection) => void
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onAddQuestion: () => void
}) {
  const { requirePro } = useProAccessGate()

  function mutateStructure(fn: () => void) {
    requirePro(fn, { actionKey: 'edit_questionnaire_template' })
  }

  return (
    <div className={styles.sectionEditor} data-testid={`section-editor-${section.id}`}>
      <div className={styles.sectionEditorHeader}>
        <div className={styles.sectionMoveControls}>
          <button type="button" onClick={onMoveUp} disabled={!onMoveUp} className={styles.moveBtn} aria-label="Przesuń sekcję w górę">↑</button>
          <button type="button" onClick={onMoveDown} disabled={!onMoveDown} className={styles.moveBtn} aria-label="Przesuń sekcję w dół">↓</button>
        </div>
        <input
          type="text"
          className={styles.sectionTitleInput}
          value={section.title}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
          placeholder="Nazwa sekcji"
          data-testid="section-title-input"
        />
        <button type="button" className={styles.deleteBtn} onClick={onDelete} aria-label="Usuń sekcję">×</button>
      </div>

      <div className={styles.sectionQuestions}>
        {section.questions.map((q, qi) => (
          <QuestionEditor
            key={q.id}
            question={q}
            onChange={(updated) => {
              const questions = [...section.questions]
              questions[qi] = updated
              onChange({ ...section, questions })
            }}
            onDelete={() => {
              mutateStructure(() => {
                const questions = section.questions.filter((_, i) => i !== qi)
                onChange({ ...section, questions })
              })
            }}
            onMoveUp={qi > 0 ? () => {
              mutateStructure(() => {
                const questions = [...section.questions]
                ;[questions[qi - 1], questions[qi]] = [questions[qi], questions[qi - 1]]
                onChange({ ...section, questions })
              })
            } : undefined}
            onMoveDown={qi < section.questions.length - 1 ? () => {
              mutateStructure(() => {
                const questions = [...section.questions]
                ;[questions[qi], questions[qi + 1]] = [questions[qi + 1], questions[qi]]
                onChange({ ...section, questions })
              })
            } : undefined}
          />
        ))}
      </div>

      <Button size="sm" variant="ghost" onClick={onAddQuestion} data-testid="add-question-btn">
        + Dodaj pytanie
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template editor
// ---------------------------------------------------------------------------

function newQuestion(): PreWeddingQuestion {
  return {
    id: `q_${Date.now()}`,
    label: '',
    type: 'short_text',
    required: false,
  }
}

function newSection(): PreWeddingSection {
  return {
    id: `s_${Date.now()}`,
    title: 'Nowa sekcja',
    questions: [],
  }
}

function TemplateEditor({
  template,
  onSave,
  onSaveAsNew,
  onCancel,
  onBackToLibrary,
  saving,
}: {
  template: QuestionnaireTemplate | null
  onSave: (
    name: string,
    title: string,
    introduction: string,
    schema: PreWeddingTemplateSchema,
  ) => void
  onSaveAsNew?: (
    name: string,
    title: string,
    introduction: string,
    schema: PreWeddingTemplateSchema,
  ) => void
  onCancel: () => void
  onBackToLibrary?: () => void
  saving: boolean
}) {
  const { requirePro, isReadOnly } = useProAccessGate()
  const [name, setName] = useState(template?.name ?? '')
  const [title, setTitle] = useState(template?.title ?? '')
  const [introduction, setIntroduction] = useState(template?.introduction ?? '')
  const [schema, setSchema] = useState<PreWeddingTemplateSchema>(
    template?.schema ?? { sections: [] },
  )
  const [errors, setErrors] = useState<string[]>([])
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    setName(template?.name ?? '')
    setTitle(template?.title ?? '')
    setIntroduction(template?.introduction ?? '')
    setSchema(template?.schema ?? { sections: [] })
    setErrors([])
  }, [template?.id])

  function updateSection(idx: number, updated: PreWeddingSection) {
    const sections = [...schema.sections]
    sections[idx] = updated
    setSchema({ ...schema, sections })
  }

  function deleteSection(idx: number) {
    requirePro(
      () => {
        setSchema({ ...schema, sections: schema.sections.filter((_, i) => i !== idx) })
      },
      { actionKey: 'edit_questionnaire_template' },
    )
  }

  function addSection() {
    requirePro(
      () => {
        setSchema({ ...schema, sections: [...schema.sections, newSection()] })
      },
      { actionKey: 'edit_questionnaire_template' },
    )
  }

  function moveSectionUp(idx: number) {
    if (idx === 0) return
    requirePro(
      () => {
        const sections = [...schema.sections]
        ;[sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]]
        setSchema({ ...schema, sections })
      },
      { actionKey: 'edit_questionnaire_template' },
    )
  }

  function moveSectionDown(idx: number) {
    if (idx >= schema.sections.length - 1) return
    requirePro(
      () => {
        const sections = [...schema.sections]
        ;[sections[idx], sections[idx + 1]] = [sections[idx + 1], sections[idx]]
        setSchema({ ...schema, sections })
      },
      { actionKey: 'edit_questionnaire_template' },
    )
  }

  function trySave() {
    requirePro(
      () => {
        const nextErrors = validateQuestionnaireTemplate({ name, title, schema })
        setErrors(nextErrors)
        if (nextErrors.length > 0) return
        onSave(name, title, introduction, schema)
      },
      { actionKey: 'edit_questionnaire_template' },
    )
  }

  function trySaveAsNew() {
    if (!onSaveAsNew) return
    requirePro(
      () => {
        const newName = window.prompt('Nazwa nowej ankiety', `${name.trim()} — kopia`)
        if (newName === null) return
        const nextErrors = validateQuestionnaireTemplate({
          name: newName,
          title,
          schema,
        })
        setErrors(nextErrors)
        if (nextErrors.length > 0) return
        onSaveAsNew(newName, title, introduction, schema)
        setMoreOpen(false)
      },
      { actionKey: 'create_questionnaire' },
    )
  }

  return (
    <div className={styles.templateEditor} data-testid="template-editor">
      <div className={styles.editorHeader}>
        <div>
          {onBackToLibrary ? (
            <button
              type="button"
              className={styles.backLink}
              onClick={onBackToLibrary}
              data-testid="back-to-library"
            >
              ← Ankiety
            </button>
          ) : null}
          <h2 className={styles.editorTitle}>
            {template ? template.name : 'Nowy szablon'}
          </h2>
          <p className={styles.editorType}>Przedślubna</p>
        </div>
        <div className={styles.editorHeaderActions}>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Anuluj
          </Button>
          {onSaveAsNew && template ? (
            <div className={styles.moreWrap}>
              <button
                type="button"
                className={styles.moreBtn}
                aria-label="Więcej działań"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
              >
                …
              </button>
              {moreOpen ? (
                <div className={styles.menu} role="menu">
                  <button type="button" role="menuitem" onClick={trySaveAsNew}>
                    Zapisz jako nową
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            onClick={trySave}
            disabled={saving}
            data-testid="save-template-btn"
          >
            {saving ? 'Zapisywanie…' : 'Zapisz'}
          </Button>
        </div>
      </div>

      <LocalReadOnlyNotice visible={isReadOnly} />

      {errors.length > 0 ? (
        <ul className={styles.errorList} role="alert" data-testid="template-validation-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      <div className={styles.editorSection}>
        <h3 className={styles.editorSectionTitle}>Ustawienia szablonu</h3>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Nazwa wewnętrzna</label>
          <input
            type="text"
            className={styles.fieldInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="template-name-input"
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Tytuł widoczny dla pary</label>
          <input
            type="text"
            className={styles.fieldInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="template-title-input"
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Wprowadzenie</label>
          <textarea
            className={styles.fieldTextarea}
            rows={4}
            value={introduction}
            onChange={(e) => setIntroduction(e.target.value)}
            data-testid="template-intro-input"
          />
        </div>
      </div>

      <div className={styles.editorSection}>
        <h3 className={styles.editorSectionTitle}>Sekcje i pytania</h3>
        <p className={styles.instanceNote}>
          Dostosowujesz szablon globalny. Zmiany dotyczą nowych ankiet; istniejące wysłane ankiety zachowają pierwotną wersję.
        </p>

        {schema.sections.map((section, si) => (
          <SectionEditor
            key={section.id}
            section={section}
            onChange={(updated) => updateSection(si, updated)}
            onDelete={() => deleteSection(si)}
            onMoveUp={si > 0 ? () => moveSectionUp(si) : undefined}
            onMoveDown={si < schema.sections.length - 1 ? () => moveSectionDown(si) : undefined}
            onAddQuestion={() => {
              requirePro(
                () => {
                  updateSection(si, {
                    ...section,
                    questions: [...section.questions, newQuestion()],
                  })
                },
                { actionKey: 'edit_questionnaire_template' },
              )
            }}
          />
        ))}

        <Button variant="secondary" size="sm" onClick={addSection} data-testid="add-section-btn">
          + Dodaj sekcję
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PreWeddingTemplatesPage({
  initialTemplateId,
}: {
  initialTemplateId?: string
} = {}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { requirePro, isReadOnly } = useProAccessGate()
  const [selectedTemplate, setSelectedTemplate] = useState<QuestionnaireTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const libraryMode = Boolean(initialTemplateId)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: QUESTIONNAIRE_TEMPLATES_QUERY_KEY,
    queryFn: () =>
      questionnaireTemplateService.listOwn({
        type: 'pre_wedding',
        includeArchived: true,
      }),
  })

  useEffect(() => {
    if (!initialTemplateId || templates.length === 0) return
    const match = templates.find((t) => t.id === initialTemplateId)
    if (match) {
      setSelectedTemplate(match)
      setIsCreating(false)
    }
  }, [initialTemplateId, templates])

  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      title,
      introduction,
      schema,
    }: {
      id?: string
      name: string
      title: string
      introduction: string
      schema: PreWeddingTemplateSchema
    }) => {
      if (id) {
        return questionnaireTemplateService.update(id, { name, title, introduction, schema })
      }
      return questionnaireTemplateService.create({
        name,
        title,
        introduction,
        schema,
        type: 'pre_wedding',
      })
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: QUESTIONNAIRE_TEMPLATES_QUERY_KEY })
      setSelectedTemplate(saved)
      setIsCreating(false)
      if (libraryMode) {
        navigate(`/ankiety/przedslubne/${saved.id}`, { replace: true })
      }
    },
  })

  const saveAsNewMutation = useMutation({
    mutationFn: async ({
      sourceId,
      name,
      title,
      introduction,
      schema,
    }: {
      sourceId: string
      name: string
      title: string
      introduction: string
      schema: PreWeddingTemplateSchema
    }) =>
      questionnaireTemplateService.saveAsNew(sourceId, name, {
        title,
        introduction,
        schema,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: QUESTIONNAIRE_TEMPLATES_QUERY_KEY })
      setSelectedTemplate(created)
      navigate(`/ankiety/przedslubne/${created.id}`, { replace: true })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (t: QuestionnaireTemplate) => questionnaireTemplateService.duplicate(t.id),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: QUESTIONNAIRE_TEMPLATES_QUERY_KEY })
      if (libraryMode) navigate(`/ankiety/przedslubne/${created.id}`)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (t: QuestionnaireTemplate) => questionnaireTemplateService.archive(t.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUESTIONNAIRE_TEMPLATES_QUERY_KEY })
      if (libraryMode) navigate('/ankiety')
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (t: QuestionnaireTemplate) => questionnaireTemplateService.setDefault(t.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUESTIONNAIRE_TEMPLATES_QUERY_KEY }),
  })

  const initSeed = useMutation({
    mutationFn: () => questionnaireTemplateService.getOrSeedDefault(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUESTIONNAIRE_TEMPLATES_QUERY_KEY }),
  })

  function handleSave(name: string, title: string, introduction: string, schema: PreWeddingTemplateSchema) {
    saveMutation.mutate({
      id: selectedTemplate?.id,
      name,
      title,
      introduction,
      schema,
    })
  }

  function handleSaveAsNew(
    name: string,
    title: string,
    introduction: string,
    schema: PreWeddingTemplateSchema,
  ) {
    if (!selectedTemplate) return
    saveAsNewMutation.mutate({
      sourceId: selectedTemplate.id,
      name,
      title,
      introduction,
      schema,
    })
  }

  const showEditor = isCreating || Boolean(selectedTemplate)

  return (
    <AppLayout
      title={libraryMode ? 'Edytor ankiety przedślubnej' : 'Ankiety przedślubne'}
      subtitle={
        libraryMode
          ? 'Konfiguracja szablonu — zapis wymaga PRO, gdy Trial wygasł.'
          : 'Konfiguruj szablony ankiet, które możesz wysłać do par przed dniem ślubu.'
      }
    >
      <PageContainer width="wide">
        <div className={styles.page} data-testid="prewedding-templates-page">
          <LocalReadOnlyNotice visible={isReadOnly} />

      <div className={libraryMode ? styles.pageBodyEditorOnly : styles.pageBody}>
        {!libraryMode ? (
          <div className={styles.sidebar}>
            {isLoading ? (
              <p className={styles.muted}>Ładowanie…</p>
            ) : (
              <TemplateList
                templates={templates}
                onSelect={(t) => {
                  setSelectedTemplate(t)
                  setIsCreating(false)
                }}
                onNew={() => {
                  requirePro(
                    () => {
                      setSelectedTemplate(null)
                      setIsCreating(true)
                    },
                    { actionKey: 'create_questionnaire' },
                  )
                }}
                onDuplicate={(t) =>
                  requirePro(
                    () => duplicateMutation.mutate(t),
                    { actionKey: 'edit_questionnaire_template' },
                  )
                }
                onArchive={(t) => {
                  requirePro(
                    () => {
                      if (window.confirm(`Zarchiwizować szablon „${t.name}"?`)) {
                        archiveMutation.mutate(t)
                        if (selectedTemplate?.id === t.id) setSelectedTemplate(null)
                      }
                    },
                    { actionKey: 'edit_questionnaire_template' },
                  )
                }}
                onSetDefault={(t) =>
                  requirePro(
                    () => setDefaultMutation.mutate(t),
                    { actionKey: 'edit_questionnaire_template' },
                  )
                }
                selectedId={selectedTemplate?.id}
              />
            )}

            {templates.filter((t) => !t.isArchived).length === 0 && !isLoading && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  requirePro(
                    () => initSeed.mutate(),
                    { actionKey: 'create_questionnaire' },
                  )
                }
                disabled={initSeed.isPending}
                data-testid="seed-default-btn"
              >
                {initSeed.isPending ? 'Tworzenie…' : 'Utwórz domyślny szablon'}
              </Button>
            )}
          </div>
        ) : null}

        <div className={styles.main}>
          {showEditor ? (
            <TemplateEditor
              template={selectedTemplate}
              onSave={handleSave}
              onSaveAsNew={selectedTemplate ? handleSaveAsNew : undefined}
              onCancel={() => {
                if (libraryMode) {
                  navigate('/ankiety')
                  return
                }
                setSelectedTemplate(null)
                setIsCreating(false)
              }}
              onBackToLibrary={libraryMode ? () => navigate('/ankiety') : undefined}
              saving={saveMutation.isPending || saveAsNewMutation.isPending}
            />
          ) : (
            <div className={styles.emptyEditor}>
              <p className={styles.muted}>Wybierz szablon z listy lub utwórz nowy.</p>
            </div>
          )}
        </div>
      </div>
        </div>
      </PageContainer>
    </AppLayout>
  )
}
