import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import {
  documentTemplateKeys,
  useDocumentTemplateMutations,
  useDocumentTemplates,
} from '@/features/documents/hooks/useDocumentTemplates'
import { ContractCard } from '@/features/documents/components/ContractCard'
import { DeleteContractModal } from '@/features/documents/components/DeleteContractModal'
import { RenameTemplateModal } from '@/features/documents/components/TemplateModals'
import { setPendingNewImport } from '@/features/documents/import/attachedImportCache'
import { reanalyzeTemplate } from '@/features/documents/template/reanalyzeTemplate'
import type { DocumentTemplateSummary } from '@/types/documents'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplatesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const { data: templates = [], isLoading, isError } = useDocumentTemplates()
  const { remove, rename, duplicate, uploadVersion } =
    useDocumentTemplateMutations()
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] =
    useState<DocumentTemplateSummary | null>(null)
  const [renameTarget, setRenameTarget] =
    useState<DocumentTemplateSummary | null>(null)
  const [replaceTarget, setReplaceTarget] =
    useState<DocumentTemplateSummary | null>(null)

  function openUploadPicker() {
    fileRef.current?.click()
  }

  async function onFilePicked(file: File) {
    setPendingNewImport(file)
    navigate('/ustawienia/dokumenty/szablony/nowy')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget.id)
      showToast('Szablon został usunięty.', 'success')
      setDeleteTarget(null)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się usunąć.',
        'error',
      )
    }
  }

  async function handleDuplicate(template: DocumentTemplateSummary) {
    try {
      const copy = await duplicate.mutateAsync(template.id)
      showToast('Szablon zduplikowany.', 'success')
      navigate(`/ustawienia/dokumenty/szablony/${copy.id}`)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się zduplikować.',
        'error',
      )
    }
  }

  async function handleReplace(file: File) {
    if (!replaceTarget) return
    try {
      await uploadVersion.mutateAsync({ id: replaceTarget.id, file })
      showToast('Źródłowy dokument zamieniony. Uruchamiamy analizę…', 'success')
      navigate(`/ustawienia/dokumenty/szablony/${replaceTarget.id}/analiza`)
      setReplaceTarget(null)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się zamienić pliku.',
        'error',
      )
    } finally {
      if (replaceRef.current) replaceRef.current.value = ''
    }
  }

  async function handleReanalyze(template: DocumentTemplateSummary) {
    if (reanalyzingId) return
    setReanalyzingId(template.id)
    try {
      const result = await reanalyzeTemplate({ templateId: template.id })
      await queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all })
      if (result.readinessReady) {
        showToast('Szablon przeanalizowany — gotowy do generacji.', 'success')
      } else {
        showToast(
          `Szablon niekompletny. Brak powiązań: ${result.unresolvedKeys.slice(0, 5).join(', ') || 'brak slotów'}.`,
          'error',
        )
      }
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Nie udało się ponownie przeanalizować szablonu.',
        'error',
      )
    } finally {
      setReanalyzingId(null)
    }
  }

  const sorted = useMemo(
    () =>
      [...templates].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [templates],
  )

  return (
    <AppLayout>
      <PageContainer width="wide">
        <div className={styles.studioPage}>
          <header className={styles.studioHero}>
            <h1 className={styles.studioTitle}>Szablony umów</h1>
            <p className={styles.studioSubtitle}>
              Prześlij swój kontrakt raz. OurWed odtworzy go na każdym ślubie z
              danych, które już masz w systemie.
            </p>
            <Button
              type="button"
              variant="primary"
              className={styles.studioCta}
              onClick={openUploadPicker}
            >
              <Plus size={16} style={{ marginRight: 8 }} aria-hidden />
              Nowy szablon
            </Button>
          </header>

          {isLoading ? (
            <p className={styles.quietHint}>Ładowanie…</p>
          ) : isError ? (
            <EmptyState
              title="Nie udało się wczytać szablonów"
              description="Sprawdź połączenie i spróbuj ponownie."
            />
          ) : sorted.length === 0 ? (
            <EmptyState
              title="Brak szablonów umów"
              description="Prześlij DOCX lub PDF swojego kontraktu — AI wykryje zmienne, a Ty nigdy nie przebudujesz umowy od zera."
              action={
                <Button
                  type="button"
                  variant="primary"
                  onClick={openUploadPicker}
                >
                  Nowy szablon
                </Button>
              }
            />
          ) : (
            <div className={styles.contractGrid}>
              {sorted.map((t) => (
                <ContractCard
                  key={t.id}
                  template={t}
                  onRename={() => setRenameTarget(t)}
                  onDuplicate={() => void handleDuplicate(t)}
                  onReplace={() => {
                    setReplaceTarget(t)
                    replaceRef.current?.click()
                  }}
                  onReanalyze={() => void handleReanalyze(t)}
                  onDelete={() => setDeleteTarget(t)}
                />
              ))}
            </div>
          )}
        </div>
      </PageContainer>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFilePicked(file)
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleReplace(file)
        }}
      />

      <RenameTemplateModal
        key={renameTarget ? `${renameTarget.id}-${renameTarget.updatedAt}` : 'closed'}
        open={Boolean(renameTarget)}
        busy={rename.isPending}
        error={
          rename.error instanceof Error ? rename.error.message : null
        }
        initialName={renameTarget?.name ?? ''}
        initialDescription={renameTarget?.description ?? null}
        onClose={() => setRenameTarget(null)}
        onSubmit={async ({ name, description }) => {
          if (!renameTarget) return
          await rename.mutateAsync({
            id: renameTarget.id,
            name,
            description: description || null,
          })
          showToast('Zapisano.', 'success')
          setRenameTarget(null)
        }}
      />

      <DeleteContractModal
        open={Boolean(deleteTarget)}
        contractName={deleteTarget?.name ?? ''}
        busy={remove.isPending}
        onClose={() => {
          if (!remove.isPending) setDeleteTarget(null)
        }}
        onConfirm={() => void handleDelete()}
      />
    </AppLayout>
  )
}
