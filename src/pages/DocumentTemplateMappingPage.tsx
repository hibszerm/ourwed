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
import { SimpleContractImportFlow } from '@/features/documents/import/SimpleContractImportFlow'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplateMappingPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: template, isLoading, isError } = useDocumentTemplate(id)
  const mutations = useDocumentTemplateMutations(id)

  if (isLoading) {
    return (
      <AppLayout title="Szablony dokumentów">
        <PageContainer width="wide">
          <p className={styles.fileHint}>Ładowanie…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !template) {
    return (
      <AppLayout title="Szablony dokumentów">
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
    <AppLayout title="Szablony dokumentów">
      <PageContainer width="wide">
        <SimpleContractImportFlow
          key={template.id}
          templateId={template.id}
          templateName={template.name}
          sourceFileName={template.sourceFileName}
          sourceDocxPath={template.sourceDocxPath}
          onUploadFile={async (file) => {
            const sourceBytes = await file.arrayBuffer()
            const version = await mutations.uploadVersion.mutateAsync({
              id: template.id,
              file,
            })
            showToast('Kontrakt zapisany.', 'success')
            return {
              templateVersionId: version.id,
              sourceFileName: version.sourceFileName ?? file.name,
              sourceDocxPath: version.sourceDocxPath,
              sourceBytes,
            }
          }}
        />
      </PageContainer>
    </AppLayout>
  )
}
