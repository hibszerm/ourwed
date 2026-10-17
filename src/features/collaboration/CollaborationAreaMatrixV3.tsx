import type { KeyboardEvent } from 'react'
import { COLLABORATION_AREA_OPTIONS, type CollaborationAreaAccess, type CollaborationAreaLevel } from './areaAccessV3'
import styles from './CollaborationPermissionMatrix.module.css'

const LABELS = ['Brak', 'Podgląd', 'Edycja'] as const

export function CollaborationAreaMatrixV3({ areas, onChange, disabled = false, variant = 'default' }: {
  areas: CollaborationAreaAccess
  onChange: (next: CollaborationAreaAccess) => void
  disabled?: boolean
  variant?: 'default' | 'premium'
}) {
  function onKey(event: KeyboardEvent<HTMLButtonElement>, level: CollaborationAreaLevel) {
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? Math.min(level + 1, 2)
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? Math.max(level - 1, 0)
        : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null
    if (next === null) return
    event.preventDefault()
    const option = COLLABORATION_AREA_OPTIONS.find((item) => item.key === event.currentTarget.dataset.area)
    if (!option) return
    onChange({ ...areas, [option.key]: next as CollaborationAreaLevel })
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return <div className={`${styles.matrix} ${variant === 'premium' ? styles.premium : ''}`}
    data-testid="collaboration-area-matrix-v3" data-variant={variant}>
    {COLLABORATION_AREA_OPTIONS.map(({ key, label }) => <div className={styles.row} key={key}>
      <span className={styles.label}>{label}</span>
      <div className={styles.controls} role="radiogroup" aria-label={label}>
        {LABELS.map((text, level) => <button type="button" role="radio" key={text}
          data-area={key} aria-checked={areas[key] === level} tabIndex={areas[key] === level ? 0 : -1}
          disabled={disabled} className={areas[key] === level ? styles.selected : ''}
          onClick={() => onChange({ ...areas, [key]: level as CollaborationAreaLevel })}
          onKeyDown={(event) => onKey(event, level as CollaborationAreaLevel)}>{text}</button>)}
      </div>
    </div>)}
  </div>
}
