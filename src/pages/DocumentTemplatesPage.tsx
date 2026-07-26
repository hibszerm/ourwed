import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import {
  useDocumentTemplateMutations,
  useDocumentTemplates,
} from '@/features/documents/hooks/useDocumentTemplates'
import { ContractCard } from '@/features/documents/components/ContractCard'
import { GeneratedContractsHub } from '@/features/documents/components/GeneratedContractsHub'
import { DeleteContractModal } from '@/features/documents/components/DeleteContractModal'
import { RenameTemplateModal } from '@/features/documents/components/TemplateModals'
import { setPendingNewImport } from '@/features/documents/import/attachedImportCache'
import { validateContractDocx } from '@/features/documents/import/contractUploadValidation'
import { startDocumentsPerf } from '@/features/documents/performance/documentsPerformance'
import { reanalyzeTemplate } from '@/features/documents/template/reanalyzeTemplate'
import type { DocumentTemplateSummary } from '@/types/documents'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplatesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const {
    data: templates = [],
    isLoading,
    isError,
    isFetching,
    isPlaceholderData,
  } = useDocumentTemplates()
  const { remove, rename, duplicate, uploadVersion } =
    useDocumentTemplateMutations()
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'templates' | 'generated'>(
    'templates',
  )

  useEffect(() => {
    const perf = startDocumentsPerf('documents-route')
    perf.stamp('routeMountedAt')
    return () => {
      /* route unmount */
    }
  }, [])

  useEffect(() => {
    if (isLoading && templates.length === 0) return
    const perf = startDocumentsPerf('documents-route')
    if (isPlaceholderData || templates.length > 0) {
      perf.stamp('firstCachedDataAt')
    }
    perf.stamp('metadataResponseAt')
    // Defer to next paint for cardsRenderedAt
    requestAnimationFrame(() => {
      perf.stamp('cardsRenderedAt')
      perf.finish({
        totalTemplateCount: templates.length,
        numberOfNetworkRequests: isFetching && !isPlaceholderData ? 1 : 0,
        analysisFunctionsCalled: 0,
        binaryFilesFetched: 0,
      })
    })
  }, [templates, isLoading, isFetching, isPlaceholderData])

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
    const validation = validateContractDocx(file)
    if (!validation.ok) {
      showToast(validation.message, 'error')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setPendingNewImport(file)
    navigate('/umowy/nowy')
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
      navigate(`/umowy/szablony/${copy.id}`)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się zduplikować.',
        'error',
      )
    }
  }

  async function handleReplace(file: File) {
    if (!replaceTarget) return
    const validation = validateContractDocx(file)
    if (!validation.ok) {
      showToast(validation.message, 'error')
      if (replaceRef.current) replaceRef.current.value = ''
      return
    }
    try {
      await uploadVersion.mutateAsync({ id: replaceTarget.id, file })
      showToast('Źródłowy dokument zamieniony. Uruchamiamy analizę…', 'success')
      navigate(`/umowy/szablony/${replaceTarget.id}/analiza`)
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
      await queryClient.invalidateQueries({
        queryKey: ['document-template-summaries'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['document-templates'],
      })
      console.info('[reanalyze-complete]', {
        templateId: result.templateId,
        templateVersionId: result.templateVersionId,
        readinessReady: result.readinessReady,
        paragraph36: result.slotMap.slots
          .filter((s) => s.paragraphIndex === 36)
          .map((s) => ({
            registryKey: s.registryKey,
            originalSpan: s.originalText,
            startOffset: s.startOffset,
            endOffset: s.endOffset,
          })),
      })
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
            <h1 className={styles.studioTitle}>Umowy</h1>
            <p className={styles.studioSubtitle}>
              Zarządzaj szablonami i wracaj do wygenerowanych umów w jednym,
              spokojnym miejscu.
            </p>
          </header>

          <div className={styles.contractTabs} role="tablist" aria-label="Umowy">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'templates'}
              className={styles.contractTab}
              onClick={() => setActiveTab('templates')}
            >
              Szablony
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'generated'}
              className={styles.contractTab}
              onClick={() => setActiveTab('generated')}
            >
              Wygenerowane umowy
            </button>
          </div>

          {activeTab === 'templates' ? (
            <>
              <div className={styles.tabToolbar}>
                <div>
                  <h2 className={styles.sectionHeading}>Szablony umów</h2>
                  <p className={styles.quietHint}>
                    Dodaj DOCX raz, a potem generuj umowy z danych zlecenia.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  className={styles.studioCta}
                  onClick={openUploadPicker}
                >
                  <Plus size={16} style={{ marginRight: 8 }} aria-hidden />
                  Nowy szablon
                </Button>
              </div>
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
              description="Prześlij umowę w formacie DOCX. OurWed przeanalizuje ją i przygotuje szablon automatycznie."
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
                  onUse={() => navigate(`/umowy/szablony/${t.id}`)}
                />
              ))}
            </div>
          )}
            </>
          ) : (
            <GeneratedContractsHub templates={templates} />
          )}
        </div>
      </PageContainer>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFilePicked(file)
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
