import { useRef } from 'react'
import { CheckCircle2, FileText, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useMappingWizard } from '../../state/useMappingWizard'
import styles from '../../MappingWizard.module.css'

export function UploadStep({
  onUploadFile,
}: {
  onUploadFile: (file: File) => Promise<{
    templateVersionId: string
    sourceFileName: string
    sourceDocxPath: string | null
    sourceBytes: ArrayBuffer
  }>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const {
    state,
    notifyUploadStart,
    notifyUploadSuccess,
    notifyUploadError,
  } = useMappingWizard()

  const { draft, uploadStatus, uploadError } = state
  const hasFile = Boolean(draft.sourceFileName || draft.sourceDocxPath)
  const uploading = uploadStatus === 'uploading'

  async function handleFile(file: File) {
    notifyUploadStart()
    try {
      const result = await onUploadFile(file)
      notifyUploadSuccess({
        templateVersionId: result.templateVersionId,
        sourceFileName: result.sourceFileName,
        sourceDocxPath: result.sourceDocxPath,
        sourceBytes: result.sourceBytes,
      })
    } catch (err) {
      notifyUploadError(
        err instanceof Error ? err.message : 'Nie udało się przesłać pliku.',
      )
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className={styles.stepPanel} aria-labelledby="upload-step-title">
      <div className={styles.stepIntro}>
        <h2 id="upload-step-title" className={styles.stepTitle}>
          Prześlij kontrakt
        </h2>
        <p className={styles.stepBody}>
          Wrzuć swoją umowę — AI zrozumie, jakich informacji potrzebuje
          szablon. Obsługujemy DOCX, DOC i PDF.
        </p>
      </div>

      <div className={styles.docCard}>
        <div className={styles.docCardIcon} aria-hidden>
          <FileText size={28} strokeWidth={1.5} />
        </div>
        <div className={styles.docCardBody}>
          {hasFile ? (
            <>
              <p className={styles.docCardLabel}>Twój dokument</p>
              <p className={styles.docCardName}>
                {draft.sourceFileName ?? 'Dokument'}
              </p>
              <p className={styles.docCardMeta}>
                Gotowy do analizy AI
              </p>
            </>
          ) : (
            <>
              <p className={styles.docCardLabel}>Brak pliku</p>
              <p className={styles.docCardName}>DOCX, DOC lub PDF</p>
              <p className={styles.docCardMeta}>
                To Twój kontrakt — treść pozostaje bez zmian.
              </p>
            </>
          )}
        </div>
        <div className={styles.docCardStatus}>
          {uploading && (
            <span className={styles.statusPillNeutral}>Przesyłanie…</span>
          )}
          {!uploading && hasFile && uploadStatus === 'success' && (
            <span className={styles.statusPillSuccess}>
              <CheckCircle2 size={14} aria-hidden />
              Gotowy
            </span>
          )}
          {uploadStatus === 'error' && (
            <span className={styles.statusPillError}>Błąd</span>
          )}
        </div>
      </div>

      {uploadError && <p className={styles.errorText}>{uploadError}</p>}

      <div className={styles.stepActions}>
        <Button
          type="button"
          variant={hasFile ? 'secondary' : 'primary'}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={15} style={{ marginRight: 6 }} aria-hidden />
          {uploading
            ? 'Przesyłanie…'
            : hasFile
              ? 'Zastąp dokument'
              : 'Prześlij dokument'}
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,.doc,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
    </section>
  )
}
