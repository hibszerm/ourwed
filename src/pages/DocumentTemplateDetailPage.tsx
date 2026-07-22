import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { documentStorage } from '@/lib/api/documents/storage'
import { getForm } from '@/lib/api/forms'
import { packageService } from '@/lib/api/packageService'
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

  const formId = template?.questionnaireFormId ?? null

  const { data: questionnaireName = null } = useQuery({
    queryKey: ['contract-form-name', formId],
    queryFn: async () => {
      if (!formId) return null
      const form = await getForm(formId)
      return form?.name ?? null
    },
    enabled: Boolean(formId),
  })

  const { data: packageNames = [] } = useQuery({
    queryKey: ['contract-packages', formId],
    queryFn: async () => {
      if (!formId) return [] as string[]
      const packages = await packageService.list({ activeOnly: false })
      return packages
        .filter((p) => p.questionnaireFormId === formId)
        .map((p) => p.name)
    },
    enabled: Boolean(formId),
  })

  if (isLoading) {
    return (
      <AppLayout title="Umowa">
        <PageContainer width="wide">
          <p className={styles.quietHint}>Ładowanie…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !template) {
    return (
      <AppLayout title="Umowa">
        <PageContainer width="wide">
          <EmptyState
            title="Nie znaleziono umowy"
            description="Umowa mogła zostać usunięta."
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

  const status = getContractUiStatus(template)
  const format = fileFormatLabel(template.sourceFileName)

  async function handleDelete() {
    try {
      await mutations.remove.mutateAsync(template!.id)
      showToast('Umowa została usunięta.', 'success')
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
      await mutations.uploadVersion.mutateAsync({ id: template!.id, file })
      showToast('Dokument został zamieniony.', 'success')
      navigate(`/ustawienia/dokumenty/szablony/${template!.id}/konfiguracja`)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się zamienić dokumentu.',
        'error',
      )
    }
  }

  async function viewOriginal() {
    if (!template.sourceDocxPath) {
      showToast('Brak dostępnego pliku.', 'error')
      return
    }
    try {
      const url = await documentStorage.signedUrl(template.sourceDocxPath)
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
            Szablony dokumentów
          </button>

          <header className={styles.detailHeroClean}>
            <div className={styles.detailHeroText}>
              <div className={styles.detailTitleRow}>
                <h1 className={styles.detailTitleClean}>{template.name}</h1>
                <ContractStatusBadge status={status} />
              </div>
              <p className={styles.detailSubtle}>
                {format}
                <span aria-hidden>·</span>
                Aktualizacja {formatContractDate(template.updatedAt)}
              </p>
            </div>

            <div className={styles.detailHeroActions} ref={menuRef}>
              <Button
                type="button"
                variant="primary"
                onClick={() =>
                  navigate(
                    `/ustawienia/dokumenty/szablony/${template.id}/konfiguracja`,
                  )
                }
              >
                Wygeneruj ankietę ponownie
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={mutations.uploadVersion.isPending}
                onClick={() => fileRef.current?.click()}
              >
                Zamień dokument
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
                    {template.sourceDocxPath ? (
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
                      Usuń dokument
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <section className={styles.detailFacts}>
            <div className={styles.factBlock}>
              <h2 className={styles.factLabel}>Powiązane pakiety</h2>
              <p className={styles.factValue}>
                {packageNames.length > 0 ? packageNames.join(', ') : '—'}
              </p>
            </div>
            <div className={styles.factBlock}>
              <h2 className={styles.factLabel}>Powiązana ankieta</h2>
              <p className={styles.factValue}>{questionnaireName ?? '—'}</p>
            </div>
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
        key={`${template.id}-${template.updatedAt}`}
        open={renameOpen}
        busy={mutations.rename.isPending}
        error={
          mutations.rename.error instanceof Error
            ? mutations.rename.error.message
            : null
        }
        initialName={template.name}
        initialDescription={template.description}
        onClose={() => setRenameOpen(false)}
        onSubmit={async ({ name, description }) => {
          await mutations.rename.mutateAsync({
            id: template.id,
            name,
            description: description || null,
          })
          showToast('Zapisano.', 'success')
          setRenameOpen(false)
        }}
      />

      <DeleteContractModal
        open={deleteOpen}
        contractName={template.name}
        busy={mutations.remove.isPending}
        onClose={() => {
          if (!mutations.remove.isPending) setDeleteOpen(false)
        }}
        onConfirm={() => void handleDelete()}
      />
    </AppLayout>
  )
}
