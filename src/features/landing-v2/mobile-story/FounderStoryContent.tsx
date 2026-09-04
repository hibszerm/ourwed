import portraitUrl from '@/features/landing-v2/media/marcin-hibszer-portrait.jpg'
import {
  LV2_FOUNDER_CLOSING,
  LV2_FOUNDER_IDENTITY,
  LV2_FOUNDER_OPENING,
  LV2_FOUNDER_ORIGIN,
} from '@/features/landing-v2/mobile-story/founderStoryClaims'
import styles from './FounderStoryReveal.module.css'

type Props = {
  headingId: string
  /** Compact mobile stacks fragments on two lines. */
  compactFragments?: boolean
}

/**
 * Founder editorial body — single desktop owner renders this once.
 */
export function FounderStoryContent({ headingId, compactFragments = false }: Props) {
  return (
    <div className={styles.canvas}>
      <header className={styles.section1} data-founder-zone="1" data-founder-act="1">
        <p className={styles.eyebrow}>{LV2_FOUNDER_OPENING.eyebrow}</p>
        <h2 id={headingId} className={styles.openingHeadline} data-founder-opening-heading="">
          <span className={styles.line}>{LV2_FOUNDER_OPENING.headlineLine1}</span>
          <span className={styles.line}>{LV2_FOUNDER_OPENING.headlineLine2}</span>
          <span className={styles.line}>{LV2_FOUNDER_OPENING.headlineLine3}</span>
        </h2>
        <p className={styles.bridge}>{LV2_FOUNDER_OPENING.bridge}</p>
        <div className={styles.fragments} aria-label={LV2_FOUNDER_OPENING.fragmentsLabel}>
          <p className={styles.fragmentsLabel}>{LV2_FOUNDER_OPENING.fragmentsLabel}</p>
          <p className={styles.fragmentsLine}>
            {compactFragments ? (
              <span className={`${styles.fragmentsWrap} ${styles.fragmentsWrapAlways}`} data-founder-fragments-compact="">
                <span className={styles.line}>{LV2_FOUNDER_OPENING.fragmentsLine1}</span>
                <span className={styles.line}>{LV2_FOUNDER_OPENING.fragmentsLine2}</span>
              </span>
            ) : (
              <>
                <span className={styles.fragmentsFull}>{LV2_FOUNDER_OPENING.fragmentsLine}</span>
                <span className={styles.fragmentsWrap}>
                  <span className={styles.line}>{LV2_FOUNDER_OPENING.fragmentsLine1}</span>
                  <span className={styles.line}>{LV2_FOUNDER_OPENING.fragmentsLine2}</span>
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      <section className={styles.section2} data-founder-zone="2" data-founder-act="2" aria-label="Założyciel">
        <div className={styles.section2Inner}>
          <div className={styles.portraitCol}>
            <figure className={styles.portraitBlock}>
              <div className={styles.portraitFrame} data-founder-portrait-frame="">
                <img
                  className={styles.portrait}
                  src={portraitUrl}
                  alt={LV2_FOUNDER_IDENTITY.portraitAlt}
                  width={768}
                  height={1024}
                  decoding="async"
                  loading="lazy"
                  data-founder-portrait=""
                />
              </div>
            </figure>
            <div className={styles.identity} data-founder-identity="">
              <p className={styles.name}>{LV2_FOUNDER_IDENTITY.name}</p>
              <p className={styles.role}>{LV2_FOUNDER_IDENTITY.role}</p>
              <p className={styles.meta}>{LV2_FOUNDER_IDENTITY.meta}</p>
            </div>
          </div>

          <div className={styles.storyCol}>
            <h3 className={styles.originHeading} data-founder-story-heading="">
              {LV2_FOUNDER_ORIGIN.heading}
            </h3>
            <p className={styles.body}>{LV2_FOUNDER_ORIGIN.body1}</p>
            <p className={`${styles.body} ${styles.bodyLast}`}>{LV2_FOUNDER_ORIGIN.body2}</p>
            <h4 className={styles.currentUseHeading} data-founder-current-use="">
              {LV2_FOUNDER_ORIGIN.currentUseHeading}
            </h4>
            <p className={styles.currentDiff}>{LV2_FOUNDER_ORIGIN.currentDiff}</p>
            <p className={styles.support}>{LV2_FOUNDER_ORIGIN.body3}</p>
          </div>
        </div>
      </section>

      <section className={styles.section3} data-founder-zone="3" data-founder-act="3" aria-label="OurWed dziś">
        <footer className={styles.closing} data-founder-act="final">
          <p className={styles.eyebrow}>{LV2_FOUNDER_CLOSING.eyebrow}</p>
          <h3 className={styles.closingHeadline} data-founder-closing-headline="">
            <span className={styles.line}>{LV2_FOUNDER_CLOSING.headlineLine1}</span>
            <span className={styles.line}>{LV2_FOUNDER_CLOSING.headlineLine2}</span>
          </h3>
          <p className={styles.closingSupport} data-founder-closing-support="">
            {LV2_FOUNDER_CLOSING.support}
          </p>
        </footer>
      </section>
    </div>
  )
}
