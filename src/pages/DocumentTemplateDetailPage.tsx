import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { documentStorage } from '@/lib/api/documents/storage'
import {
  useDocumentTemplate,
  useDocumentTemplateMutations,
} from '@/features/documents/hooks/useDocumentTemplates'
import { DeleteContractModal } from '@/features/documents/components/DeleteContractModal'
import { RenameTemplateModal } from '@/features/documents/components/TemplateModals'
import { validateContractDocx } from '@/features/documents/import/contractUploadValidation'
import { GeneratedWeddingContractService } from '@/features/documents/template'
import {
  fileFormatLabel,
  formatContractDate,
} from '@/features/documents/contractUi'
import styles from '@/features/documents/DocumentsTemplates.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

function formatUpdatedMeta(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return formatContractDate(iso)
  }
}

/** Polish count for generated contracts — no i18n framework. */
function formatGeneratedContractsCount(count: number): string {
  const n = Math.max(0, Math.floor(count))
  if (n === 1) return '1 umowę'
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} umowy`
  }
  return `${n} umów`
}

/**
 * Visual split of existing draft titles like
 * "Umowa — Video Standard — Julia Kanicka & Maksymilian Ruth".
 * Does not invent or rename data.
 */
function splitGeneratedTitle(title: string): {
  primary: string
  secondary: string | null
} {
  const parts = title
    .split(' — ')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 3) {
    return {
      primary: parts.slice(0, -1).join(' — '),
      secondary: parts[parts.length - 1] ?? null,
    }
  }
  if (parts.length === 2) {
    return { primary: parts[0]!, secondary: parts[1]! }
  }
  return { primary: title.trim() || 'Umowa', secondary: null }
}

/**
 * Slim V1 template management surface — Packages visual continuity.
 * Legacy AI analysis wizard is quarantined — not linked from this page.
 */
export function DocumentTemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const { data: template, isLoading, isError } = useDocumentTemplate(id)
  const mutations = useDocumentTemplateMutations(id)
  const { data: generatedContracts = [] } = useQuery({
    queryKey: ['generated-wedding-contracts', 'template', id],
    queryFn: async () =>
      (await GeneratedWeddingContractService.listAllForStudio()).filter(
        (contract) => contract.templateId === id,
      ),
    enabled: Boolean(id),
  })

  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  if (isLoading) {
    return (
      <AppLayout title="Szablon umowy">
        <PageContainer width="wide">
          <p className={styles.quietHint}>Ładowanie…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !template) {
    return (
      <AppLayout title="Szablon umowy">
        <PageContainer width="wide">
          <EmptyState
            title="Nie znaleziono szablonu"
            description="Szablon mógł zostać usunięty."
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/studio/pakiety')}
              >
                Wróć do pakietów
              </Button>
            }
          />
        </PageContainer>
      </AppLayout>
    )
  }

  const doc = template
  const format = fileFormatLabel(doc.sourceFileName)
  const generatedCount =
    generatedContracts.length > 0
      ? generatedContracts.length
      : doc.usageCount

  async function handleDelete() {
    try {
      await mutations.remove.mutateAsync(doc.id)
      showToast('Szablon został usunięty.', 'success')
      setDeleteOpen(false)
      navigate('/studio/pakiety')
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się usunąć.'),
        'error',
      )
    }
  }

  async function handleReplace(file: File) {
    const validation = validateContractDocx(file)
    if (!validation.ok) {
      showToast(
        getUserFacingErrorMessage(
          validation,
          'Nie udało się wykonać operacji. Spróbuj ponownie.',
        ),
        'error',
      )
      return
    }
    try {
      await mutations.uploadVersion.mutateAsync({ id: doc.id, file })
      showToast('Źródłowy dokument został zamieniony.', 'success')
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się zamienić dokumentu.'),
        'error',
      )
    }
  }

  async function handleDuplicate() {
    try {
      const copy = await mutations.duplicate.mutateAsync(doc.id)
      showToast('Szablon zduplikowany.', 'success')
      navigate(`/ustawienia/dokumenty/szablony/${copy.id}`)
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się zduplikować.'),
        'error',
      )
    }
  }

  async function viewOriginal() {
    if (!doc.sourceDocxPath) {
      showToast('Brak dostępnego pliku.', 'error')
      return
    }
    try {
      const url = await documentStorage.signedUrl(doc.sourceDocxPath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      showToast(
        getUserFacingErrorMessage(err, 'Nie udało się otworzyć dokumentu.'),
        'error',
      )
    }
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <div
          className={`${styles.studioPage} ${styles.templateDetailPage}`}
          data-testid="template-detail-v1"
          data-sparse={doc.meta.sparseTemplateOnly ? 'true' : undefined}
        >
          <button
            type="button"
            className={styles.backLink}
            onClick={() => navigate('/studio/pakiety')}
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
            Pakiety
          </button>

          <header className={styles.detailHeroClean}>
            <div className={styles.detailHeroText}>
              <h1 className={styles.detailTitleClean}>{doc.name}</h1>
              <p className={styles.detailSubtle}>
                <span>{format}</span>
                <span aria-hidden>·</span>
                <span>zaktualizowano {formatUpdatedMeta(doc.updatedAt)}</span>
              </p>
            </div>

            <div className={styles.detailHeroActions} ref={menuRef}>
              <Button
                type="button"
                variant="secondary"
                disabled={mutations.uploadVersion.isPending}
                data-testid="template-replace-docx"
                onClick={() => fileRef.current?.click()}
              >
                {mutations.uploadVersion.isPending
                  ? 'Zamienianie…'
                  : 'Zamień źródłowy DOCX'}
              </Button>
              <div className={styles.overflowMenu}>
                <button
                  type="button"
                  className={styles.cardMenuBtn}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <MoreHorizontal size={18} aria-label="Więcej działań" />
                </button>
                {menuOpen ? (
                  <div className={styles.overflowPanel} role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.overflowItem}
                      onClick={() => {
                        setMenuOpen(false)
                        setRenameOpen(true)
                      }}
                    >
                      Zmień nazwę
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.overflowItem}
                      onClick={() => {
                        setMenuOpen(false)
                        void handleDuplicate()
                      }}
                    >
                      Duplikuj
                    </button>
                    {doc.sourceDocxPath ? (
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.overflowItem}
                        onClick={() => {
                          setMenuOpen(false)
                          void viewOriginal()
                        }}
                      >
                        Otwórz oryginalny dokument
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.overflowItem} ${styles.overflowItemDanger}`}
                      data-testid="template-detail-delete-trigger"
                      onClick={() => {
                        setMenuOpen(false)
                        setDeleteOpen(true)
                      }}
                    >
                      Usuń
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <dl className={styles.detailFacts} data-testid="template-detail-meta">
            <div className={styles.factBlock}>
              <dt className={styles.factLabel}>Dodano</dt>
              <dd className={styles.factValue}>
                {formatContractDate(doc.createdAt)}
              </dd>
            </div>
            <div className={styles.factBlock}>
              <dt className={styles.factLabel}>Wygenerowano</dt>
              <dd
                className={styles.factValue}
                data-testid="template-generated-count"
              >
                {formatGeneratedContractsCount(generatedCount)}
              </dd>
            </div>
            {doc.description?.trim() ? (
              <div className={`${styles.factBlock} ${styles.factBlockWide}`}>
                <dt className={styles.factLabel}>Opis</dt>
                <dd className={styles.factValue}>{doc.description.trim()}</dd>
              </div>
            ) : null}
          </dl>

          <section
            className={styles.historySection}
            data-testid="template-generated-history"
          >
            <div className={styles.historyHeader}>
              <h2 className={styles.historyTitle}>Wygenerowane umowy</h2>
              <p className={styles.historySupport}>
                Umowy utworzone na podstawie tego szablonu.
              </p>
            </div>
            {generatedContracts.length === 0 ? (
              <p
                className={styles.historyEmpty}
                data-testid="template-history-empty"
              >
                Nie wygenerowano jeszcze żadnej umowy z tego szablonu.
              </p>
            ) : (
              <div className={styles.generatedGrid}>
                {generatedContracts.map((contract) => {
                  const split = splitGeneratedTitle(contract.draft.title)
                  return (
                    <Link
                      key={contract.draft.id}
                      className={styles.generatedCard}
                      to={`/sluby/${contract.weddingId}/umowy/${contract.draft.id}`}
                    >
                      <div className={styles.generatedCardTop}>
                        <div className={styles.generatedCardIdentity}>
                          <h3 className={styles.generatedCardTitle}>
                            {split.primary}
                          </h3>
                          {split.secondary ? (
                            <p className={styles.generatedCardCouple}>
                              {split.secondary}
                            </p>
                          ) : null}
                        </div>
                        <span className={styles.generatedStatus}>Gotowa</span>
                      </div>
                      <p className={styles.generatedCardMeta}>
                        Wersja {contract.generationVersion ?? 1} ·{' '}
                        {formatContractDate(contract.updatedAt)}
                      </p>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </PageContainer>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleReplace(file)
          if (fileRef.current) fileRef.current.value = ''
        }}
      />

      <RenameTemplateModal
        key={`${doc.id}-${doc.updatedAt}`}
        open={renameOpen}
        busy={mutations.rename.isPending}
        error={
          mutations.rename.error instanceof Error
            ? getUserFacingErrorMessage(
                mutations.rename.error,
                'Nie udało się zmienić nazwy.',
              )
            : null
        }
        initialName={doc.name}
        initialDescription={doc.description}
        onClose={() => setRenameOpen(false)}
        onSubmit={async ({ name, description }) => {
          await mutations.rename.mutateAsync({
            id: doc.id,
            name,
            description: description || null,
          })
          showToast('Zapisano.', 'success')
          setRenameOpen(false)
        }}
      />

      <DeleteContractModal
        key={deleteOpen ? `delete-${doc.id}` : 'delete-closed'}
        open={deleteOpen}
        contractName={doc.name}
        busy={mutations.remove.isPending}
        onClose={() => {
          if (!mutations.remove.isPending) setDeleteOpen(false)
        }}
        onConfirm={() => void handleDelete()}
      />
    </AppLayout>
  )
}
