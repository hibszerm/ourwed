import type { Appearance } from '@/features/appearance/types'
import styles from './AppearanceCard.module.css'

interface Props {
  id: Appearance
  name: string
  description: string
  selected: boolean
  disabled?: boolean
  onSelect: (id: Appearance) => void
}

export function AppearanceCard({
  id,
  name,
  description,
  selected,
  disabled,
  onSelect,
}: Props) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${name}. ${description}${selected ? ' Wybrany.' : ''}`}
      disabled={disabled}
      className={[styles.card, selected ? styles.selected : '']
        .filter(Boolean)
        .join(' ')}
      data-appearance={id}
      onClick={() => onSelect(id)}
    >
      <span className={styles.glyph} aria-hidden="true">
        {id === 'light' ? (
          <span className={styles.glyphLight} />
        ) : (
          <span className={styles.glyphDark} />
        )}
      </span>
      <span className={styles.meta}>
        <span className={styles.metaTop}>
          <span className={styles.name}>{name}</span>
          {selected ? (
            <span className={styles.selectedMark} aria-hidden="true">
              Wybrany
            </span>
          ) : null}
        </span>
        <span className={styles.description}>{description}</span>
      </span>
    </button>
  )
}
