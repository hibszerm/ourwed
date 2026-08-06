import { LandingButton } from '@/features/landing-v3/components/LandingButton'
import {
  LANDING_PRICING,
} from '@/features/landing-v3/data/pricingData'
import styles from './mobileArtboard.module.css'

const TRIAL = [
  'Pełny dostęp Pro przez 30 dni',
  'Bez karty płatniczej',
  'Rezygnacja w dowolnym momencie',
] as const

const ANNUAL = [
  'Wszystkie funkcje Pro',
  '2 miesiące gratis',
  'Najniższa cena miesięczna',
  'Nielimitowane zlecenia',
] as const

const MONTHLY = [
  'Wszystkie funkcje Pro',
  'Bez zobowiązania rocznego',
  'Anuluj w dowolnym momencie',
] as const

/** Pattern B — compact pricing cards (no desktop min-heights). */
export function MobilePricingArtboard() {
  const p = LANDING_PRICING

  return (
    <div
      className={styles.pricingMobile}
      data-mobile-artboard="pricing"
      data-artboard-pattern="B"
      data-pricing-mobile="true"
    >
      <article className={styles.priceMobileCard} data-plan="trial">
        <p className={styles.eyebrow}>Okres próbny</p>
        <h3>30 dni pełnego dostępu</h3>
        <strong>0 zł</strong>
        <p className={styles.meta}>Wszystkie funkcje Pro. Bez karty.</p>
        <ul>
          {TRIAL.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className={styles.priceCtaWrap}>
          <LandingButton to="/register" variant="primary">
            Rozpocznij bezpłatnie
          </LandingButton>
        </div>
      </article>

      <article className={styles.priceMobileCard} data-plan="annual">
        <p className={styles.eyebrow}>Najkorzystniejszy</p>
        <h3>Pro rocznie</h3>
        <strong>
          {p.annualPriceLabel}
          <span className={styles.meta}> / rok</span>
        </strong>
        <p className={styles.meta}>
          {p.monthlyEquivalentLabel} · {p.annualSavingLabel}
        </p>
        <ul>
          {ANNUAL.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className={styles.priceCtaWrap}>
          <LandingButton to="/register" variant="primary">
            Wybierz rocznie
          </LandingButton>
        </div>
      </article>

      <article className={styles.priceMobileCard} data-plan="monthly">
        <p className={styles.eyebrow}>Pro miesięcznie</p>
        <h3>Elastycznie</h3>
        <strong>
          {p.monthlyPriceLabel}
          <span className={styles.meta}> / miesiąc</span>
        </strong>
        <p className={styles.meta}>Bez zobowiązania rocznego.</p>
        <ul>
          {MONTHLY.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className={styles.priceCtaWrap}>
          <LandingButton to="/register" variant="secondary">
            Wybierz miesięcznie
          </LandingButton>
        </div>
      </article>
    </div>
  )
}
