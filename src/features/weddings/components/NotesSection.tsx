import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { formatShortDate } from '@/lib/utils/dates'
import type { WeddingNote } from '@/types/wedding'
import styles from './NotesSection.module.css'

interface NotesSectionProps {
  notes: WeddingNote[]
  onAddNote?: () => void
}

export function NotesSection({ notes, onAddNote }: NotesSectionProps) {
  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <Card padding="md">
      <CardHeader
        title="Notatki"
        action={
          onAddNote ? (
            <Button type="button" variant="secondary" size="sm" onClick={onAddNote}>
              + Dodaj notatkę
            </Button>
          ) : undefined
        }
      />
      {sorted.length === 0 ? (
        <p className={styles.empty}>Brak notatek</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((note) => (
            <li key={note.id} className={styles.note}>
              <div className={styles.meta}>
                <span className={styles.author}>{note.author}</span>
                {note.pinned && <span className={styles.badge}>Przypięta</span>}
                {note.badge && <span className={styles.badge}>{note.badge}</span>}
                <time className={styles.date}>{formatShortDate(note.createdAt)}</time>
              </div>
              <p className={styles.content}>{note.content}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
