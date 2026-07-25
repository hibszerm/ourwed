import type { QuestionOption } from '@/types/form'
import styles from './SelectableOptionCards.module.css'

interface SelectableOptionCardsProps {
  options: QuestionOption[]
  value: string[]
  onChange: (next: string[]) => void
  readOnly?: boolean
  name: string
  /** denser layout for additional services */
  compact?: boolean
}

/**
 * Compact multi-select rows — name + selected state only.
 * Prices / descriptions stay in snapshots but are not rendered publicly.
 */
export function SelectableOptionCards({
  options,
  value,
  onChange,
  readOnly = false,
  name,
  compact = false,
}: SelectableOptionCardsProps) {
  function toggle(id: string) {
    if (readOnly) return
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  return (
    <div
      className={compact ? styles.listCompact : styles.list}
      role="group"
      aria-label={name}
    >
      {options.map((opt) => {
        const checked = value.includes(opt.value)
        return (
          <label
            key={opt.value}
            className={[
              styles.row,
              checked ? styles.selected : '',
              readOnly ? styles.readOnly : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid={
              compact ? 'extra-service-option' : 'package-option'
            }
          >
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={checked}
              disabled={readOnly}
              onChange={() => toggle(opt.value)}
            />
            <span className={styles.title}>{opt.label}</span>
            <span
              className={[styles.check, checked ? styles.checkOn : '']
                .filter(Boolean)
                .join(' ')}
              aria-hidden
            />
          </label>
        )
      })}
      {options.length === 0 ? (
        <p className={styles.empty}>Brak dostępnych opcji.</p>
      ) : null}
    </div>
  )
}
