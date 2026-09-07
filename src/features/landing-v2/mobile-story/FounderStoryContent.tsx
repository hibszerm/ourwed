import { motion, useReducedMotion } from 'framer-motion'
import portraitUrl from '@/features/landing-v2/media/marcin-hibszer-portrait.jpg'
import {
  LV2_FOUNDER_CLOSING,
  LV2_FOUNDER_IDENTITY,
  LV2_FOUNDER_OPENING,
  LV2_FOUNDER_ORIGIN,
} from '@/features/landing-v2/mobile-story/founderStoryClaims'
import styles from './FounderStoryReveal.module.css'

const COMPACT_EASE = [0.22, 1, 0.36, 1] as const

/** Features / History proven IO band — reveal in lower reading zone. */
const INTRO_VIEWPORT = { once: true as const, amount: 0.2, margin: '0px 0px -18% 0px' }
const CHAPTER_VIEWPORT = { once: true as const, amount: 0.15, margin: '0px 0px -22% 0px' }
const PORTRAIT_VIEWPORT = { once: true as const, amount: 0.12, margin: '0px 0px -25% 0px' }

type Props = {
  headingId: string
  /** Compact mobile stacks fragments on two lines. */
  compactFragments?: boolean
  /** Compact cover-flow: soft local intro/chapter reveals. */
  localReveal?: boolean
}

/**
 * Founder editorial body — single desktop owner renders this once.
 * Compact uses a deliberate single-column editorial rhythm (not desktop squeezed).
 */
