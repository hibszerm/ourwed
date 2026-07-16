import type { Wedding } from '@/types/wedding'
import styles from './DashboardHero.module.css'

interface DashboardHeroProps {
  userName: string
  nextWedding: Wedding | null
}

export function DashboardHero({ userName }: DashboardHeroProps) {
  const greeting = getGreeting()

  return (
    <header className={styles.hero}>
      <p className={styles.greeting}>{greeting},</p>
      <h1 className={styles.name}>{userName}</h1>
    </header>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Dzień dobry'
  if (hour < 18) return 'Cześć'
  return 'Dobry wieczór'
}
