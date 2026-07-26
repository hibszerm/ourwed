import { CinematicStage } from '@/features/landing-v2/scenes/CinematicStage'
import styles from './LandingV2.module.css'

type LandingV2Props = {
  onLogin: () => void
  onRegister: () => void
}

/**
 * Landing V2 — one continuous cinematic product film.
 * Controlled by a single GSAP ScrollTrigger timeline.
 */
export function LandingV2({ onLogin, onRegister }: LandingV2Props) {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <a
            href="#"
            className={styles.logo}
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <span className={styles.logoMark} aria-hidden>
              OW
            </span>
            <span className={styles.logoText}>OurWed</span>
          </a>
          <nav className={styles.navLinks} aria-label="Nawigacja">
            <button type="button" className={styles.navGhost} onClick={onLogin}>
              Zaloguj się
            </button>
            <button
              type="button"
              className={styles.navCta}
              onClick={onRegister}
            >
              Wypróbuj
            </button>
          </nav>
        </div>
      </header>

      <main>
        <CinematicStage onLogin={onLogin} onRegister={onRegister} />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.logoText}>OurWed</span>
          <p>Platforma dla branży ślubnej.</p>
          <p className={styles.copy}>© {new Date().getFullYear()} OurWed</p>
        </div>
      </footer>
    </div>
  )
}
