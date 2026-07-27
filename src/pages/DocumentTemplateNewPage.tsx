import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { useDocumentTemplateMutations } from '@/features/documents/hooks/useDocumentTemplates'
import { nameFromFileName } from '@/features/documents/contractUi'
import {
  takePendingNewImport,
  type PendingNewImport,
} from '@/features/documents/import/attachedImportCache'
import { SimpleContractImportFlow } from '@/features/documents/import/SimpleContractImportFlow'
import { validateContractDocx } from '@/features/documents/import/contractUploadValidation'
import { documentTemplateService } from '@/lib/api/documents'
import styles from './DocumentTemplateNewPage.module.css'

/**
 * Create-from-file entry: file is already chosen on the templates list.
 * Upload happens inside the wizard preparing step — never on the list button.
 */
export function DocumentTemplateNewPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { upload } = useDocumentTemplateMutations()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingNewImport | null>(() =>
    takePendingNewImport(),
  )

  if (!pending || !validateContractDocx(pending.file).ok) {
    return (
      <AppLayout title="Nowy szablon umowy">
        <PageContainer>
          <section className={styles.uploadCard}>
            <p className={styles.eyebrow}>Własny szablon</p>
            <h2>Dodaj dokument DOCX</h2>
            <p>
              Wybierz niepusty plik DOCX. Po przesłaniu OurWed przeanalizuje go
              i przygotuje szablon automatycznie.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const validation = validateContractDocx(file)
                if (!validation.ok) {
                  showToast(validation.message, 'error')
                  event.target.value = ''
                  return
                }
                setPending({
                  file,
                  bytes: null,
                  meta: {
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type || '',
                  },
                })
              }}
            />
            <div className={styles.actions}>
              <Button
                type="button"
                variant="primary"
                onClick={() => fileRef.current?.click()}
              >
                Wybierz DOCX
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/studio/pakiety')}
              >
                Anuluj
              </Button>
            </div>
          </section>
        </PageContainer>
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
          onCreateTemplate={async ({ name, file, serviceType }) => {
            const created = await upload.mutateAsync({
              name,
              description: null,
              docType: 'contract',
              file,
              setAsDefault: false,
            })
            await documentTemplateService.update(created.id, {
              category:
                serviceType === 'foto'
                  ? 'Foto'
                  : serviceType === 'video'
                    ? 'Video'
                    : serviceType === 'foto_video'
                      ? 'Foto + Video'
                      : 'Inny',
              meta: {
                ...created.meta,
                version: 1,
                templateServiceType: serviceType,
              },
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
