import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { documentStorage } from '@/lib/api/documents/storage'
import {
  documentTemplateKeys,
  useDocumentTemplate,
  useDocumentTemplateMutations,
} from '@/features/documents/hooks/useDocumentTemplates'
import { ContractStatusBadge } from '@/features/documents/components/ContractStatusBadge'
import { DeleteContractModal } from '@/features/documents/components/DeleteContractModal'
import { RenameTemplateModal } from '@/features/documents/components/TemplateModals'
import { validateContractDocx } from '@/features/documents/import/contractUploadValidation'
import { GeneratedWeddingContractService } from '@/features/documents/template'
import { ensureAutomaticTemplateConfiguration } from '@/features/documents/template/ensureAutomaticTemplateConfiguration'
import {
  fileFormatLabel,
  formatContractDate,
  getContractUiStatus,
  templateServiceTypeLabel,
} from '@/features/documents/contractUi'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import styles from '@/features/documents/DocumentsTemplates.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

export function DocumentTemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = useStudioAuthId() ?? null
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
  const [healNonce, setHealNonce] = useState(0)

  const needsHeal = Boolean(
    template &&
      (template.aiAnalyzedAt || (template.variableCount ?? 0) > 0) &&
      (template.meta.fieldConfigurationStatus !== 'ready' ||
        template.meta.automaticReadinessStatus === 'attention' ||
        template.meta.automaticReadinessStatus === 'analyzing' ||
        (template.meta.automaticAttentionIssues ?? []).some(
          (issue) => issue.code === 'physical_slots',
        ) ||
        !template.meta.fieldConfiguration),
  )

  const healQuery = useQuery({
    queryKey: ['ensure-automatic-template-configuration', id, healNonce],
    queryFn: async () => {
      if (!id) throw new Error('Brak szablonu')
      const result = await ensureAutomaticTemplateConfiguration(id)
      await queryClient.invalidateQueries({
        queryKey: documentTemplateKeys.detail(userId, id),
      })
      await queryClient.invalidateQueries({
        queryKey: documentTemplateKeys.summaries(userId),
      })
      return result
    },
    enabled: Boolean(id && needsHeal),
    staleTime: Infinity,
    retry: false,
  })

  const healing = healQuery.isFetching
  const healError =
    healQuery.isError || (healQuery.data?.failure && !healQuery.data.repaired)
      ? 'Nie udało się dokończyć przygotowania szablonu. Spróbuj ponownie.'
      : null

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
  const status = healing ? 'analyzing' : getContractUiStatus(doc)
  const format = fileFormatLabel(doc.sourceFileName)

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
      showToast(getUserFacingErrorMessage(validation, 'Nie udało się wykonać operacji. Spróbuj ponownie.'), 'error')
      return
    }
    try {
      await mutations.uploadVersion.mutateAsync({ id: doc.id, file })
      showToast('Dokument zamieniony. Uruchamiamy analizę…', 'success')
      navigate(`/ustawienia/dokumenty/szablony/${doc.id}/analiza`)
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
        <div className={styles.studioPage}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => navigate('/studio/pakiety')}
          >
            <ArrowLeft size={16} aria-hidden />
            Pakiety
          </button>

          <header className={styles.detailHeroClean}>
            <div className={styles.detailHeroText}>
              <div className={styles.detailTitleRow}>
                <h1 className={styles.detailTitleClean}>{doc.name}</h1>
                <ContractStatusBadge status={status} />
              </div>
              <p className={styles.detailSubtle}>
                {format}
                <span aria-hidden>·</span>
                Aktualizacja {formatContractDate(doc.updatedAt)}
              </p>
            </div>

            <div className={styles.detailHeroActions} ref={menuRef}>
              {status === 'analyzing' || status === 'error' ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    navigate(`/ustawienia/dokumenty/szablony/${doc.id}/analiza`)
                  }
                >
                  {status === 'error' ? 'Spróbuj ponownie' : 'Uruchom analizę'}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={mutations.uploadVersion.isPending}
                onClick={() => fileRef.current?.click()}
              >
                Zamień źródłowy DOCX
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

          <section className={styles.detailFacts}>
            <div className={styles.factBlock}>
              <h2 className={styles.factLabel}>Typ</h2>
              <p className={styles.factValue}>
                {templateServiceTypeLabel(
                  doc.meta.templateServiceType,
                  doc.category,
                )}
              </p>
            </div>
            <div className={styles.factBlock}>
              <h2 className={styles.factLabel}>Dodano</h2>
              <p className={styles.factValue}>
                {formatContractDate(doc.createdAt)}
              </p>
            </div>
            <div className={styles.factBlock}>
              <h2 className={styles.factLabel}>Wygenerowano</h2>
              <p className={styles.factValue}>{doc.usageCount}</p>
            </div>
            {doc.description ? (
              <div className={styles.factBlock}>
                <h2 className={styles.factLabel}>Opis</h2>
                <p className={styles.factValue}>{doc.description}</p>
              </div>
            ) : null}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Wygenerowane umowy</h2>
                <p className={styles.sectionSubtitle}>
                  Zapisane artefakty utworzone z tego szablonu.
                </p>
              </div>
            </div>
            {generatedContracts.length === 0 ? (
              <p className={styles.quietHint}>Brak wygenerowanych umów.</p>
            ) : (
              <div className={styles.generatedGrid}>
                {generatedContracts.map((contract) => (
                  <Link
                    key={contract.draft.id}
                    className={styles.generatedCard}
                    to={`/sluby/${contract.weddingId}/umowy/${contract.draft.id}`}
                  >
                    <div className={styles.generatedCardTop}>
                      <h3>{contract.draft.title}</h3>
                      <span>Gotowa</span>
                    </div>
                    <p>
                      Wersja {contract.generationVersion ?? 1} ·{' '}
                      {formatContractDate(contract.updatedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className={styles.nextStepCard}>
            <h2 className={styles.factLabel}>Gotowość</h2>
            {healing || status === 'analyzing' ? (
              <p className={styles.quietHint}>Przygotowujemy szablon…</p>
            ) : status === 'ready' ? (
              <>
                <p className={styles.factValue}>
                  Szablon jest gotowy do generowania umów.
                </p>
                <p className={styles.quietHint}>
                  OurWed uzupełni ten szablon danymi ze zlecenia.
                </p>
              </>
            ) : status === 'error' || healError ? (
              <>
                <p className={styles.quietHint}>
                  {healError ??
                    'Nie udało się dokończyć przygotowania szablonu. Spróbuj ponownie.'}
                </p>
                <div className={styles.configSlotActions}>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setHealNonce((value) => value + 1)}
                  >
                    Spróbuj ponownie
                  </Button>
                </div>
              </>
            ) : (
              <p className={styles.quietHint}>
                {(doc.meta.automaticAttentionIssues ?? []).find(
                  (issue) => issue.code !== 'physical_slots',
                )?.message ??
                  'Przy generowaniu poprosimy o uzupełnienie brakujących danych.'}
              </p>
            )}
            <div className={styles.configSlotActions}>
              {status === 'ready' && !healing ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => navigate('/sluby')}
                >
                  Wygeneruj umowę
                </Button>
              ) : null}
            </div>
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
            ? getUserFacingErrorMessage(mutations.rename.error, 'Nie udało się zmienić nazwy.')
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
