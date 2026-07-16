import styles from './ProgressBar.module.css'

interface ProgressBarProps {
  value: number
  max?: number
  showLabel?: boolean
}

export function ProgressBar({ value, max = 100, showLabel = true }: ProgressBarProps) {
  const percent = Math.round(Math.min(100, (value / max) * 100))

  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {showLabel && <span className={styles.label}>{percent}%</span>}
    </div>
  )
}
