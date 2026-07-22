import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  TEMPLATE_CATEGORIES,
  type TemplateSortKey,
} from '@/features/documents/templateMeta'
import type { DocumentDocType } from '@/types/documents'
import styles from '../DocumentsTemplates.module.css'

interface UploadTemplateModalProps {
  open: boolean
  busy?: boolean
  error?: string | null
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
  onClose,
  onSubmit,
}: UploadTemplateModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [docType, setDocType] = useState<DocumentDocType>('contract')
  const [setAsDefault, setSetAsDefault] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  function reset() {
    setName('')
    setDescription('')
    setDocType('contract')
    setSetAsDefault(false)
    setFile(null)
    setLocalError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit() {
    setLocalError(null)
    if (!name.trim()) {
      setLocalError('Podaj nazwę szablonu.')
      return
    }
    if (!file) {
      setLocalError('Wybierz plik DOCX lub PDF.')
      return
    }
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      docType,
      file,
      setAsDefault,
    })
    reset()
  }

  return (
    <Modal
      open={open}
      title="Prześlij kontrakt"
      description="OurWed przeanalizuje dokument AI i przygotuje typ ankiety. Obsługujemy DOCX i PDF."
      onClose={() => {
        if (busy) return
        reset()
        onClose()
      }}
      busy={busy}
      size="lg"
      primaryAction={
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => void handleSubmit()}
        >
          {busy ? 'Przesyłanie…' : 'Prześlij kontrakt'}
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
          placeholder="np. Umowa ślubna"
          disabled={busy}
        />
      </label>
      <label className={styles.field}>
        Opis
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Opcjonalny opis dla studia"
          disabled={busy}
        />
      </label>
      <label className={styles.field}>
        Kategoria
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocumentDocType)}
          disabled={busy}
        >
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        Plik DOCX lub PDF
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className={styles.fileHint}>
          Plik zostanie bezpiecznie zapisany. Konfiguracja treści — później.
        </p>
      </label>
      <label className={styles.field} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={setAsDefault}
          onChange={(e) => setSetAsDefault(e.target.checked)}
          disabled={busy}
        />
        Ustaw jako domyślny w tej kategorii
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
      <label className={styles.field}>
        Opis
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={busy}
        />
      </label>
    </Modal>
  )
}

export function TemplateFiltersBar({
  search,
  category,
  status,
  sort,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
  onSortChange,
}: {
  search: string
  category: string
  status: string
  sort: TemplateSortKey
  onSearchChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onStatusChange: (v: string) => void
  onSortChange: (v: TemplateSortKey) => void
}) {
  return (
    <div className={styles.toolbar}>
      <input
        className={styles.search}
        type="search"
        placeholder="Szukaj szablonów…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Szukaj szablonów"
      />
      <select
        className={styles.filter}
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        aria-label="Filtr kategorii"
      >
        <option value="all">Wszystkie kategorie</option>
        {TEMPLATE_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        className={styles.filter}
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        aria-label="Filtr statusu"
      >
        <option value="all">Wszystkie statusy</option>
        <option value="draft">Szkic</option>
        <option value="ready">Gotowy</option>
        <option value="archived">Zarchiwizowany</option>
      </select>
      <select
        className={styles.sort}
        value={sort}
        onChange={(e) => onSortChange(e.target.value as TemplateSortKey)}
        aria-label="Sortowanie"
      >
        <option value="updated">Ostatnio aktualizowane</option>
        <option value="newest">Najnowsze</option>
        <option value="oldest">Najstarsze</option>
        <option value="alpha">Alfabetycznie</option>
      </select>
    </div>
  )
}
