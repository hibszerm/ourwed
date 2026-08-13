import { useState } from 'react'
import { normalizeOperationalClock } from '@/features/wedding-day/operationalDayPlan'
import styles from './PreWeddingDayPlan.module.css'

interface Props {
  time: string | null
  disabled?: boolean
  onCommit: (time: string | null) => Promise<void>
}

export function OperationalTimeControl({ time, disabled, onCommit }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(time || '')
  const [saving, setSaving] = useState(false)

  async function commit(raw: string) {
    const next = normalizeOperationalClock(raw)
    const current = normalizeOperationalClock(time)
    setEditing(false)
    if (next === current) return
    setSaving(true)
    try {
      await onCommit(next)
    } finally {
      setSaving(false)
    }
  }

  if (disabled) {
    return <p className={styles.time}>{time || '—'}</p>
  }

  if (editing) {
    return (
      <input
        type="time"
        className={styles.timeInput}
        value={draft}
        aria-label="Godzina operacyjna"
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit(draft)
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
            setDraft(time || '')
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className={styles.timeButton}
      aria-label={time ? `Godzina ${time}, edytuj` : 'Ustaw godzinę'}
      disabled={saving}
      onClick={() => {
        setDraft(time || '')
        setEditing(true)
      }}
    >
      {time || '—'}
    </button>
  )
}
