import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Input'
import { formatShortDate } from '@/lib/utils/dates'
import type { WeddingNote } from '@/types/wedding'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from './NotesSection.module.css'

interface NotesSectionProps {
  notes: WeddingNote[]
  editing?: boolean
  onChangeNotes?: (notes: WeddingNote[]) => void
  onAddNote?: () => void
}

export function NotesSection({
  notes,
  editing = false,
  onChangeNotes,
  onAddNote,
}: NotesSectionProps) {
  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  function updateNote(id: string, patch: Partial<WeddingNote>) {
    onChangeNotes?.(notes.map((n) => (n.id === id ? { ...n, ...patch } : n)))
  }

  function removeNote(id: string) {
    onChangeNotes?.(notes.filter((n) => n.id !== id))
  }

  function addNote() {
    onChangeNotes?.([
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

  return (
    <Card padding="md">
      <CardHeader
        title="Notatki"
        action={
          editing ? (
            <Button type="button" variant="secondary" size="sm" onClick={addNote}>
              + Dodaj notatkę
            </Button>
          ) : onAddNote ? (
            <Button type="button" variant="secondary" size="sm" onClick={onAddNote}>
              + Dodaj notatkę
            </Button>
          ) : undefined
        }
      />
      {sorted.length === 0 ? (
        <p className={styles.empty}>Brak notatek</p>
      ) : editing ? (
        <ul className={editStyles.inlineList}>
          {sorted.map((note) => (
            <li key={note.id} className={editStyles.inlineItem}>
              <Textarea
                label="Treść"
                rows={3}
                value={note.content}
                onChange={(e) => updateNote(note.id, { content: e.target.value })}
              />
              <div className={editStyles.inlineActions}>
                <label className={editStyles.muted}>
                  <input
                    type="checkbox"
                    checked={Boolean(note.pinned)}
                    onChange={(e) =>
                      updateNote(note.id, { pinned: e.target.checked })
                    }
                  />{' '}
                  Przypięta
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeNote(note.id)}
                >
                  Usuń
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.list}>
          {sorted.map((note) => (
            <li key={note.id} className={styles.note}>
              <div className={styles.meta}>
                <span className={styles.author}>{note.author}</span>
                {note.pinned && <span className={styles.badge}>Przypięta</span>}
                {note.badge && <span className={styles.badge}>{note.badge}</span>}
                <time className={styles.date}>
                  {formatShortDate(note.createdAt)}
                </time>
              </div>
              <p className={styles.content}>{note.content}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
