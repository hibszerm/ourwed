import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { NoteFields } from '@/features/weddings/detail/editing/fields/NoteFields'
import { collaborativeNotesService, CollaborativeNotesError } from '@/features/collaboration/collaborativeNotesService'
import { noteService, NoteRevisionConflictError } from '@/lib/api/noteService'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'
import type { WeddingNote } from '@/types/wedding'

interface Props {
  open: boolean
  weddingId: string
  notes: WeddingNote[]
  mode: 'owner' | 'shared'
  accessVersion?: string
  onClose: () => void
  onSaved: () => Promise<WeddingNote[] | void> | WeddingNote[] | void
  onAuthorityLost?: (kind: 'UNAVAILABLE' | 'FORBIDDEN') => void
}

export function ManageWeddingNotesModal({
  open, ...props
}: Props) {
  if (!open) return null
  return <ManageWeddingNotesDialog {...props} open={open} />
}

function ManageWeddingNotesDialog({
  open, weddingId, notes, mode, accessVersion, onClose, onSaved, onAuthorityLost,
}: Props) {
  const [baseline, setBaseline] = useState<WeddingNote[]>(notes)
  const [draft, setDraft] = useState<WeddingNote[]>(notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const nextById = new Map(draft.map((note) => [note.id, note]))
      const baseById = new Map(baseline.map((note) => [note.id, note]))
      for (const original of baseline) {
        const next = nextById.get(original.id)
        if (!next) {
          if (!original.revision) throw new Error('Notatka wymaga ponownego odświeżenia.')
          if (mode === 'shared') {
            await collaborativeNotesService.delete({ weddingId, accessVersion: accessVersion!, note: original })
          } else {
            await noteService.delete(weddingId, original.id, original.revision)
          }
          continue
        }
        if (next.content.trim() === original.content && Boolean(next.pinned) === Boolean(original.pinned)) continue
        if (!original.revision) throw new Error('Notatka wymaga ponownego odświeżenia.')
        if (mode === 'shared') {
          await collaborativeNotesService.update({ weddingId, accessVersion: accessVersion!, note: { ...next, revision: original.revision } })
        } else {
          await noteService.update(weddingId, original.id, original.revision, { content: next.content, pinned: next.pinned })
        }
      }
      for (const note of draft) {
        if (baseById.has(note.id)) continue
        if (mode === 'shared') {
          await collaborativeNotesService.create({ weddingId, accessVersion: accessVersion!, content: note.content, pinned: Boolean(note.pinned) })
        } else {
          await noteService.create({ weddingId, content: note.content, author: note.author, pinned: Boolean(note.pinned) })
        }
      }
      await onSaved()
      onClose()
    } catch (caught) {
      if (caught instanceof CollaborativeNotesError && (caught.kind === 'UNAVAILABLE' || caught.kind === 'FORBIDDEN')) onAuthorityLost?.(caught.kind)
      setError(getUserFacingErrorMessage(caught, 'Nie udało się zapisać notatek. Odśwież listę i spróbuj ponownie.'))
      const currentNotes = await onSaved()
      const conflict = caught instanceof NoteRevisionConflictError
        || (caught instanceof CollaborativeNotesError && caught.kind === 'CONFLICT')
      if (conflict && Array.isArray(currentNotes)) {
        setBaseline(currentNotes)
        setDraft(currentNotes)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Notatki"
      description={mode === 'shared' ? 'Zmiany dotyczą notatek tego zlecenia i są widoczne zgodnie z przyznanym dostępem.' : 'Zarządzaj notatkami przypisanymi do tego zlecenia.'}
      onClose={onClose}
      busy={busy}
      size="lg"
      mobilePresentation="center"
      primaryAction={<Button type="button" variant="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Zapisywanie…' : 'Zapisz notatki'}</Button>}
    >
      <div data-testid="manage-wedding-notes" data-mode={mode}>
        {error ? <p role="alert">{error}</p> : null}
        <NoteFields notes={draft} onChangeNotes={setDraft} />
      </div>
    </Modal>
  )
}
