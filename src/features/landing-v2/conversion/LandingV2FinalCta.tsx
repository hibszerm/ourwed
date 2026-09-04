import { LandingButton } from '@/features/landing-v3/components/LandingButton'
import { usePrefersReducedMotion } from '@/features/landing-v3/hooks/usePrefersReducedMotion'
import { getLandingFinalCtaTrust } from '@/features/landing-v2/conversion/landingPricingAdapter'
import { useConversionReveal } from '@/features/landing-v2/conversion/useConversionReveal'
import styles from './LandingV2FinalCta.module.css'

export function LandingV2FinalCta() {
  const reduced = usePrefersReducedMotion()
  const { ref: blockRef, revealed: blockRevealed } = useConversionReveal<HTMLDivElement>(!!reduced)
  const trust = getLandingFinalCtaTrust()

  return (
    <section
      className={styles.section}
      data-testid="lv2-final-cta"
      data-landing-final-cta=""
      aria-labelledby="lv2-final-cta-title"
    >
      <div
        ref={blockRef}
        className={`${styles.inner} ${blockRevealed ? styles.revealed : ''}`}
      >
        <p className={styles.eyebrow}>GOTOWY NA KOLEJNY SEZON?</p>
        <h2 id="lv2-final-cta-title" className={styles.headline}>
          <span className={styles.line}>Twój następny sezon</span>
          <span className={styles.line}>może być prostszy.</span>
        </h2>
        <p className={styles.support}>
          Zbierz najważniejsze informacje o swoich zleceniach w jednym miejscu i prowadź sezon z
          większym spokojem.
        </p>
        <div className={styles.actions}>
          <LandingButton to="/register" variant="primary">
            Załóż konto
          </LandingButton>
          <a className={styles.secondary} href="#cennik">
            Zobacz cennik
          </a>
        </div>
        <ul className={styles.trust}>
          {trust.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
