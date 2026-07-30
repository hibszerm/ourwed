/**
 * Questionnaire Template Library — Ankiety hub.
 * Sections: Do umowy | Przedślubne
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { countAnswerableQuestions } from '@/features/prewedding/templateSchemaUtils'
import {
  QUESTIONNAIRE_TEMPLATES_QUERY_KEY,
  questionnaireTemplateService,
} from '@/lib/api/preweddingQuestionnaireService'
import {
  QUESTIONNAIRE_TEMPLATE_TYPE_LABELS,
  type QuestionnaireTemplate,
  type QuestionnaireTemplateType,
} from '@/types/preweddingQuestionnaire'
import {
  DEFAULT_TEMPLATE_INTRODUCTION,
  DEFAULT_TEMPLATE_SCHEMA,
  DEFAULT_TEMPLATE_TITLE,
} from '@/features/prewedding/defaultTemplate'
import { formatDate } from '@/lib/utils/dates'
import styles from './QuestionnaireLibraryPage.module.css'

type Filter = 'all' | QuestionnaireTemplateType

function TemplateCard({
  template,
  onEdit,
  onDuplicate,
  onRename,
  onSetDefault,
  onArchive,
  onRestore,
}: {
  template: QuestionnaireTemplate
  onEdit: () => void
  onDuplicate: () => void
  onRename: () => void
  onSetDefault: () => void
  onArchive: () => void
  onRestore: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const questions = countAnswerableQuestions(template.schema)
  const typeLabel = QUESTIONNAIRE_TEMPLATE_TYPE_LABELS[template.type]

  return (
    <article
      className={styles.card}
      data-testid="template-card"
      data-template-id={template.id}
      data-type={template.type}
      data-archived={template.isArchived ? '1' : '0'}
    >
      <button type="button" className={styles.cardMain} onClick={onEdit}>
        <div className={styles.cardTitleRow}>
          <h3 className={styles.cardName}>{template.name}</h3>
          {template.isDefault && !template.isArchived ? (
            <span className={styles.defaultBadge} data-testid="default-badge">
              Domyślna
            </span>
          ) : null}
        </div>
        <p className={styles.cardType}>{typeLabel}</p>
        <p className={styles.cardMeta}>
          {questions} {questions === 1 ? 'pytanie' : 'pytań'}
          {' · '}
          Edytowana {formatDate(template.updatedAt)}
        </p>
      </button>

      <div className={styles.cardActions}>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Edytuj
        </Button>
        <div className={styles.moreWrap}>
          <button
            type="button"
            className={styles.moreBtn}
            aria-label="Więcej działań"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            data-testid="template-more-btn"
          >
            <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit() }}>
                Edytuj
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onDuplicate()
                }}
              >
                Duplikuj
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onRename()
                }}
              >
                Zmień nazwę
              </button>
              {!template.isDefault && !template.isArchived ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onSetDefault()
                  }}
                >
                  Ustaw jako domyślną
                </button>
              ) : null}
              {template.isArchived ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onRestore()
                  }}
                >
                  Przywróć
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.menuDanger}
                  onClick={() => {
                    setMenuOpen(false)
                    onArchive()
                  }}
                >
                  Archiwizuj
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function CreateDialog({
  initialType,
  onClose,
  onCreated,
}: {
  initialType: QuestionnaireTemplateType
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [type, setType] = useState<QuestionnaireTemplateType>(initialType)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'builtin' | 'empty'>('builtin')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Podaj nazwę ankiety.')
      return
    }
    if (type === 'contract') {
      setError('Ankiety do umowy edytujesz w obecnym edytorze. Otwórz „Do umowy”.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await questionnaireTemplateService.create({
        name: trimmed,
        type: 'pre_wedding',
        title: mode === 'builtin' ? DEFAULT_TEMPLATE_TITLE : trimmed,
        introduction: mode === 'builtin' ? DEFAULT_TEMPLATE_INTRODUCTION : '',
        schema: mode === 'builtin' ? DEFAULT_TEMPLATE_SCHEMA : { sections: [] },
        isDefault: false,
      })
      onCreated(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się utworzyć ankiety.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.dialogBackdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-template-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="create-template-dialog"
      >
        <h2 id="create-template-title" className={styles.dialogTitle}>
          Nowa ankieta
        </h2>
        <form className={styles.dialogForm} onSubmit={(e) => void submit(e)}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.fieldLabel}>Typ ankiety</legend>
            <label className={styles.radioRow}>
              <input
                type="radio"
                name="type"
                checked={type === 'contract'}
                onChange={() => setType('contract')}
              />
              Do umowy
            </label>
            <label className={styles.radioRow}>
              <input
                type="radio"
                name="type"
                checked={type === 'pre_wedding'}
                onChange={() => setType('pre_wedding')}
              />
              Przedślubna
            </label>
          </fieldset>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Nazwa ankiety</span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ankieta Foto + Film"
              data-testid="create-template-name"
              autoFocus
            />
          </label>

          {type === 'pre_wedding' ? (
            <fieldset className={styles.fieldset}>
              <legend className={styles.fieldLabel}>Start</legend>
              <label className={styles.radioRow}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'builtin'}
                  onChange={() => setMode('builtin')}
                />
                Na podstawie domyślnej ankiety przedślubnej
              </label>
              <label className={styles.radioRow}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'empty'}
                  onChange={() => setMode('empty')}
                />
                Pusta ankieta
              </label>
            </fieldset>
          ) : (
            <p className={styles.hint}>
              Ankieta do umowy jest zarządzana w dedykowanym edytorze. Użyj przycisku poniżej.
            </p>
          )}

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.dialogActions}>
            <Button type="button" variant="ghost" onClick={onClose}>
              Anuluj
            </Button>
            {type === 'contract' ? (
              <Button type="button" variant="primary" onClick={() => onCreated('contract-editor')}>
                Otwórz edytor umowy
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Tworzenie…' : 'Utwórz'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export function QuestionnaireLibraryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<QuestionnaireTemplateType>('pre_wedding')
  const [showArchived, setShowArchived] = useState(false)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: QUESTIONNAIRE_TEMPLATES_QUERY_KEY,
    queryFn: () => questionnaireTemplateService.listOwn({ includeArchived: true }),
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: QUESTIONNAIRE_TEMPLATES_QUERY_KEY })

  const duplicateMut = useMutation({
    mutationFn: (id: string) => questionnaireTemplateService.duplicate(id),
    onSuccess: (t) => {
      invalidate()
      navigate(`/ankiety/przedslubne/${t.id}`)
    },
  })
  const defaultMut = useMutation({
    mutationFn: (id: string) => questionnaireTemplateService.setDefault(id),
    onSuccess: invalidate,
  })
  const archiveMut = useMutation({
    mutationFn: (id: string) => questionnaireTemplateService.archive(id),
    onSuccess: invalidate,
  })
  const restoreMut = useMutation({
    mutationFn: (id: string) => questionnaireTemplateService.restore(id),
    onSuccess: invalidate,
  })
  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      questionnaireTemplateService.update(id, { name }),
    onSuccess: invalidate,
  })
  const seedMut = useMutation({
    mutationFn: () => questionnaireTemplateService.getOrSeedDefault(),
    onSuccess: invalidate,
  })

  const active = useMemo(
    () => templates.filter((t) => !t.isArchived && t.type === 'pre_wedding'),
    [templates],
  )
  const archived = useMemo(
    () => templates.filter((t) => t.isArchived && t.type === 'pre_wedding'),
    [templates],
  )

  const showContract = filter === 'all' || filter === 'contract'
  const showPreWedding = filter === 'all' || filter === 'pre_wedding'

  function openCreate(type: QuestionnaireTemplateType) {
    setCreateType(type)
    setCreateOpen(true)
  }

  function renameTemplate(t: QuestionnaireTemplate) {
    const next = window.prompt('Nowa nazwa ankiety', t.name)
    if (next === null) return
    const trimmed = next.trim()
    if (!trimmed || trimmed === t.name) return
    void renameMut.mutateAsync({ id: t.id, name: trimmed })
  }

  function editTemplate(t: QuestionnaireTemplate) {
    if (t.type === 'contract') {
      navigate('/ankiety/dane-do-umowy')
      return
    }
    navigate(`/ankiety/przedslubne/${t.id}`)
  }

  return (
    <div className={styles.page} data-testid="questionnaire-library-page">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Ankiety</h1>
          <p className={styles.lead}>Zarządzaj szablonami ankiet wysyłanych do par.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => openCreate('pre_wedding')}
          data-testid="new-questionnaire-btn"
        >
          Nowa ankieta
        </Button>
      </header>

      <div className={styles.filters} role="tablist" aria-label="Filtr typów">
        {(
          [
            ['all', 'Wszystkie'],
            ['contract', 'Do umowy'],
            ['pre_wedding', 'Przedślubne'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={filter === id ? styles.filterActive : styles.filterBtn}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className={styles.muted}>Ładowanie…</p>
      ) : (
        <>
          {showContract ? (
            <section className={styles.section} data-testid="library-section-contract">
              <h2 className={styles.sectionTitle}>Do umowy</h2>
              <article className={styles.card} data-testid="contract-template-card">
                <button
                  type="button"
                  className={styles.cardMain}
                  onClick={() => navigate('/ankiety/dane-do-umowy')}
                >
                  <div className={styles.cardTitleRow}>
                    <h3 className={styles.cardName}>Domyślna ankieta do umowy</h3>
                    <span className={styles.defaultBadge}>Domyślna</span>
                  </div>
                  <p className={styles.cardType}>Do umowy</p>
                  <p className={styles.cardMeta}>
                    Edytor danych kontraktowych · istniejący przepływ wysyłki
                  </p>
                </button>
                <div className={styles.cardActions}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate('/ankiety/dane-do-umowy')}
                  >
                    Edytuj
                  </Button>
                </div>
              </article>
            </section>
          ) : null}

          {showPreWedding ? (
            <section className={styles.section} data-testid="library-section-pre-wedding">
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Przedślubne</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openCreate('pre_wedding')}
                >
                  Utwórz ankietę przedślubną
                </Button>
              </div>

              {active.length === 0 ? (
                <div className={styles.empty} data-testid="prewedding-empty">
                  <p>Nie masz jeszcze żadnej ankiety przedślubnej.</p>
                  <div className={styles.emptyActions}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openCreate('pre_wedding')}
                    >
                      Utwórz ankietę przedślubną
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void seedMut.mutateAsync()}
                      disabled={seedMut.isPending}
                    >
                      Użyj domyślnej
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.cardGrid}>
                  {active.map((t) => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      onEdit={() => editTemplate(t)}
                      onDuplicate={() => void duplicateMut.mutateAsync(t.id)}
                      onRename={() => renameTemplate(t)}
                      onSetDefault={() => void defaultMut.mutateAsync(t.id)}
                      onArchive={() => {
                        if (
                          window.confirm(
                            `Zarchiwizować ankietę „${t.name}”?\n\nNie będzie można używać jej przy nowych ślubach. Istniejące ankiety i odpowiedzi pozostaną bez zmian.`,
                          )
                        ) {
                          void archiveMut.mutateAsync(t.id)
                        }
                      }}
                      onRestore={() => void restoreMut.mutateAsync(t.id)}
                    />
                  ))}
                </div>
              )}

              {archived.length > 0 ? (
                <details
                  className={styles.archived}
                  open={showArchived}
                  onToggle={(e) => setShowArchived((e.target as HTMLDetailsElement).open)}
                >
                  <summary>Zarchiwizowane ({archived.length})</summary>
                  <div className={styles.cardGrid}>
                    {archived.map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        onEdit={() => editTemplate(t)}
                        onDuplicate={() => void duplicateMut.mutateAsync(t.id)}
                        onRename={() => renameTemplate(t)}
                        onSetDefault={() => undefined}
                        onArchive={() => undefined}
                        onRestore={() => void restoreMut.mutateAsync(t.id)}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      {createOpen ? (
        <CreateDialog
          initialType={createType}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false)
            invalidate()
            if (id === 'contract-editor') {
              navigate('/ankiety/dane-do-umowy')
              return
            }
            navigate(`/ankiety/przedslubne/${id}`)
          }}
        />
      ) : null}
    </div>
  )
}
