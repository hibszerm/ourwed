import type { CSSProperties } from 'react'
import type { ThemeDefinition } from '@/features/theme/themeRegistry'
import type { ThemeId } from '@/features/theme/types'
import styles from './ThemePreviewCard.module.css'

interface Props {
  theme: ThemeDefinition
  selected: boolean
  disabled?: boolean
  onSelect: (id: ThemeId) => void
}

/**
 * Mini UI preview built from the theme's real token values (not screenshots).
 */
export function ThemePreviewCard({
  theme,
  selected,
  disabled,
  onSelect,
}: Props) {
  const t = theme.tokens
  const previewStyle = {
    '--tp-bg': t['--app-background'],
    '--tp-sidebar': t['--sidebar-background'],
    '--tp-card': t['--card-background'],
    '--tp-border': t['--card-border'],
    '--tp-text': t['--text-primary'],
    '--tp-muted': t['--text-secondary'],
    '--tp-btn': t['--button-primary-background'],
    '--tp-btn-text': t['--button-primary-text'],
    '--tp-badge-bg': t['--badge-neutral-background'],
    '--tp-badge-text': t['--badge-neutral-text'],
  } as CSSProperties

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${theme.name}. ${theme.description}${selected ? ' Wybrany.' : ''}`}
      disabled={disabled}
      className={[styles.card, selected ? styles.selected : ''].filter(Boolean).join(' ')}
      style={previewStyle}
      onClick={() => onSelect(theme.id)}
    >
      <div className={styles.preview} aria-hidden="true">
        <div className={styles.previewSidebar} />
        <div className={styles.previewMain}>
          <div className={styles.previewCard}>
            <span className={styles.previewTitle}>Panel</span>
            <span className={styles.previewBadge}>Status</span>
            <span className={styles.previewBtn}>Akcja</span>
          </div>
        </div>
      </div>

      <div className={styles.meta}>
        <div className={styles.metaTop}>
          <span className={styles.name}>{theme.name}</span>
          {selected ? (
            <span className={styles.selectedMark} aria-hidden="true">
              Wybrany
            </span>
          ) : null}
        </div>
        <p className={styles.description}>{theme.description}</p>
        <div className={styles.dots} aria-hidden="true">
          {theme.referencePalette.slice(0, 5).map((color) => (
            <span
              key={color}
              className={styles.dot}
              style={{ background: color }}
            />
          ))}
        </div>
      </div>
    </button>
  )
}
