import type { WeddingsViewMode } from '@/features/weddings/presentation/weddingsViewMode'
import styles from './ModernWeddingsViewSwitch.module.css'

interface ModernWeddingsViewSwitchProps {
  value: WeddingsViewMode
  onChange: (mode: WeddingsViewMode) => void
}

export function ModernWeddingsViewSwitch({
  value,
  onChange,
}: ModernWeddingsViewSwitchProps) {
  return (
    <div
      className={styles.wrap}
      role="group"
      aria-label="Sposób wyświetlania ślubów"
      data-testid="modern-weddings-view-switch"
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
