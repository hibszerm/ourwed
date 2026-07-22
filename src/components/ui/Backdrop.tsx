import styles from './Backdrop.module.css'

interface BackdropProps {
  onClick?: () => void
  disabled?: boolean
  /** Accessible label for the dismiss control. */
  label?: string
}

/**
 * Fullscreen frosted backdrop. Always sits under the overlay panel (z-index 9990).
 */
export function Backdrop({
  onClick,
  disabled = false,
  label = 'Zamknij',
}: BackdropProps) {
  return (
    <button
      type="button"
      className={styles.backdrop}
      aria-label={label}
      disabled={disabled || !onClick}
      tabIndex={-1}
      onClick={() => {
        if (!disabled && onClick) onClick()
      }}
    />
  )
}
