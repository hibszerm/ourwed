import { LandingButton } from '@/features/landing-v3/components/LandingButton'
import {
  LANDING_PRICING,
  LANDING_PRO_FEATURES,
} from '@/features/landing-v3/data/pricingData'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const TRIAL_FEATURES = [
  'Wszystkie funkcje Pro',
  'Bez karty płatniczej',
  'Rezygnacja w dowolnym momencie',
] as const

/** Experimental pricing — demo values only, not wired to payment flows. */
export function PricingSection() {
  const p = LANDING_PRICING

  return (
    <section
      id="cennik"
      className={styles.editorialSection}
      data-testid="lv3-pricing"
      aria-labelledby="pricing-title"
    >
      <div className={styles.sectionIntro}>
        <h2 id="pricing-title" className={styles.titleC}>
          Wypróbuj wszystkie funkcje.
          <br />
          Wybierz plan później.
        </h2>
        <p className={styles.editorialLead}>
          Przez pierwsze {p.trialDays} dni korzystasz z pełnej wersji OurWed bez
          karty płatniczej.
        </p>
      </div>

      <div className={styles.pricingGrid} data-pricing-cards="3">
        <article className={styles.priceCard} data-plan="trial">
          <p className={styles.priceEyebrow}>Okres próbny</p>
          <h3 className={styles.priceHeadline}>30 dni pełnego dostępu</h3>
          <p className={styles.priceAmount}>0 zł</p>
          <p className={styles.priceSupport}>
            Wszystkie funkcje Pro. Bez karty płatniczej.
          </p>
          <ul className={styles.priceFeatures}>
            {TRIAL_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className={styles.priceCta}>
            <LandingButton to="/register" variant="primary">
              Rozpocznij bezpłatnie
            </LandingButton>
          </div>
        </article>

        <article className={styles.priceCard} data-plan="monthly">
          <p className={styles.priceName}>Pro miesięcznie</p>
          <p className={styles.priceAmount}>
            {p.monthlyPriceLabel}
            <span className={styles.priceUnit}> / miesiąc</span>
          </p>
          <p className={styles.priceSupport}>
            Pełna elastyczność bez zobowiązania rocznego.
          </p>
          <ul className={styles.priceFeatures}>
            {LANDING_PRO_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className={styles.priceCta}>
            <LandingButton to="/register" variant="secondary">
              Wybierz miesięcznie
            </LandingButton>
          </div>
        </article>

        <article
          className={`${styles.priceCard} ${styles.priceCardRecommended}`}
          data-plan="annual"
          data-recommended="true"
        >
          <p className={styles.priceBadge}>Najkorzystniejszy</p>
          <p className={styles.priceName}>Pro rocznie</p>
          <p className={styles.priceAmount}>
            {p.annualPriceLabel}
            <span className={styles.priceUnit}> / rok</span>
          </p>
          <p className={styles.priceEquivalent}>{p.monthlyEquivalentLabel}</p>
          <p className={styles.priceSaving}>
            {p.annualSavingLabel} · {p.annualDiscountLabel}
          </p>
          <p className={styles.priceBonus}>{p.annualBonusLabel}</p>
          <ul className={styles.priceFeatures}>
            {LANDING_PRO_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className={styles.priceCta}>
            <LandingButton to="/register" variant="primary">
              Wybierz plan roczny
            </LandingButton>
          </div>
        </article>
      </div>
    </section>
  )
}
