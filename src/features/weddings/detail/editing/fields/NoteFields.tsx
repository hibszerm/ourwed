import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import type { WeddingNote } from '@/types/wedding'
import styles from '../WeddingEditorFields.module.css'

export function NoteFields({
  notes,
  onChangeNotes,
}: {
  notes: WeddingNote[]
  onChangeNotes: (notes: WeddingNote[]) => void
}) {
  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className={styles.fieldGrid}>
      <div className={styles.rowActions}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            onChangeNotes([
              ...notes,
              {
                id: `temp-${crypto.randomUUID()}`,
                content: '',
                createdAt: new Date().toISOString(),
                author: 'Firma',
                pinned: false,
              },
            ])
          }
        >
          Dodaj notatkę
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className={styles.muted}>Brak notatek.</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((note) => (
            <li key={note.id} className={styles.listItem}>
              <Textarea
                label="Treść"
                rows={3}
                value={note.content}
                onChange={(e) =>
                  onChangeNotes(
                    notes.map((n) =>
                      n.id === note.id
                        ? { ...n, content: e.target.value }
                        : n,
                    ),
                  )
                }
              />
              <div className={styles.rowActions}>
                <label className={styles.muted}>
                  <input
                    type="checkbox"
                    checked={Boolean(note.pinned)}
                    onChange={(e) =>
                      onChangeNotes(
                        notes.map((n) =>
                          n.id === note.id
                            ? { ...n, pinned: e.target.checked }
                            : n,
                        ),
                      )
                    }
                  />{' '}
                  Przypięta
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChangeNotes(notes.filter((n) => n.id !== note.id))
                  }
                >
                  Usuń
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
