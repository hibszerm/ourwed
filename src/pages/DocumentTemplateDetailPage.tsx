import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { ContractStatusBadge } from '@/features/documents/components/ContractStatusBadge'
import { DeleteContractModal } from '@/features/documents/components/DeleteContractModal'
import { RenameTemplateModal } from '@/features/documents/components/TemplateModals'
import {
  fileFormatLabel,
  formatContractDate,
  getContractUiStatus,
} from '@/features/documents/contractUi'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const { data: template, isLoading, isError } = useDocumentTemplate(id)
  const mutations = useDocumentTemplateMutations(id)

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
                onClick={() => navigate('/ustawienia/dokumenty/szablony')}
              >
                Wróć do szablonów
              </Button>
            }
          />
        </PageContainer>
      </AppLayout>
    )
  }

  const doc = template
  const status = getContractUiStatus(doc)
  const format = fileFormatLabel(doc.sourceFileName)

  async function handleDelete() {
    try {
      await mutations.remove.mutateAsync(doc.id)
      showToast('Szablon został usunięty.', 'success')
      setDeleteOpen(false)
      navigate('/ustawienia/dokumenty/szablony')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się usunąć.',
        'error',
      )
    }
  }

  async function handleReplace(file: File) {
    try {
      await mutations.uploadVersion.mutateAsync({ id: doc.id, file })
      showToast('Dokument zamieniony. Uruchamiamy analizę…', 'success')
      navigate(`/ustawienia/dokumenty/szablony/${doc.id}/analiza`)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się zamienić dokumentu.',
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
        err instanceof Error ? err.message : 'Nie udało się zduplikować.',
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
        err instanceof Error ? err.message : 'Nie udało się otworzyć dokumentu.',
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
            onClick={() => navigate('/ustawienia/dokumenty/szablony')}
          >
            <ArrowLeft size={16} aria-hidden />
            Szablony umów
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
              {status === 'needs_analysis' ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    navigate(`/ustawienia/dokumenty/szablony/${doc.id}/analiza`)
                  }
                >
                  Uruchom analizę
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
              <h2 className={styles.factLabel}>Wykryte zmienne</h2>
              <p className={styles.factValue}>{doc.variableCount}</p>
            </div>
            <div className={styles.factBlock}>
              <h2 className={styles.factLabel}>Wygenerowano</h2>
              <p className={styles.factValue}>{doc.usageCount}</p>
            </div>
            <div className={styles.factBlock}>
              <h2 className={styles.factLabel}>Wersja analizy</h2>
              <p className={styles.factValue}>
                {doc.currentVersionNumber != null
                  ? `v${doc.currentVersionNumber}`
                  : '—'}
              </p>
            </div>
            {doc.description ? (
              <div className={styles.factBlock}>
                <h2 className={styles.factLabel}>Opis</h2>
                <p className={styles.factValue}>{doc.description}</p>
              </div>
            ) : null}
          </section>
        </div>
      </PageContainer>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
            ? mutations.rename.error.message
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
