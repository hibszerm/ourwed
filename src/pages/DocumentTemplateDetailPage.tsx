import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import {
  useDocumentTemplate,
  useDocumentTemplateMutations,
  useDocumentTemplateVersions,
} from '@/features/documents/hooks/useDocumentTemplates'
import { DeleteContractModal } from '@/features/documents/components/DeleteContractModal'
import { TemplateDetailHero } from '@/features/documents/components/TemplateDetailHero'
import { TemplateInfoGrid } from '@/features/documents/components/TemplateInfoGrid'
import { TemplateDocumentHealth } from '@/features/documents/components/TemplateDocumentHealth'
import {
  TemplateMappingSlots,
  TemplateNextStepPanel,
} from '@/features/documents/components/TemplateNextStepPanel'
import { TemplateVersionTimeline } from '@/features/documents/components/TemplateVersionTimeline'
import { TemplateDetailsDrawer } from '@/features/documents/components/TemplateDetailsDrawer'
import { RenameTemplateModal } from '@/features/documents/components/TemplateModals'
import type { DocumentTemplateVersion } from '@/types/documents'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: template, isLoading, isError } = useDocumentTemplate(id)
  const { data: versions = [] } = useDocumentTemplateVersions(id)
  const mutations = useDocumentTemplateMutations(id)

  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [focusVersion, setFocusVersion] =
    useState<DocumentTemplateVersion | null>(null)

  if (isLoading) {
    return (
      <AppLayout title="Szablon">
        <PageContainer width="wide">
          <p className={styles.fileHint}>Ładowanie…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !template) {
    return (
      <AppLayout title="Szablon">
        <PageContainer width="wide">
          <EmptyState
            title="Nie znaleziono szablonu"
            description="Szablon mógł zostać usunięty lub nie masz do niego dostępu."
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/ustawienia/dokumenty/szablony')}
              >
                Wróć do biblioteki
              </Button>
            }
          />
        </PageContainer>
      </AppLayout>
    )
  }

  const hasFile = Boolean(template.sourceFileName || template.sourceDocxPath)
  const mappingLegacy =
    template.componentCount > 0 ||
    template.blockCount > 0 ||
    template.variableCount > 0
  const aiAnalyzed = Boolean(template.aiAnalyzedAt) || mappingLegacy
  const questionnaireCreated =
    Boolean(template.questionnaireFormId) || mappingLegacy
  const configurationCompleted = questionnaireCreated
  const canMarkReady =
    configurationCompleted &&
    template.status !== 'ready' &&
    template.status !== 'archived'

  function openUpload() {
    fileRef.current?.click()
  }

  async function onUploadVersion(file: File) {
    await mutations.uploadVersion.mutateAsync({
      id: template!.id,
      file,
    })
    showToast('Dodano nową wersję dokumentu.', 'success')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete() {
    try {
      await mutations.remove.mutateAsync(template!.id)
      showToast('Kontrakt usunięty.', 'success')
      setDeleteOpen(false)
      navigate('/ustawienia/dokumenty/szablony')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Nie udało się usunąć.',
        'error',
      )
    }
  }

  return (
    <AppLayout
      title={template.name}
      subtitle="Biblioteka dokumentów"
      action={
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate('/ustawienia/dokumenty/szablony')}
        >
          <ArrowLeft size={16} style={{ marginRight: 6 }} aria-hidden />
          Biblioteka
        </Button>
      }
    >
      <PageContainer width="wide">
        <div className={styles.page}>
          <TemplateDetailHero
            template={template}
            uploadPending={mutations.uploadVersion.isPending}
            onUploadVersion={openUpload}
            onRename={() => setRenameOpen(true)}
            onDuplicate={() =>
              void mutations.duplicate.mutateAsync(template.id).then((copy) => {
                showToast('Utworzono kopię szablonu.', 'success')
                navigate(`/ustawienia/dokumenty/szablony/${copy.id}`)
              })
            }
            onArchiveOrRestore={() => {
              if (template.status === 'archived') {
                void mutations.restore.mutateAsync(template.id).then(() =>
                  showToast('Przywrócono szablon.', 'success'),
                )
              } else {
                void mutations.archive.mutateAsync(template.id).then(() =>
                  showToast('Szablon zarchiwizowany.', 'success'),
                )
              }
            }}
            onDelete={() => setDeleteOpen(true)}
            onMarkReady={
              canMarkReady
                ? () =>
                    void mutations.rename
                      .mutateAsync({ id: template.id, status: 'ready' })
                      .then(() =>
                        showToast('Szablon oznaczony jako gotowy.', 'success'),
                      )
                : undefined
            }
            onSetDefault={
              !template.isDefault && template.status !== 'archived'
                ? () =>
                    void mutations.setDefault.mutateAsync(template.id).then(() =>
                      showToast('Ustawiono jako domyślny w kategorii.', 'success'),
                    )
                : undefined
            }
            onOpenDetails={() => {
              setFocusVersion(null)
              setDetailsOpen(true)
            }}
          />

          <TemplateInfoGrid
            template={template}
            configured={configurationCompleted}
          />

          <div className={styles.detailMain}>
            <TemplateDocumentHealth
              status={template.status}
              hasFile={hasFile}
              hasVersion={Boolean(template.currentVersionNumber)}
              aiAnalyzed={aiAnalyzed}
              questionnaireCreated={questionnaireCreated}
            />

            <TemplateNextStepPanel
              configured={configurationCompleted}
              template={template}
            />

            <TemplateMappingSlots />
          </div>

          <TemplateVersionTimeline
            versions={versions}
            currentVersionId={template.currentVersionId}
            uploadPending={mutations.uploadVersion.isPending}
            onUploadVersion={openUpload}
            onViewDetails={(version) => {
              setFocusVersion(version)
              setDetailsOpen(true)
            }}
            onDuplicate={(versionId) =>
              void mutations.duplicateVersion.mutateAsync(versionId).then(() =>
                showToast('Utworzono kopię wersji.', 'success'),
              )
            }
            onRestore={(versionId) =>
              void mutations.setCurrentVersion
                .mutateAsync({
                  templateId: template.id,
                  versionId,
                })
                .then(() =>
                  showToast('Przywrócono wybraną wersję jako bieżącą.', 'success'),
                )
            }
          />
        </div>
      </PageContainer>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onUploadVersion(file)
        }}
      />

      <TemplateDetailsDrawer
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false)
          setFocusVersion(null)
        }}
        template={template}
        focusVersion={focusVersion}
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
          showToast('Zapisano zmiany.', 'success')
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
