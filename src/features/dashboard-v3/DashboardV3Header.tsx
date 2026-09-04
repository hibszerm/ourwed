import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import styles from './DashboardV3Header.module.css'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Dzień dobry'
  if (hour < 18) return 'Cześć'
  return 'Dobry wieczór'
}

interface DashboardV3HeaderProps {
  compact?: boolean
}

export function DashboardV3Header({
  compact = false,
}: DashboardV3HeaderProps) {
  const { data: studioUser } = useCurrentStudioUser()
  const userName = studioUser?.displayName ?? '—'

  return (
    <header
      className={`${styles.header} ${compact ? styles.compact : ''}`.trim()}
      data-dashboard-mobile-header={compact ? 'true' : undefined}
    >
      <div className={styles.identity}>
        <p className={styles.greeting}>{getGreeting()},</p>
        <h1 className={styles.name}>{userName}</h1>
      </div>
    </header>
  )
}
