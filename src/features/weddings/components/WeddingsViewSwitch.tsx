import type { WeddingsViewMode } from '@/features/weddings/presentation/weddingsViewMode'
import styles from './WeddingsViewSwitch.module.css'

interface WeddingsViewSwitchProps {
  value: WeddingsViewMode
  onChange: (mode: WeddingsViewMode) => void
}

/** Compact accessible segmented control: grid cards vs list. */
export function WeddingsViewSwitch({ value, onChange }: WeddingsViewSwitchProps) {
  return (
    <div
      className={styles.wrap}
      role="group"
      aria-label="Sposób wyświetlania ślubów"
      data-testid="weddings-view-switch"
    >
      <button
        type="button"
        className={value === 'grid' ? styles.active : styles.tab}
        aria-pressed={value === 'grid'}
        aria-label="Kafelki"
        onClick={() => onChange('grid')}
      >
        Kafelki
      </button>
      <button
        type="button"
        className={value === 'list' ? styles.active : styles.tab}
        aria-pressed={value === 'list'}
        aria-label="Lista"
        onClick={() => onChange('list')}
      >
        Lista
      </button>
    </div>
  )
}
