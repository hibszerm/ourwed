import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BrandMark } from '@/features/landing-v3/components/BrandMark'
import { LandingButton } from '@/features/landing-v3/components/LandingButton'
import { useScrolled } from '@/features/landing-v3/hooks/useScrolled'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const LINKS = [
  { href: '#produkt', label: 'Produkt' },
  { href: '#jak-dziala', label: 'Jak działa' },
  { href: '#cennik', label: 'Cennik' },
] as const

export function LandingV3Nav() {
  const scrolled = useScrolled()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header
      className={[styles.nav, scrolled ? styles.navScrolled : ''].join(' ')}
    >
      <div className={styles.navInner}>
        <a href="#top" className={styles.brand} aria-label="OurWed — początek strony">
          <BrandMark />
        </a>

        <nav aria-label="Główne">
          <ul className={styles.navLinks}>
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.navActions}>
          <LandingButton to="/login" variant="ghost">
            Zaloguj się
          </LandingButton>
          <LandingButton to="/register" variant="primary">
            Załóż konto
          </LandingButton>
        </div>

        <button
          type="button"
          className={styles.menuBtn}
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Zamknij menu' : 'Otwórz menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            className={styles.menuSheet}
            role="dialog"
            aria-label="Menu nawigacji"
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            {LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </a>
            ))}
            <LandingButton to="/login" variant="secondary">
              Zaloguj się
            </LandingButton>
            <LandingButton to="/register" variant="primary">
              Załóż konto
            </LandingButton>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
