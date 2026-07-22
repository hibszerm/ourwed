import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { nameFromFileName } from '@/features/documents/contractUi'
import type { DocumentDocType } from '@/types/documents'
import styles from '../DocumentsTemplates.module.css'

interface UploadTemplateModalProps {
  open: boolean
  busy?: boolean
  error?: string | null
  initialFile?: File | null
  initialName?: string
  onClose: () => void
  onSubmit: (input: {
    name: string
    description: string
    docType: DocumentDocType
    file: File
    setAsDefault: boolean
  }) => Promise<void>
}

export function UploadTemplateModal({
  open,
  busy,
  error,
  initialFile = null,
  initialName = '',
  onClose,
  onSubmit,
}: UploadTemplateModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [file, setFile] = useState<File | null>(initialFile)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setFile(initialFile)
    setLocalError(null)
  }, [open, initialFile, initialName])

  function reset() {
    setName('')
    setFile(null)
    setLocalError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit() {
    setLocalError(null)
    if (!name.trim()) {
      setLocalError('Podaj nazwę umowy.')
      return
    }
    if (!file) {
      setLocalError('Wybierz plik PDF lub DOCX.')
      return
    }
    await onSubmit({
      name: name.trim(),
      description: '',
      docType: 'contract',
      file,
      setAsDefault: false,
    })
    reset()
  }

  return (
    <Modal
      open={open}
      title="Prześlij umowę"
      description="PDF lub DOCX. OurWed przygotuje resztę."
      onClose={() => {
        if (busy) return
        reset()
        onClose()
      }}
      busy={busy}
      primaryAction={
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => void handleSubmit()}
        >
          {busy ? 'Przesyłanie…' : 'Prześlij'}
        </Button>
      }
    >
      {(localError || error) && (
        <p className={styles.error}>{localError || error}</p>
      )}
      <label className={styles.field}>
        Nazwa
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="np. Umowa fotograficzna"
          disabled={busy}
        />
      </label>
      <label className={styles.field}>
        Plik
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null
            setFile(next)
            if (next && !name.trim()) {
              setName(nameFromFileName(next.name))
            }
          }}
        />
        {file ? (
          <p className={styles.fileHint}>{file.name}</p>
        ) : (
          <p className={styles.fileHint}>PDF lub DOCX</p>
        )}
      </label>
    </Modal>
  )
}

interface RenameTemplateModalProps {
  open: boolean
  busy?: boolean
  error?: string | null
  initialName: string
  initialDescription: string | null
  onClose: () => void
  onSubmit: (input: { name: string; description: string }) => Promise<void>
}

export function RenameTemplateModal({
  open,
  busy,
  error,
  initialName,
  initialDescription,
  onClose,
  onSubmit,
}: RenameTemplateModalProps) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setDescription(initialDescription ?? '')
  }, [open, initialName, initialDescription])

  return (
    <Modal
      open={open}
      title="Zmień nazwę"
      onClose={onClose}
      busy={busy}
      primaryAction={
        <Button
          type="button"
          variant="primary"
          disabled={busy || !name.trim()}
          onClick={() =>
            void onSubmit({ name: name.trim(), description: description.trim() })
          }
        >
          Zapisz
        </Button>
      }
    >
      {error && <p className={styles.error}>{error}</p>}
      <label className={styles.field}>
        Nazwa
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </label>
    </Modal>
  )
}
