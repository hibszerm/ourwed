import { LandingButton } from '@/features/landing-v3/components/LandingButton'
import { usePrefersReducedMotion } from '@/features/landing-v3/hooks/usePrefersReducedMotion'
import {
  getLandingPricingCopy,
  getLandingProProduct,
} from '@/features/landing-v2/conversion/landingPricingAdapter'
import { useConversionReveal } from '@/features/landing-v2/conversion/useConversionReveal'
import founderStyles from '@/features/landing-v2/mobile-story/FounderStoryReveal.module.css'
import styles from './LandingV2Pricing.module.css'

/**
 * Warm conversion pricing — two billing cards for one OurWed Pro product.
 * Trial mini-box is entry reassurance (not a third tier). Shared capabilities.
 */
export function LandingV2Pricing() {
  const reduced = usePrefersReducedMotion()
  const { ref: headRef, revealed: headRevealed } = useConversionReveal<HTMLDivElement>(!!reduced)
  const { ref: cardsRef, revealed: cardsRevealed } = useConversionReveal<HTMLDivElement>(!!reduced)
  const copy = getLandingPricingCopy()
  const product = getLandingProProduct()
  const trial = copy.trialBox

  return (
    <section
      className={styles.section}
      data-testid="lv2-pricing"
      data-landing-pricing=""
      data-pricing-model="single-pro"
      data-pricing-composition="two-card"
      data-product-tiers="1"
      data-pricing-cards={product.billing.length}
      aria-labelledby="lv2-pricing-title"
    >
      <header
        id="cennik"
        className={styles.intro}
        data-landing-hash-anchor="cennik"
      >
        <div
          ref={headRef}
          className={`${styles.revealInner} ${headRevealed ? styles.revealed : ''}`}
        >
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h2
            id="lv2-pricing-title"
            className={`${styles.headline} ${founderStyles.openingHeadline}`}
            data-type-tier="founder-opening"
          >
            <span className={styles.line}>{copy.headlineLine1}</span>
            <span className={styles.line}>{copy.headlineLine2}</span>
          </h2>
          <p className={styles.support}>{copy.support}</p>
        </div>
      </header>

      <div
        className={styles.pricingComposition}
        data-pricing-composition-width=""
      >
        <aside
          className={styles.trialBox}
          data-pricing-trial=""
          data-pricing-trial-box=""
          aria-label="Okres próbny"
        >
          <div className={styles.trialCopy}>
            <p className={styles.trialEyebrow}>{trial.eyebrow}</p>
            <p className={styles.trialHeadline}>{trial.headline}</p>
            <p className={styles.trialSupport}>{trial.support}</p>
          </div>
          <div className={styles.trialCta}>
            <LandingButton to={trial.ctaTo} variant="secondary">
              {trial.ctaLabel}
            </LandingButton>
          </div>
        </aside>

        <div
          ref={cardsRef}
          className={`${styles.cardGrid} ${styles.revealInner} ${cardsRevealed ? styles.revealed : ''}`}
          data-pricing-billing=""
        >
          {product.billing.map((option, index) => (
            <article
              key={option.id}
              className={`${styles.card} ${option.recommended ? styles.cardRecommended : ''}`}
              data-billing={option.id}
              data-billing-recommended={option.recommended ? 'true' : 'false'}
              data-pricing-card=""
              style={{ '--reveal-i': index } as React.CSSProperties}
            >
              {option.badge ? <p className={styles.badge}>{option.badge}</p> : null}

              <header className={styles.cardHead}>
                <p className={styles.productEyebrow}>{product.name}</p>
                <h3 className={styles.cardTitle}>{option.title}</h3>
                <p className={styles.cardSupport}>
                  <span className={styles.line}>{option.supportLine1}</span>
                  <span className={styles.line}>{option.supportLine2}</span>
                </p>
              </header>

              <div className={styles.priceBlock}>
                <p className={styles.priceRow}>
                  <span className={styles.price}>{option.priceLabel}</span>
                  <span className={styles.period}>{option.periodLabel}</span>
                </p>
                {option.secondaryPriceHint ? (
                  <p className={styles.hint}>{option.secondaryPriceHint}</p>
                ) : null}
                {option.savingLabel ? <p className={styles.saving}>{option.savingLabel}</p> : null}
              </div>

              <div className={styles.rule} aria-hidden />

              <div className={styles.features} data-pricing-capabilities="">
                <p className={styles.featuresLabel}>{product.capabilitiesLabel}</p>
                <ul>
                  {product.capabilities.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </div>

              <div className={styles.ctaRegion} data-pricing-cta="">
                <LandingButton
                  to={product.ctaTo}
                  variant={option.recommended ? 'primary' : 'secondary'}
                >
                  {product.ctaLabel}
                </LandingButton>
                <p className={styles.ctaTrust}>{copy.ctaTrust}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
