import { IconCheck } from '@/components/icons'
import { LandingButton } from '@/features/landing-v3/components/LandingButton'
import { DEMO_ASSIGNMENT } from '@/features/landing-v3/data/demoData'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const COMPLETION = [
  'Umowa podpisana',
  'Płatności zarejestrowane',
  'Ankieta przedślubna wypełniona',
  'Dane dnia zatwierdzone',
  'Kalendarze zsynchronizowane',
] as const

export function FinalCtaSection() {
  return (
    <section
      className={styles.finalCta}
      data-testid="lv3-final-cta"
      aria-labelledby="cta-title"
    >
      <div className={styles.finalCtaGrid}>
        <div>
          <h2 id="cta-title" className={styles.editorialTitleOnDark}>
            Mniej pilnowania.
            <br />
            Więcej czasu na realizację.
          </h2>
          <div className={styles.heroCtas}>
            <LandingButton to="/register" variant="primary">
              Załóż bezpłatne konto
            </LandingButton>
            <LandingButton to="/login" variant="secondary">
              Zaloguj się
            </LandingButton>
          </div>
        </div>

        <article
          className={styles.finalSummary}
          data-testid="lv3-final-focus-card"
          data-landing-preview=""
        >
          <h3>{DEMO_ASSIGNMENT.displayName}</h3>
          <p className={styles.finalMeta}>{DEMO_ASSIGNMENT.dateLabel}</p>
          <ul>
            {COMPLETION.map((item) => (
              <li key={item}>
                <IconCheck width={16} height={16} aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  )
}
