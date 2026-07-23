import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer } from '@/components/ui/PageContainer'
import {
  useDocumentTemplate,
  useDocumentTemplateMutations,
} from '@/features/documents/hooks/useDocumentTemplates'
import { SimpleContractImportFlow } from '@/features/documents/import/SimpleContractImportFlow'
import styles from '@/features/documents/DocumentsTemplates.module.css'

export function DocumentTemplateMappingPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: template, isLoading, isError } = useDocumentTemplate(id)
  const mutations = useDocumentTemplateMutations(id)

  if (isLoading) {
    return (
      <AppLayout title="Szablony dokumentów">
        <PageContainer width="wide">
          <p className={styles.quietHint}>Ładowanie…</p>
        </PageContainer>
      </AppLayout>
    )
  }

  if (isError || !template) {
    return (
      <AppLayout title="Szablony dokumentów">
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
                Wróć
              </Button>
            }
          />
        </PageContainer>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <SimpleContractImportFlow
          key={template.id}
          templateId={template.id}
          templateName={template.name}
          sourceFileName={template.sourceFileName}
          sourceDocxPath={template.sourceDocxPath}
          onRenameTemplate={async (name) => {
            await mutations.rename.mutateAsync({ id: template.id, name })
          }}
          onUploadFile={async (file) => {
            const sourceBytes = await file.arrayBuffer()
            const version = await mutations.uploadVersion.mutateAsync({
              id: template.id,
              file,
            })
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
