import { getCountdownParts } from '@/lib/utils/dates'
import styles from './Countdown.module.css'

interface CountdownProps {
  targetDate: string
  size?: 'sm' | 'lg'
}

export function Countdown({ targetDate, size = 'lg' }: CountdownProps) {
  const { days, isPast, isToday } = getCountdownParts(targetDate)

  if (isPast) {
    return (
      <div className={`${styles.countdown} ${styles[size]}`}>
        <span className={styles.past}>Ślub już się odbył</span>
      </div>
    )
  }

  if (isToday) {
    return (
      <div className={`${styles.countdown} ${styles[size]}`}>
        <span className={styles.today}>Dziś jest ten dzień</span>
      </div>
    )
  }

  return (
    <div className={`${styles.countdown} ${styles[size]}`}>
      <div className={styles.block}>
        <span className={styles.number}>{days}</span>
        <span className={styles.unit}>dni</span>
      </div>
    </div>
  )
}
