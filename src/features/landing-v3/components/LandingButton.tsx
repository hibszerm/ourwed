import { Link } from 'react-router-dom'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

type Variant = 'primary' | 'secondary' | 'ghost'

const variantClass: Record<Variant, string> = {
  primary: styles.btnPrimary,
  secondary: styles.btnSecondary,
  ghost: styles.btnGhost,
}

export function LandingButton({
  to,
  href,
  children,
  variant = 'primary',
  onClick,
  type = 'button',
  'aria-label': ariaLabel,
}: {
  to?: string
  href?: string
  children: React.ReactNode
  variant?: Variant
  onClick?: () => void
  type?: 'button' | 'submit'
  'aria-label'?: string
}) {
  const className = `${styles.btn} ${variantClass[variant]}`

  if (to) {
    return (
      <Link to={to} className={className} aria-label={ariaLabel} onClick={onClick}>
        {children}
      </Link>
    )
  }

  if (href) {
    return (
      <a href={href} className={className} aria-label={ariaLabel} onClick={onClick}>
        {children}
      </a>
    )
  }

  return (
    <button type={type} className={className} aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  )
}
