import { useRef, useState, type DragEvent } from 'react'
import { FileText } from 'lucide-react'
import { MAX_SOURCE_CONTRACT_BYTES } from '../constants'
import styles from './RecoveryUploadPanel.module.css'

export function RecoveryUploadPanel({
  selectedFile,
  disabled,
  onFile,
}: {
  selectedFile: File | null
  disabled?: boolean
  onFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function accept(file: File | undefined | null) {
    if (!file || disabled) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) return
    onFile(file)
  }

  return (
    <div className={styles.wrap}>
      <div
        className={styles.dropzone}
        data-dragging={dragging || undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault()
          setDragging(false)
          accept(e.dataTransfer.files?.[0])
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
      >
        {selectedFile ? (
          <div className={styles.fileChip}>
            <FileText size={20} aria-hidden />
            <div>
              <p className={styles.fileName}>{selectedFile.name}</p>
              <p className={styles.fileMeta}>
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.title}>Przeciągnij umowę tutaj</p>
            <p className={styles.hint}>PDF lub DOCX, maks. 15 MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className={styles.hiddenInput}
          onChange={(e) => accept(e.target.files?.[0] ?? null)}
        />
      </div>
      <p className={styles.limit}>
        Obsługiwane formaty: PDF, DOCX. Maksymalny rozmiar:{' '}
        {Math.round(MAX_SOURCE_CONTRACT_BYTES / (1024 * 1024))} MB.
      </p>
    </div>
  )
}
