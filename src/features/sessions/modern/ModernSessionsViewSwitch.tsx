import type { SessionsViewMode } from '@/features/sessions/presentation/sessionsViewMode'
import styles from './ModernSessionsViewSwitch.module.css'

interface ModernSessionsViewSwitchProps {
  value: SessionsViewMode
  onChange: (mode: SessionsViewMode) => void
}

export function ModernSessionsViewSwitch({
  value,
  onChange,
}: ModernSessionsViewSwitchProps) {
  return (
    <div
      className={styles.wrap}
      role="group"
      aria-label="Sposób wyświetlania sesji"
      data-testid="modern-sessions-view-switch"
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
