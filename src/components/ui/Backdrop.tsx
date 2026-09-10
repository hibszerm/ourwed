import styles from './Backdrop.module.css'

interface BackdropProps {
  onClick?: () => void
  disabled?: boolean
  /** Accessible label for the dismiss control. */
  label?: string
  /** Optional entrance motion: settle = slightly longer fade for premium overlays. */
  entrance?: 'default' | 'settle'
}

/**
 * Fullscreen frosted backdrop. Always sits under the overlay panel (z-index 9990).
 */
export function Backdrop({
  onClick,
  disabled = false,
  label = 'Zamknij',
  entrance = 'default',
}: BackdropProps) {
  const className =
    entrance === 'settle'
      ? `${styles.backdrop} ${styles.backdropSettle}`
      : styles.backdrop

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      disabled={disabled || !onClick}
      tabIndex={-1}
      onClick={() => {
        if (!disabled && onClick) onClick()
      }}
    />
  )
}
