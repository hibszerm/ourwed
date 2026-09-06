import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  LV2_SEASON_IMPORT_ASSIGNMENT,
  LV2_SEASON_IMPORT_ATTACHMENT,
  LV2_SEASON_IMPORT_COPY,
  LV2_SEASON_IMPORT_ROWS,
  LV2_SEASON_IMPORT_SHEET,
  LV2_SEASON_IMPORT_STEPS,
} from '@/features/landing-v2/mobile-story/seasonImportClaims'
import styles from './LandingV2SeasonImportStory.module.css'

const COMPACT_EASE = [0.22, 1, 0.36, 1] as const
const INTRO_VIEWPORT = { once: true as const, amount: 0.35, margin: '0px 0px -12% 0px' }

/**
 * Compact / reduced-motion Season Import — natural document flow.
 * Desktop sticky Import lives in LandingV2MobileStory (StudioImportReveal).
 */
export function LandingV2SeasonImportStory() {
  const reduced = useReducedMotion()
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)')
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const simple = Boolean(reduced) || compact
  const motionOff = Boolean(reduced)

  if (!simple) {
    return (
      <section
        className={styles.absorbed}
        data-testid="lv2-season-import-story"
        data-season-import-theater="absorbed"
        aria-hidden="true"
      />
    )
  }

  return (
    <section
      className={styles.static}
      data-testid="lv2-season-import-story"
      data-season-import-theater="document-flow"
      data-season-import-flow="document"
      aria-labelledby="lv2-studio-import-heading"
    >
      <motion.div
        className={styles.staticInner}
        initial={motionOff ? false : { opacity: 0, y: 16 }}
        whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
        viewport={INTRO_VIEWPORT}
        transition={{ duration: 0.8, ease: COMPACT_EASE }}
      >
        <p className={styles.eyebrow}>{LV2_SEASON_IMPORT_COPY.eyebrow}</p>
        <h2 id="lv2-studio-import-heading" className={styles.headline}>
          <span className={styles.line}>{LV2_SEASON_IMPORT_COPY.headlineLine1}</span>
          <span className={styles.line}>{LV2_SEASON_IMPORT_COPY.headlineLine2}</span>
        </h2>
        <p className={styles.support}>{LV2_SEASON_IMPORT_COPY.support}</p>

        <ol className={styles.process} aria-label="Kroki importu">
          {LV2_SEASON_IMPORT_STEPS.map((step, i) => (
            <li key={step}>
              <span className={styles.stepIndex}>{i + 1}</span>
              <span>{step}</span>
              {i < LV2_SEASON_IMPORT_STEPS.length - 1 ? (
                <span className={styles.stepArrow} aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>

        <div className={styles.panels}>
          <article className={styles.sheet}>
            <p className={styles.surfaceEyebrow}>{LV2_SEASON_IMPORT_SHEET.label}</p>
            <h3>{LV2_SEASON_IMPORT_SHEET.filename}</h3>
            <p className={styles.sheetStatus}>{LV2_SEASON_IMPORT_SHEET.status}</p>
            <ul className={styles.rows}>
              {LV2_SEASON_IMPORT_ROWS.map((row) => (
                <li key={row.id} data-selected={row.selected ? 'true' : 'false'}>
                  <strong>{row.couple}</strong>
                  <span>
                    {row.date} · {row.packageName} · {row.value}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.pdf}>
              {LV2_SEASON_IMPORT_ATTACHMENT.mark} · {LV2_SEASON_IMPORT_ATTACHMENT.filename}
            </p>
          </article>

          <article className={styles.assignment}>
            <p className={styles.surfaceEyebrow}>{LV2_SEASON_IMPORT_ASSIGNMENT.eyebrow}</p>
            <h3>{LV2_SEASON_IMPORT_ASSIGNMENT.couple}</h3>
            <dl>
              {LV2_SEASON_IMPORT_ASSIGNMENT.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.ready}>{LV2_SEASON_IMPORT_ASSIGNMENT.status}</p>
          </article>
        </div>
      </motion.div>
    </section>
  )
}
