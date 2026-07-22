import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { getForm } from '@/lib/api/forms'
import { packageService } from '@/lib/api/packageService'
import {
  useDocumentTemplateMutations,
  useDocumentTemplates,
} from '@/features/documents/hooks/useDocumentTemplates'
import { ContractCard } from '@/features/documents/components/ContractCard'
import { DeleteContractModal } from '@/features/documents/components/DeleteContractModal'
import { UploadTemplateModal } from '@/features/documents/components/TemplateModals'
import { nameFromFileName } from '@/features/documents/contractUi'
import type { DocumentTemplateSummary } from '@/types/documents'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplatesPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: templates = [], isLoading, isError } = useDocumentTemplates()
  const { upload, remove } = useDocumentTemplateMutations()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [deleteTarget, setDeleteTarget] =
    useState<DocumentTemplateSummary | null>(null)

  const formIds = useMemo(
    () =>
      [
        ...new Set(
          templates
            .map((t) => t.questionnaireFormId)
            .filter((id): id is string => Boolean(id)),
        ),
      ],
    [templates],
  )

  const { data: packages = [] } = useQuery({
    queryKey: ['studio-packages', 'for-contracts'],
    queryFn: () => packageService.list({ activeOnly: false }),
  })

  const { data: formNames = {} } = useQuery({
    queryKey: ['contract-questionnaire-names', formIds],
    queryFn: async () => {
      const entries = await Promise.all(
        formIds.map(async (id) => {
          const form = await getForm(id)
          return [id, form?.name ?? null] as const
        }),
      )
      return Object.fromEntries(entries) as Record<string, string | null>
    },
    enabled: formIds.length > 0,
  })

  function openUploadPicker() {
    fileRef.current?.click()
  }

  function onFilePicked(file: File) {
    setPendingFile(file)
    setUploadOpen(true)
  }

  async function handleUpload(input: {
    name: string
    description: string
    docType: DocumentTemplateSummary['docType']
    file: File
    setAsDefault: boolean
  }) {
    const created = await upload.mutateAsync({
      name: input.name,
      description: input.description || null,
      docType: input.docType,
      file: input.file,
      setAsDefault: input.setAsDefault,
    })
    showToast('Umowa została przesłana.', 'success')
    setUploadOpen(false)
    setPendingFile(null)
    navigate(`/ustawienia/dokumenty/szablony/${created.id}/konfiguracja`)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget.id)
      showToast('Umowa została usunięta.', 'success')
      setDeleteTarget(null)
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się usunąć.',
        'error',
      )
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
            <h1 className={styles.studioTitle}>Szablony dokumentów</h1>
            <p className={styles.studioSubtitle}>
              Prześlij swoją umowę tylko raz. OurWed automatycznie przygotuje
              wszystko, co potrzebne do generowania umów oraz zbierania danych
              od par.
            </p>
            <Button
              type="button"
              variant="primary"
              className={styles.studioCta}
              onClick={openUploadPicker}
            >
              <Upload size={16} style={{ marginRight: 8 }} aria-hidden />
              Prześlij umowę
            </Button>
          </header>

          {isLoading ? (
            <p className={styles.quietHint}>Ładowanie…</p>
          ) : isError ? (
            <EmptyState
              title="Nie udało się wczytać umów"
              description="Sprawdź połączenie i spróbuj ponownie."
            />
          ) : sorted.length === 0 ? (
            <EmptyState
              title="Brak umów"
              description="Prześlij pierwszą umowę — OurWed automatycznie przygotuje wszystko, czego potrzebujesz."
              action={
                <Button
                  type="button"
                  variant="primary"
                  onClick={openUploadPicker}
                >
                  Prześlij umowę
                </Button>
              }
            />
          ) : (
            <div className={styles.contractGrid}>
              {sorted.map((t) => {
                const formId = t.questionnaireFormId
                const questionnaireName = formId
                  ? (formNames[formId] ?? null)
                  : null
                const packageNames = formId
                  ? packages
                      .filter((p) => p.questionnaireFormId === formId)
                      .map((p) => p.name)
                  : []
                return (
                  <ContractCard
                    key={t.id}
                    template={t}
                    questionnaireName={questionnaireName}
                    packageNames={packageNames}
                    onDelete={() => setDeleteTarget(t)}
                  />
                )
              })}
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
          if (file) onFilePicked(file)
          if (fileRef.current) fileRef.current.value = ''
        }}
      />

      <UploadTemplateModal
        open={uploadOpen}
        busy={upload.isPending}
        error={upload.error instanceof Error ? upload.error.message : null}
        initialFile={pendingFile}
        initialName={pendingFile ? nameFromFileName(pendingFile.name) : ''}
        onClose={() => {
          if (upload.isPending) return
          setUploadOpen(false)
          setPendingFile(null)
        }}
        onSubmit={handleUpload}
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
