import { useEffect, useRef, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  MapPin,
  UserRound,
} from 'lucide-react'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import {
  LV2_SEASON_IMPORT_ASSIGNMENT,
  LV2_SEASON_IMPORT_ATTACHMENT,
  LV2_SEASON_IMPORT_COPY,
  LV2_SEASON_IMPORT_ROWS,
  LV2_SEASON_IMPORT_SHEET,
  LV2_SEASON_IMPORT_STEPS,
} from '@/features/landing-v2/mobile-story/seasonImportClaims'
import { SeasonImportPdfBadge } from '@/features/landing-v2/mobile-story/SeasonImportPdfBadge'
import { MOBILE_TRACK_IMPORT_COVER_HOLD_SVH } from '@/features/landing-v2/mobile-story/founderStoryProgress'
import styles from './LandingV2SeasonImportStory.module.css'

const COMPACT_EASE = [0.22, 1, 0.36, 1] as const

/** Features / History proven IO band — reveal in lower reading zone. */
const INTRO_VIEWPORT = { once: true as const, amount: 0.2, margin: '0px 0px -18% 0px' }
const CARD_VIEWPORT = { once: true as const, amount: 0.05, margin: '0px 0px -22% 0px' }

const GRID_FIELDS = LV2_SEASON_IMPORT_ASSIGNMENT.fields.slice(0, 4)
const DETAIL_FIELDS = LV2_SEASON_IMPORT_ASSIGNMENT.fields.slice(4)

function ClientMark() {
  return <UserRound className={styles.mark} aria-hidden strokeWidth={1.4} />
}

/**
 * Compact / reduced-motion Season Import — natural document flow content.
 * Compact (non-PRM) ends in a cover-hold runway so Founder can rise over a
 * stationary final Import frame (desktop cover-hold physics, compact geometry).
 * Desktop sticky Import lives in LandingV2MobileStory (StudioImportReveal).
 */
