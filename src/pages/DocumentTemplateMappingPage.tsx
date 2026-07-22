import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import {
  useDocumentTemplate,
  useDocumentTemplateMutations,
} from '@/features/documents/hooks/useDocumentTemplates'
import { MappingWizardProvider } from '@/features/documents/mapping/state/MappingWizardProvider'
import { MappingWizardLayout } from '@/features/documents/mapping/components/MappingWizardLayout'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplateMappingPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: template, isLoading, isError } = useDocumentTemplate(id)
  const mutations = useDocumentTemplateMutations(id)

  if (isLoading) {
    return (
      <AppLayout title="Konfiguracja szablonu">
        <PageContainer width="wide">
          <p className={styles.fileHint}>Ładowanie…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !template) {
    return (
      <AppLayout title="Konfiguracja szablonu">
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

  return (
    <AppLayout title="Konfiguracja szablonu">
      <PageContainer width="wide">
        <MappingWizardProvider
          key={template.id}
          templateId={template.id}
          templateVersionId={template.currentVersionId}
          sourceFileName={template.sourceFileName}
          sourceDocxPath={template.sourceDocxPath}
        >
          <MappingWizardLayout
            templateId={template.id}
            templateName={template.name}
            onUploadFile={async (file) => {
              const sourceBytes = await file.arrayBuffer()
              const version = await mutations.uploadVersion.mutateAsync({
                id: template.id,
                file,
              })
              showToast('Dokument zapisany jako nowa wersja.', 'success')
              return {
                templateVersionId: version.id,
                sourceFileName: version.sourceFileName ?? file.name,
                sourceDocxPath: version.sourceDocxPath,
                sourceBytes,
              }
            }}
          />
        </MappingWizardProvider>
      </PageContainer>
    </AppLayout>
  )
}
