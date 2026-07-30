import type { SessionsViewMode } from '@/features/sessions/presentation/sessionsViewMode'
import styles from '@/features/weddings/components/WeddingsViewSwitch.module.css'

interface SessionsViewSwitchProps {
  value: SessionsViewMode
  onChange: (mode: SessionsViewMode) => void
}

export function SessionsViewSwitch({ value, onChange }: SessionsViewSwitchProps) {
  return (
    <div
      className={styles.wrap}
      role="group"
      aria-label="Sposób wyświetlania sesji"
      data-testid="sessions-view-switch"
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