export function FounderStoryContent({
  headingId,
  compactFragments = false,
  localReveal = false,
}: Props) {
  const reduced = useReducedMotion()
  const reveal = localReveal && !reduced
  const compact = compactFragments

  return (
    <div
      className={styles.canvas}
      data-founder-compact-editorial={compact ? 'true' : 'false'}
    >
      <header className={styles.section1} data-founder-zone="1" data-founder-act="1">
        <motion.p
          className={styles.eyebrow}
          data-founder-opening-eyebrow=""
          initial={reveal ? { opacity: 0, y: 8 } : false}
          whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
          viewport={INTRO_VIEWPORT}
          transition={{ duration: 0.75, ease: COMPACT_EASE }}
        >
          {LV2_FOUNDER_OPENING.eyebrow}
        </motion.p>
        <motion.h2
          id={headingId}
          className={styles.openingHeadline}
          data-founder-opening-heading=""
          initial={reveal ? { opacity: 0, y: 14 } : false}
          whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
          viewport={INTRO_VIEWPORT}
          transition={{ duration: 0.85, ease: COMPACT_EASE, delay: 0.06 }}
        >
          <span className={styles.line}>{LV2_FOUNDER_OPENING.headlineLine1}</span>
          <span className={styles.line}>{LV2_FOUNDER_OPENING.headlineLine2}</span>
          <span className={styles.line}>{LV2_FOUNDER_OPENING.headlineLine3}</span>
        </motion.h2>
        <motion.p
          className={styles.bridge}
          data-founder-opening-bridge=""
          initial={reveal ? { opacity: 0, y: 10 } : false}
          whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
          viewport={INTRO_VIEWPORT}
          transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.12 }}
        >
          {LV2_FOUNDER_OPENING.bridge}
        </motion.p>
        <motion.div
          className={styles.fragments}
          aria-label={LV2_FOUNDER_OPENING.fragmentsLabel}
          data-founder-opening-fragments=""
          initial={reveal ? { opacity: 0, y: 10 } : false}
          whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
          viewport={INTRO_VIEWPORT}
          transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.2 }}
        >
          <p className={styles.fragmentsLabel}>{LV2_FOUNDER_OPENING.fragmentsLabel}</p>
          <p className={styles.fragmentsLine}>
            {compactFragments ? (
              <span
                className={`${styles.fragmentsWrap} ${styles.fragmentsWrapAlways}`}
                data-founder-fragments-compact=""
              >
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
        </motion.div>
      </header>

      <section className={styles.section2} data-founder-zone="2" data-founder-act="2" aria-label="Założyciel">
        <div className={styles.section2Inner}>
          <div
            className={styles.portraitCol}
            data-founder-profile={compact ? 'horizontal' : 'stacked'}
          >
            <motion.figure
              className={styles.portraitBlock}
              data-founder-portrait-block=""
              initial={reveal ? { opacity: 0, y: 16, scale: 0.99 } : false}
              whileInView={reveal ? { opacity: 1, y: 0, scale: 1 } : undefined}
              viewport={PORTRAIT_VIEWPORT}
              transition={{ duration: 0.8, ease: COMPACT_EASE }}
            >
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
            </motion.figure>
            <motion.div
              className={styles.identity}
              data-founder-identity=""
              initial={reveal ? { opacity: 0, x: 10 } : false}
              whileInView={reveal ? { opacity: 1, x: 0 } : undefined}
              viewport={PORTRAIT_VIEWPORT}
              transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.1 }}
            >
              <p className={styles.name}>{LV2_FOUNDER_IDENTITY.name}</p>
              {compact ? (
                <>
                  <p className={styles.role}>
                    {LV2_FOUNDER_IDENTITY.role.split(' · ').map((line) => (
                      <span key={line} className={styles.line}>
                        {line}
                      </span>
                    ))}
                  </p>
                  <p className={styles.meta}>
                    {LV2_FOUNDER_IDENTITY.meta.split(' · ').map((line) => (
                      <span key={line} className={styles.line}>
                        {line}
                      </span>
                    ))}
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.role}>{LV2_FOUNDER_IDENTITY.role}</p>
                  <p className={styles.meta}>{LV2_FOUNDER_IDENTITY.meta}</p>
                </>
              )}
            </motion.div>
          </div>

          <div className={styles.storyCol}>
            <motion.div
              className={styles.storyChapter}
              data-founder-story-chapter="1"
              initial={reveal ? { opacity: 0, y: 14 } : false}
              whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
              viewport={CHAPTER_VIEWPORT}
              transition={{ duration: 0.8, ease: COMPACT_EASE }}
            >
              <h3 className={styles.originHeading} data-founder-story-heading="">
                {compact ? (
                  <>
                    <span className={styles.line}>Jeden ślub.</span>
                    <span className={styles.line}>Informacje były wszędzie.</span>
                  </>
                ) : (
                  LV2_FOUNDER_ORIGIN.heading
                )}
              </h3>
              <motion.div
                initial={reveal ? { opacity: 0, y: 10 } : false}
                whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
                viewport={CHAPTER_VIEWPORT}
                transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.08 }}
              >
                <p className={styles.body}>{LV2_FOUNDER_ORIGIN.body1}</p>
                <p className={`${styles.body} ${styles.bodyLast}`}>{LV2_FOUNDER_ORIGIN.body2}</p>
              </motion.div>
            </motion.div>

            <motion.div
              className={styles.storyChapter}
              data-founder-story-chapter="2"
              initial={reveal ? { opacity: 0, y: 14 } : false}
              whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
              viewport={CHAPTER_VIEWPORT}
              transition={{ duration: 0.8, ease: COMPACT_EASE }}
            >
              <h4 className={styles.currentUseHeading} data-founder-current-use="">
                {compact ? (
                  <>
                    <span className={styles.line}>Od tego sezonu prowadzę swoje zlecenia</span>
                    <span className={styles.line}>w OurWed.</span>
                  </>
                ) : (
                  LV2_FOUNDER_ORIGIN.currentUseHeading
                )}
              </h4>
              <motion.div
                initial={reveal ? { opacity: 0, y: 10 } : false}
                whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
                viewport={CHAPTER_VIEWPORT}
                transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.08 }}
              >
                <p className={styles.currentDiff}>{LV2_FOUNDER_ORIGIN.currentDiff}</p>
                <p className={styles.support}>{LV2_FOUNDER_ORIGIN.body3}</p>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className={styles.section3} data-founder-zone="3" data-founder-act="3" aria-label="OurWed dziś">
        <motion.footer
          className={styles.closing}
          data-founder-act="final"
          data-founder-manifesto=""
          initial={reveal ? { opacity: 0, y: 14 } : false}
          whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
          viewport={CHAPTER_VIEWPORT}
          transition={{ duration: 0.85, ease: COMPACT_EASE }}
        >
          <p className={styles.eyebrow}>{LV2_FOUNDER_CLOSING.eyebrow}</p>
          <h3 className={styles.closingHeadline} data-founder-closing-headline="">
            <span className={styles.line}>{LV2_FOUNDER_CLOSING.headlineLine1}</span>
            <span className={styles.line}>{LV2_FOUNDER_CLOSING.headlineLine2}</span>
          </h3>
          <p className={styles.closingSupport} data-founder-closing-support="">
            {LV2_FOUNDER_CLOSING.support}
          </p>
        </motion.footer>
      </section>
    </div>
  )
}
