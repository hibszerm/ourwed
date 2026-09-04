import {
  LV2_QUALIFICATION_AUDIENCE,
  LV2_QUALIFICATION_OPENING,
  LV2_QUALIFICATION_SIGNALS,
} from '@/features/landing-v2/conversion/qualificationClaims'
import founderStyles from '@/features/landing-v2/mobile-story/FounderStoryReveal.module.css'
import styles from './FounderQualification.module.css'

/**
 * Continues the Founder black document — same surface, no new black chapter seam.
 * Mounted inside LandingV2FounderStory `.story`.
 *
 * Static document flow only — no IntersectionObserver / opacity / translate reveals.
 * Black paint lives on non-animated structural ancestors (.story + .root).
 */
export function FounderQualification() {
  return (
    <section
      className={styles.root}
      data-founder-qualification=""
      data-testid="lv2-founder-qualification"
      data-qualification-paint="structural"
      data-qualification-motion="none"
      aria-labelledby="lv2-qualification-heading"
    >
      <header
        id="dla-kogo"
        className={styles.opening}
        data-qualification-opening=""
        data-landing-hash-anchor="dla-kogo"
      >
        <div className={styles.chapterMarker} data-qualification-chapter-marker="">
          <span className={styles.chapterRule} aria-hidden />
          <p className={styles.chapterEyebrow}>{LV2_QUALIFICATION_OPENING.eyebrow}</p>
          <span className={styles.chapterRule} aria-hidden />
        </div>
        <h2
          id="lv2-qualification-heading"
          className={`${styles.headline} ${founderStyles.openingHeadline}`}
          data-type-tier="founder-opening"
        >
          <span className={styles.line}>{LV2_QUALIFICATION_OPENING.headlineLine1}</span>
          <span className={styles.line}>{LV2_QUALIFICATION_OPENING.headlineLine2}</span>
          <span className={styles.line}>{LV2_QUALIFICATION_OPENING.headlineLine3}</span>
        </h2>
        <p className={styles.support}>{LV2_QUALIFICATION_OPENING.support}</p>
      </header>

      <div className={styles.signalGrid} data-qualification-signals="">
        {LV2_QUALIFICATION_SIGNALS.map((item) => (
          <article
            key={item.id}
            className={styles.signal}
            data-qualification-signal={item.id}
          >
            <p className={styles.signalIndex}>{item.id}</p>
            <div className={styles.signalRule} aria-hidden />
            <h3 className={styles.signalHeadline}>{item.headline}</h3>
            <p className={styles.signalSupport}>{item.support}</p>
          </article>
        ))}
      </div>

      <footer className={styles.audience} data-founder-audience="">
        <p className={styles.audienceEyebrow}>{LV2_QUALIFICATION_AUDIENCE.eyebrow}</p>
        <ul className={styles.audienceRow}>
          {LV2_QUALIFICATION_AUDIENCE.labels.map((label) => (
            <li key={label} className={styles.audienceLabel}>
              {label}
            </li>
          ))}
        </ul>
        <p className={styles.audienceSupport}>{LV2_QUALIFICATION_AUDIENCE.support}</p>
      </footer>
    </section>
  )
}
