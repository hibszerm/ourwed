import type { InterfaceStyle } from '@/features/interface-style/types'
import styles from './InterfaceStyleCard.module.css'

interface Props {
  id: InterfaceStyle
  name: string
  description: string
  selected: boolean
  disabled?: boolean
  onSelect: (id: InterfaceStyle) => void
}

export function InterfaceStyleCard({
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
      data-style={id}
      onClick={() => onSelect(id)}
    >
      <span className={styles.glyph} aria-hidden="true">
        <span className={styles.glyphSidebar} />
        <span className={styles.glyphMain}>
          <span className={styles.glyphBar} />
          <span className={styles.glyphBar} />
          <span className={styles.glyphBar} />
        </span>
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
