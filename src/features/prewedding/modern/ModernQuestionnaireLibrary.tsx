/**
 * Modern /ankiety library — presentation only.
 * Query keys, create payload, and template mutations stay unchanged.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconChevronDown } from '@/components/icons'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { ProLockIcon } from '@/features/billing/ProLockIcon'
import {
  PRO_LOCKED_ARIA,
  PRO_LOCKED_HINT,
} from '@/features/billing/proGateActions'
import {
  isProAccessRequiredError,
  toProAccessUserMessage,
} from '@/features/billing/proAccessError'
import {
  DEFAULT_TEMPLATE_INTRODUCTION,
  DEFAULT_TEMPLATE_SCHEMA,
  DEFAULT_TEMPLATE_TITLE,
} from '@/features/prewedding/defaultTemplate'
import { countAnswerableQuestions } from '@/features/prewedding/templateSchemaUtils'
import {
  GENERIC_PUBLIC_TITLE,
  QUESTIONNAIRE_LIBRARY_CONTRACT_META,
  QUESTIONNAIRE_LIBRARY_CONTRACT_NAME,
  QUESTIONNAIRE_LIBRARY_CONTRACT_SECTION,
  QUESTIONNAIRE_LIBRARY_CREATE_LABEL,
  QUESTIONNAIRE_LIBRARY_DELETE_BODY,
  QUESTIONNAIRE_LIBRARY_DELETE_CONFIRM,
  QUESTIONNAIRE_LIBRARY_DELETE_TITLE,
  QUESTIONNAIRE_LIBRARY_EMPTY_COPY,
  QUESTIONNAIRE_LIBRARY_EMPTY_TITLE,
  QUESTIONNAIRE_LIBRARY_PREWEDDING_SECTION,
  QUESTIONNAIRE_LIBRARY_SUBTITLE,
  QUESTIONNAIRE_LIBRARY_TITLE,
} from '@/features/prewedding/modern/questionnaireLibraryCopy'
import { QuestionnaireLibraryOverflowMenu } from '@/features/prewedding/modern/QuestionnaireLibraryOverflowMenu'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import {
  QUESTIONNAIRE_TEMPLATES_QUERY_KEY,
  questionnaireTemplateService,
} from '@/lib/api/preweddingQuestionnaireService'
import { formatShortDate } from '@/lib/utils/dates'
import type { QuestionnaireTemplate } from '@/types/preweddingQuestionnaire'
import styles from './ModernQuestionnaireLibrary.module.css'

function formatQuestionCount(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (count === 1) return '1 pytanie'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} pytania`
  }
  return `${count} pytań`
}

function distinctivePublicTitle(template: QuestionnaireTemplate): string | null {
  const title = template.title.trim()
  if (!title) return null
  if (title === template.name.trim()) return null
  if (title === GENERIC_PUBLIC_TITLE) return null
  return title
}

function templateMeta(template: QuestionnaireTemplate): string {
  const questions = countAnswerableQuestions(template.schema)
  const updated = formatShortDate(template.updatedAt)
  const publicTitle = distinctivePublicTitle(template)
  const countLine = `${formatQuestionCount(questions)} · zaktualizowano ${updated}`
  return publicTitle ? `${publicTitle} · ${countLine}` : countLine
}

export function ModernQuestionnaireLibrary() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { requirePro, isReadOnly, openUpgradeDialog } = useProAccessGate()
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createMode, setCreateMode] = useState<'builtin' | 'empty'>('builtin')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [renameTarget, setRenameTarget] = useState<QuestionnaireTemplate | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<QuestionnaireTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<QuestionnaireTemplate | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const {
    data: templates = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
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
  const deleteMut = useMutation({
    mutationFn: (id: string) => questionnaireTemplateService.deletePermanently(id),
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

  function openCreate() {
    requirePro(
      () => {
        setCreateName('')
        setCreateMode('builtin')
        setCreateError(null)
        setCreateOpen(true)
      },
      { actionKey: 'create_questionnaire' },
    )
  }

  function closeCreate() {
    if (createBusy) return
    setCreateOpen(false)
    setCreateError(null)
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!requirePro(undefined, { actionKey: 'create_questionnaire' })) return
    const trimmed = createName.trim()
    if (!trimmed) {
      setCreateError('Podaj nazwę ankiety.')
      return
    }
    setCreateBusy(true)
    setCreateError(null)
    try {
      const created = await questionnaireTemplateService.create({
        name: trimmed,
        type: 'pre_wedding',
        title: createMode === 'builtin' ? DEFAULT_TEMPLATE_TITLE : trimmed,
        introduction: createMode === 'builtin' ? DEFAULT_TEMPLATE_INTRODUCTION : '',
        schema: createMode === 'builtin' ? DEFAULT_TEMPLATE_SCHEMA : { sections: [] },
        isDefault: false,
      })
      setCreateOpen(false)
      invalidate()
      navigate(`/ankiety/przedslubne/${created.id}`)
    } catch (err) {
      if (isProAccessRequiredError(err)) {
        setCreateError(toProAccessUserMessage())
        openUpgradeDialog('pro_required_action', 'create_questionnaire')
        return
      }
      setCreateError(getUserFacingErrorMessage(err, 'Nie udało się utworzyć ankiety.'))
    } finally {
      setCreateBusy(false)
    }
  }

  function openRename(template: QuestionnaireTemplate) {
    requirePro(
      () => {
        setRenameTarget(template)
        setRenameValue(template.name)
        setRenameError(null)
      },
      { actionKey: 'edit_questionnaire_template' },
    )
  }

  function closeRename() {
    if (renameMut.isPending) return
    setRenameTarget(null)
    setRenameError(null)
  }

  async function submitRename(event: React.FormEvent) {
    event.preventDefault()
    if (!renameTarget) return
    const trimmed = renameValue.trim()
    if (!trimmed) {
      setRenameError('Podaj nazwę ankiety.')
      return
    }
    if (trimmed === renameTarget.name) {
      closeRename()
      return
    }
    setRenameError(null)
    try {
      await renameMut.mutateAsync({ id: renameTarget.id, name: trimmed })
      setRenameTarget(null)
    } catch (err) {
      setRenameError(getUserFacingErrorMessage(err, 'Nie udało się zmienić nazwy.'))
    }
  }

  function viewTemplate(template: QuestionnaireTemplate) {
    if (template.type === 'contract') {
      navigate('/ankiety/dane-do-umowy')
      return
    }
    navigate(`/ankiety/przedslubne/${template.id}`)
  }

  function editTemplate(template: QuestionnaireTemplate) {
    requirePro(() => viewTemplate(template), { actionKey: 'edit_questionnaire' })
  }

  function openArchive(template: QuestionnaireTemplate) {
    requirePro(() => setArchiveTarget(template), {
      actionKey: 'edit_questionnaire_template',
    })
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    await archiveMut.mutateAsync(archiveTarget.id)
    setArchiveTarget(null)
  }

  function openPermanentDelete(template: QuestionnaireTemplate) {
    requirePro(
      () => {
        setDeleteTarget(template)
        setDeleteError(null)
      },
      { actionKey: 'edit_questionnaire_template' },
    )
  }

  function closePermanentDelete() {
    if (deleteMut.isPending) return
    setDeleteTarget(null)
    setDeleteError(null)
  }

  async function confirmPermanentDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteMut.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err) {
      if (isProAccessRequiredError(err)) {
        setDeleteError(toProAccessUserMessage())
        openUpgradeDialog('pro_required_action', 'edit_questionnaire_template')
        return
      }
      setDeleteError(
        getUserFacingErrorMessage(err, 'Nie udało się usunąć ankiety.'),
      )
    }
  }

  const createButton = (
    <Button
      variant="primary"
      className={styles.createAction}
      onClick={openCreate}
      data-testid="new-questionnaire-btn"
      title={isReadOnly ? PRO_LOCKED_HINT : undefined}
      aria-label={isReadOnly ? `Nowa ankieta — ${PRO_LOCKED_ARIA}` : undefined}
    >
      {isReadOnly ? <ProLockIcon /> : null}
      {QUESTIONNAIRE_LIBRARY_CREATE_LABEL}
    </Button>
  )

  return (
    <div
      className={styles.page}
      data-testid="questionnaire-library-page"
      data-library="modern"
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{QUESTIONNAIRE_LIBRARY_TITLE}</h1>
          <p className={styles.lead}>{QUESTIONNAIRE_LIBRARY_SUBTITLE}</p>
        </div>
        <div className={styles.actions}>{createButton}</div>
      </header>

      {isError ? (
        <div className={styles.errorBlock}>
          <p className={styles.emptyTitle}>Nie udało się załadować ankiet</p>
          <p className={styles.emptyDesc}>
            {getUserFacingErrorMessage(error, 'Spróbuj ponownie za chwilę.')}
          </p>
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Spróbuj ponownie
          </Button>
        </div>
      ) : (
        <div className={styles.sections}>
          <section className={styles.section} data-testid="library-section-contract">
            <div className={styles.catalog}>
              <h2 className={styles.sectionTitle}>{QUESTIONNAIRE_LIBRARY_CONTRACT_SECTION}</h2>
              <div className={styles.surface}>
                <button
                  type="button"
                  className={`${styles.row} ${styles.contractRow}`}
                  data-testid="contract-template-card"
                  onClick={() => navigate('/ankiety/dane-do-umowy')}
                  aria-label={`Edytuj: ${QUESTIONNAIRE_LIBRARY_CONTRACT_NAME}`}
                >
                  <span className={styles.identity}>
                    <QuestionnaireRowIdentity
                      name={QUESTIONNAIRE_LIBRARY_CONTRACT_NAME}
                      meta={QUESTIONNAIRE_LIBRARY_CONTRACT_META}
                    />
                  </span>
                  <span className={styles.rowAction}>Edytuj</span>
                </button>
              </div>
            </div>
          </section>

          <section className={styles.section} data-testid="library-section-pre-wedding">
            <div className={styles.catalog}>
              <h2 className={styles.sectionTitle}>{QUESTIONNAIRE_LIBRARY_PREWEDDING_SECTION}</h2>
              {isLoading ? (
                <div
                  className={`${styles.surface} ${styles.skeleton}`}
                  role="status"
                  aria-label="Ładowanie ankiet"
                >
                  <div className={styles.skeletonRow} />
                  <div className={styles.skeletonRow} />
                  <div className={styles.skeletonRow} />
                </div>
              ) : active.length === 0 ? (
                <div className={`${styles.surface} ${styles.empty}`} data-testid="prewedding-empty">
                  <h3 className={styles.emptyTitle}>{QUESTIONNAIRE_LIBRARY_EMPTY_TITLE}</h3>
                  <p className={styles.emptyDesc}>{QUESTIONNAIRE_LIBRARY_EMPTY_COPY}</p>
                  <div className={styles.emptyActions}>
                    <Button variant="primary" onClick={openCreate}>
                      {isReadOnly ? <ProLockIcon /> : null}
                      {QUESTIONNAIRE_LIBRARY_CREATE_LABEL}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        requirePro(
                          () => void seedMut.mutateAsync(),
                          { actionKey: 'create_questionnaire' },
                        )
                      }
                      disabled={seedMut.isPending}
                    >
                      Użyj domyślnej
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.surface}>
                  <ul className={styles.list}>
                    {active.map((template) => (
                      <TemplateRow
                        key={template.id}
                        template={template}
                        menuOpen={openMenuId === template.id}
                        onMenuOpenChange={(open) =>
                          setOpenMenuId(open ? template.id : null)
                        }
                        onView={() => viewTemplate(template)}
                        onEdit={() => editTemplate(template)}
                        onRename={() => openRename(template)}
                        onDuplicate={() =>
                          requirePro(
                            () => void duplicateMut.mutateAsync(template.id),
                            { actionKey: 'edit_questionnaire_template' },
                          )
                        }
                        onSetDefault={() =>
                          requirePro(
                            () => void defaultMut.mutateAsync(template.id),
                            { actionKey: 'edit_questionnaire_template' },
                          )
                        }
                          onArchive={() => openArchive(template)}
                          onRestore={() => undefined}
                          onDeletePermanently={() => undefined}
                        />
                    ))}
                  </ul>
                </div>
              )}

              {archived.length > 0 ? (
                <details
                  className={styles.archived}
                  open={showArchived}
                  onToggle={(event) =>
                    setShowArchived((event.target as HTMLDetailsElement).open)
                  }
                >
                  <summary className={styles.archivedSummary}>
                    <IconChevronDown
                      className={styles.archivedChevron}
                      width={16}
                      height={16}
                      aria-hidden="true"
                    />
                    Archiwalne ({archived.length})
                  </summary>
                  <div className={`${styles.surface} ${styles.archivedBody}`}>
                    <ul className={styles.list}>
                      {archived.map((template) => (
                        <TemplateRow
                          key={template.id}
                          template={template}
                          menuOpen={openMenuId === template.id}
                          onMenuOpenChange={(open) =>
                            setOpenMenuId(open ? template.id : null)
                          }
                          onView={() => viewTemplate(template)}
                          onEdit={() => editTemplate(template)}
                          onRename={() => openRename(template)}
                          onDuplicate={() =>
                            requirePro(
                              () => void duplicateMut.mutateAsync(template.id),
                              { actionKey: 'edit_questionnaire_template' },
                            )
                          }
                          onSetDefault={() => undefined}
                          onArchive={() => undefined}
                          onRestore={() =>
                            requirePro(
                              () => void restoreMut.mutateAsync(template.id),
                              { actionKey: 'edit_questionnaire_template' },
                            )
                          }
                          onDeletePermanently={() => openPermanentDelete(template)}
                        />
                      ))}
                    </ul>
                  </div>
                </details>
              ) : null}
            </div>
          </section>
        </div>
      )}

      <Modal
        open={createOpen}
        title="Nowa ankieta"
        description="Utwórz ankietę przedślubną. Dane do umowy edytujesz osobno."
        onClose={closeCreate}
        busy={createBusy}
        size="md"
        hideFooter
      >
        <form
          id="create-template-form"
          className={styles.dialogStack}
          onSubmit={(event) => void submitCreate(event)}
          data-testid="create-template-dialog"
        >
          <Input
            label="Nazwa ankiety"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="Ankieta Foto + Film"
            autoComplete="off"
            disabled={createBusy}
            data-testid="create-template-name"
          />
          <fieldset className={styles.choiceList}>
            <legend className={styles.sectionTitle}>Od czego zacząć</legend>
            <label className={styles.choiceRow}>
              <input
                type="radio"
                name="create-mode"
                checked={createMode === 'builtin'}
                onChange={() => setCreateMode('builtin')}
                disabled={createBusy}
              />
              Na podstawie domyślnej ankiety przedślubnej
            </label>
            <label className={styles.choiceRow}>
              <input
                type="radio"
                name="create-mode"
                checked={createMode === 'empty'}
                onChange={() => setCreateMode('empty')}
                disabled={createBusy}
              />
              Pusta ankieta
            </label>
          </fieldset>
          {createError ? (
            <p className={styles.emptyDesc} role="alert">
              {createError}
            </p>
          ) : null}
          <div className={styles.emptyActions}>
            <Button type="button" variant="ghost" onClick={closeCreate} disabled={createBusy}>
              Anuluj
            </Button>
            <Button type="submit" variant="primary" disabled={createBusy}>
              {createBusy ? 'Tworzenie…' : 'Utwórz'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(renameTarget)}
        title="Zmień nazwę"
        onClose={closeRename}
        busy={renameMut.isPending}
        hideFooter
      >
        <form className={styles.dialogStack} onSubmit={(event) => void submitRename(event)}>
          <Input
            label="Nazwa ankiety"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            autoComplete="off"
            disabled={renameMut.isPending}
            data-testid="rename-template-name"
          />
          {renameError ? (
            <p className={styles.emptyDesc} role="alert">
              {renameError}
            </p>
          ) : null}
          <div className={styles.emptyActions}>
            <Button
              type="button"
              variant="ghost"
              onClick={closeRename}
              disabled={renameMut.isPending}
            >
              Anuluj
            </Button>
            <Button type="submit" variant="primary" disabled={renameMut.isPending}>
              {renameMut.isPending ? 'Zapisywanie…' : 'Zapisz'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(archiveTarget)}
        title="Archiwizuj ankietę"
        onClose={() => {
          if (archiveMut.isPending) return
          setArchiveTarget(null)
        }}
        busy={archiveMut.isPending}
        primaryAction={
          <Button
            variant="danger"
            disabled={archiveMut.isPending}
            onClick={() => void confirmArchive()}
          >
            Archiwizuj
          </Button>
        }
      >
        <p className={styles.emptyDesc}>
          {archiveTarget
            ? `Zarchiwizować ankietę „${archiveTarget.name}”? Nie będzie można używać jej przy nowych ślubach. Wysłane ankiety pozostaną bez zmian.`
            : null}
        </p>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title={QUESTIONNAIRE_LIBRARY_DELETE_TITLE}
        onClose={closePermanentDelete}
        busy={deleteMut.isPending}
        primaryAction={
          <Button
            variant="danger"
            disabled={deleteMut.isPending}
            onClick={() => void confirmPermanentDelete()}
            data-testid="permanent-delete-confirm"
          >
            {deleteMut.isPending ? 'Usuwanie…' : QUESTIONNAIRE_LIBRARY_DELETE_CONFIRM}
          </Button>
        }
      >
        <div className={styles.dialogStack}>
          <p className={styles.emptyDesc} data-testid="permanent-delete-dialog">
            {QUESTIONNAIRE_LIBRARY_DELETE_BODY}
          </p>
          {deleteError ? (
            <p className={styles.emptyDesc} role="alert">
              {deleteError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}

function QuestionnaireRowIdentity({ name, meta }: { name: string; meta: string }) {
  return (
    <span className={styles.entryHead}>
      <FileText
        className={styles.entryIcon}
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className={styles.entryCopy}>
        <span className={styles.name}>{name}</span>
        <span className={styles.meta}>{meta}</span>
      </span>
    </span>
  )
}

function TemplateRow({
  template,
  menuOpen,
  onMenuOpenChange,
  onView,
  onEdit,
  onRename,
  onDuplicate,
  onSetDefault,
  onArchive,
  onRestore,
  onDeletePermanently,
}: {
  template: QuestionnaireTemplate
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  onView: () => void
  onEdit: () => void
  onRename: () => void
  onDuplicate: () => void
  onSetDefault: () => void
  onArchive: () => void
  onRestore: () => void
  onDeletePermanently: () => void
}) {
  const actions = template.isArchived
    ? [
        { id: 'restore', label: 'Przywróć', onSelect: onRestore },
        {
          id: 'delete',
          label: QUESTIONNAIRE_LIBRARY_DELETE_CONFIRM,
          danger: true,
          onSelect: onDeletePermanently,
        },
      ]
    : [
        { id: 'edit', label: 'Edytuj', onSelect: onEdit },
        { id: 'rename', label: 'Zmień nazwę', onSelect: onRename },
        { id: 'duplicate', label: 'Duplikuj', onSelect: onDuplicate },
        ...(!template.isDefault
          ? [{ id: 'default', label: 'Ustaw jako domyślną', onSelect: onSetDefault }]
          : []),
        { id: 'archive', label: 'Archiwizuj', danger: true, onSelect: onArchive },
      ]

  return (
    <li
      className={styles.row}
      data-testid="template-card"
      data-template-id={template.id}
      data-type={template.type}
      data-archived={template.isArchived ? '1' : '0'}
    >
      <button type="button" className={styles.identity} onClick={onView}>
        <QuestionnaireRowIdentity name={template.name} meta={templateMeta(template)} />
      </button>
      {template.isArchived ? (
        <span className={styles.quietStatus}>Archiwalna</span>
      ) : template.isDefault ? (
        <span className={styles.defaultPill} data-testid="default-badge">
          Domyślna
        </span>
      ) : (
        <span />
      )}
      <QuestionnaireLibraryOverflowMenu
        open={menuOpen}
        onOpenChange={onMenuOpenChange}
        actions={actions}
      />
    </li>
  )
}
