import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { useDocumentTemplateMutations } from '@/features/documents/hooks/useDocumentTemplates'
import { nameFromFileName } from '@/features/documents/contractUi'
import {
  takePendingNewImport,
  type PendingNewImport,
} from '@/features/documents/import/attachedImportCache'
import { SimpleContractImportFlow } from '@/features/documents/import/SimpleContractImportFlow'

/**
 * Create-from-file entry: file is already chosen on the templates list.
 * Upload happens inside the wizard preparing step — never on the list button.
 */
export function DocumentTemplateNewPage() {
  const navigate = useNavigate()
  const { upload } = useDocumentTemplateMutations()
  const [pending] = useState<PendingNewImport | null>(() =>
    takePendingNewImport(),
  )
  const redirected = useRef(false)

  useEffect(() => {
    if (pending || redirected.current) return
    redirected.current = true
    navigate('/ustawienia/dokumenty/szablony', { replace: true })
  }, [pending, navigate])

  if (!pending) {
    return (
      <AppLayout>
        <PageContainer width="wide" />
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <PageContainer width="wide">
        <SimpleContractImportFlow
          key={pending.meta.fileName}
          mode="create"
          pendingAttachment={pending}
          templateName={nameFromFileName(pending.file.name)}
          onCreateTemplate={async ({ name, file }) => {
            const created = await upload.mutateAsync({
              name,
              description: null,
              docType: 'contract',
              file,
              setAsDefault: false,
            })
            return {
              templateId: created.id,
              sourceFileName: created.sourceFileName ?? file.name,
              sourceDocxPath: created.sourceDocxPath,
            }
          }}
        />
      </PageContainer>
    </AppLayout>
  )
}