export function LandingV2SeasonImportStory() {
  const reduced = useReducedMotion()
  const isCompact = useLandingCompactViewport()
  const flow = Boolean(reduced) || isCompact
  const motionOff = Boolean(reduced)
  const coverHold = isCompact && !motionOff
  const stickyRef = useRef<HTMLDivElement>(null)

  /* Bottom-align sticky: scroll through tall Import, then pin the final frame. */
  useEffect(() => {
    if (!coverHold) return
    const el = stickyRef.current
    if (!el) return

    const syncTop = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight
      const top = Math.min(0, vh - el.offsetHeight)
      el.style.top = `${top}px`
    }

    syncTop()
    const ro = new ResizeObserver(syncTop)
    ro.observe(el)
    window.addEventListener('resize', syncTop)
    window.visualViewport?.addEventListener('resize', syncTop)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncTop)
      window.visualViewport?.removeEventListener('resize', syncTop)
    }
  }, [coverHold])

  if (!flow) {
    return (
      <section
        className={styles.absorbed}
        data-testid="lv2-season-import-story"
        data-season-import-theater="absorbed"
        aria-hidden="true"
      />
    )
  }

  const body = (
    <div className={styles.inner}>
      <div className={styles.intro} data-studio-import-intro="">
        <motion.div
          className={styles.iconWrap}
          data-studio-import-icon=""
          initial={motionOff ? false : { opacity: 0, y: 10 }}
          whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
          viewport={INTRO_VIEWPORT}
          transition={{ duration: 0.75, ease: COMPACT_EASE }}
          aria-hidden
        >
          <FileSpreadsheet className={styles.icon} strokeWidth={1.5} />
        </motion.div>

        <motion.p
          className={styles.eyebrow}
          data-studio-import-eyebrow=""
          initial={motionOff ? false : { opacity: 0, y: 8 }}
          whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
          viewport={INTRO_VIEWPORT}
          transition={{ duration: 0.75, ease: COMPACT_EASE, delay: 0.04 }}
        >
          {LV2_SEASON_IMPORT_COPY.eyebrow}
        </motion.p>

        <motion.h2
          id="lv2-studio-import-heading"
          className={styles.headline}
          data-studio-import-headline=""
          initial={motionOff ? false : { opacity: 0, y: 14 }}
          whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
          viewport={INTRO_VIEWPORT}
          transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.08 }}
        >
          <span className={styles.line}>{LV2_SEASON_IMPORT_COPY.headlineLine1}</span>
          <span className={styles.line}>{LV2_SEASON_IMPORT_COPY.headlineLine2}</span>
        </motion.h2>

        <motion.p
          className={styles.support}
          data-studio-import-support=""
          initial={motionOff ? false : { opacity: 0, y: 10 }}
          whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
          viewport={INTRO_VIEWPORT}
          transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.12 }}
        >
          {LV2_SEASON_IMPORT_COPY.support}
        </motion.p>

        <motion.ol
          className={styles.process}
          data-studio-import-process=""
          aria-label="Kroki importu"
          initial={motionOff ? false : { opacity: 0, y: 8 }}
          whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
          viewport={INTRO_VIEWPORT}
          transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.16 }}
        >
          {LV2_SEASON_IMPORT_STEPS.map((step, i) => (
            <li key={step}>
              <span className={styles.stepIndex}>{i + 1}</span>
              <span className={styles.stepLabel}>{step}</span>
            </li>
          ))}
        </motion.ol>
      </div>

      <div className={styles.panels} data-studio-import-panels="">
        <motion.article
          className={styles.sheet}
          data-import-panel="sheet"
          data-studio-import-sheet=""
          initial={motionOff ? false : { opacity: 0, y: 22, scale: 0.995 }}
          whileInView={motionOff ? undefined : { opacity: 1, y: 0, scale: 1 }}
          viewport={CARD_VIEWPORT}
          transition={{ duration: 0.82, ease: COMPACT_EASE }}
        >
          <header className={styles.sheetHead}>
            <div className={styles.sheetIdentity}>
              <span className={styles.sheetGlyph} aria-hidden>
                <FileSpreadsheet strokeWidth={1.5} />
              </span>
              <div>
                <p className={styles.surfaceEyebrow}>{LV2_SEASON_IMPORT_SHEET.label}</p>
                <p className={styles.sheetTitle}>{LV2_SEASON_IMPORT_SHEET.filename}</p>
              </div>
            </div>
            <p className={styles.sheetStatus}>{LV2_SEASON_IMPORT_SHEET.status}</p>
          </header>

          <ul className={styles.rows} aria-label="Podgląd arkusza">
            {LV2_SEASON_IMPORT_ROWS.map((row) => (
              <li key={row.id} data-selected={row.selected ? 'true' : 'false'}>
                <strong className={styles.coupleCell}>
                  <ClientMark />
                  {row.couple}
                </strong>
                <span className={styles.rowMeta}>
                  {row.date} · {row.packageName} · {row.value}
                </span>
              </li>
            ))}
          </ul>

          <div className={styles.attachment} data-studio-import-pdf="">
            <p className={styles.attachmentLabel}>Powiązany dokument</p>
            <div className={styles.attachmentBody}>
              <SeasonImportPdfBadge />
              <div className={styles.attachmentMeta}>
                <strong>{LV2_SEASON_IMPORT_ATTACHMENT.filename}</strong>
                <span>{LV2_SEASON_IMPORT_ATTACHMENT.note}</span>
              </div>
            </div>
          </div>
        </motion.article>

        <motion.article
          className={styles.assignment}
          data-import-panel="result"
          data-studio-import-result=""
          initial={motionOff ? false : { opacity: 0, y: 22, scale: 0.995 }}
          whileInView={motionOff ? undefined : { opacity: 1, y: 0, scale: 1 }}
          viewport={CARD_VIEWPORT}
          transition={{ duration: 0.82, ease: COMPACT_EASE }}
        >
          <header className={styles.assignHead}>
            <p className={styles.surfaceEyebrow}>{LV2_SEASON_IMPORT_ASSIGNMENT.eyebrow}</p>
            <p className={styles.assignTitle}>{LV2_SEASON_IMPORT_ASSIGNMENT.couple}</p>
          </header>

          <div className={styles.fieldsBlock} data-studio-import-fields="">
            <dl className={styles.meta}>
              {GRID_FIELDS.map((field) => (
                <div key={field.label} className={styles.metaChip}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>

            <ul className={styles.details}>
              {DETAIL_FIELDS.map((field) => (
                <li key={field.label}>
                  <span className={styles.detailIcon} aria-hidden>
                    {field.label === 'Lokalizacja' ? (
                      <MapPin strokeWidth={1.5} />
                    ) : (
                      <FileText strokeWidth={1.5} />
                    )}
                  </span>
                  <div>
                    <span className={styles.detailLabel}>{field.label}</span>
                    <strong className={styles.detailValue}>{field.value}</strong>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.readyBlock} data-studio-import-ready="">
            <p className={styles.readyStatus} data-status="ready">
              <CheckCircle2 className={styles.readyIcon} aria-hidden strokeWidth={1.6} />
              {LV2_SEASON_IMPORT_ASSIGNMENT.status}
            </p>
            <button type="button" className={styles.cta} tabIndex={-1}>
              {LV2_SEASON_IMPORT_ASSIGNMENT.cta}
            </button>
          </div>
        </motion.article>
      </div>
    </div>
  )

  if (!coverHold) {
    return (
      <section
        className={styles.flow}
        data-testid="lv2-season-import-story"
        data-season-import-theater="document-flow"
        data-season-import-flow="document"
        data-season-import-compact="true"
        data-season-import-cover="none"
        aria-labelledby="lv2-studio-import-heading"
      >
        {body}
      </section>
    )
  }

  return (
    <section
      className={styles.coverTrack}
      data-testid="lv2-season-import-story"
      data-season-import-theater="document-flow"
      data-season-import-flow="document"
      data-season-import-compact="true"
      data-season-import-cover="hold"
      data-season-import-cover-hold-svh={MOBILE_TRACK_IMPORT_COVER_HOLD_SVH}
      style={
        {
          '--import-cover-hold-svh': MOBILE_TRACK_IMPORT_COVER_HOLD_SVH,
        } as CSSProperties
      }
      aria-labelledby="lv2-studio-import-heading"
    >
      <div
        ref={stickyRef}
        className={styles.coverSticky}
        data-season-import-cover-sticky=""
      >
        <div className={styles.flowSurface}>{body}</div>
      </div>
      {/* Sibling runway — Founder margin-top: -100svh overlaps this while sticky pins. */}
      <div
        className={styles.holdRunway}
        data-season-import-cover-runway=""
        aria-hidden="true"
      />
    </section>
  )
}
