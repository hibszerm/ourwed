import { motion, useReducedMotion } from 'framer-motion'
import {
  SECURITY_ANIMATION_DURATION_S,
  SECURITY_RECORD_PACKAGE,
  SECURITY_RECORD_START,
  SECURITY_RECORDS,
  SECURITY_SHACKLE_RATIO,
} from '@/features/landing-v3/data/securityRecords'
import { premiumEase, softEase } from '@/features/landing-v3/motion/variants'
import styles from './ClassicDataLock.module.css'

interface ClassicDataLockProps {
  active: boolean
  className?: string
  /**
   * Desktop keeps the approved long timeline.
   * Mobile uses a shorter overlapping handoff so records and lock are never
   * both near-invisible (no empty beige frame).
   */
  timeline?: 'desktop' | 'mobile'
  /** Fast-scroll / reduced: skip delays and land on final closed lock. */
  instantComplete?: boolean
}

/**
 * Compressed mobile handoff — lock begins before records vanish.
 * ~25% faster than the prior mobile timeline; soft opacity ease; no bounce.
 *
 * Approx timeline (mobile):
 * 0.00–0.30 settle (all records visible at full opacity)
 * 0.30–0.70 converge toward lock (still full opacity)
 * 0.52–0.86 lock body fades in (overlap)
 * 0.75–1.01 records fade into lock (soft ease, delayed)
 * 0.86–1.12 shackle closes
 * 1.09–1.28 keyhole / check / label
 */
const MOBILE_TIMELINE = {
  lockDelay: 0.52,
  lockDuration: 0.34,
  shackleDelay: 0.86,
  shackleDuration: 0.26,
  keyholeDelay: 1.09,
  keyholeDuration: 0.19,
  checkDelay: 1.12,
  checkDuration: 0.15,
  labelDelay: 1.16,
  labelDuration: 0.15,
  recordMoveDelay: 0.3,
  recordMoveDuration: 0.41,
  /** Fade starts only after lock is mid-appear — do not keyframe from t=0. */
  recordFadeDelay: 0.75,
  recordFadeDuration: 0.26,
  recordOpacityTimes: [0, 1] as number[],
  recordOpacity: [1, 0] as number[],
  recordScaleTimes: [0, 1] as number[],
  recordScale: [1, 0.88] as number[],
}

const DESKTOP_TIMELINE = {
  lockDelay: 1.8,
  lockDuration: 0.7,
  shackleDelay: 2.35,
  shackleDuration: 0.85,
  keyholeDelay: 3.1,
  keyholeDuration: 0.35,
  checkDelay: 3.35,
  checkDuration: 0.28,
  labelDelay: 3.5,
  labelDuration: 0.3,
  recordMoveDelay: 1.15,
  recordMoveDuration: 0.8,
  recordFadeDelay: 0,
  recordFadeDuration: 3.5,
  recordOpacityTimes: [0, 0.33, 0.55, 0.75, 1] as number[],
  recordOpacity: [1, 1, 0.85, 0.4, 0] as number[],
  recordScaleTimes: [0, 0.33, 0.55, 0.75, 1] as number[],
  recordScale: [1, 1.015, 0.94, 0.88, 0.82] as number[],
}

/**
 * Classic vertical padlock — graphite body, inverted-U shackle, keyhole.
 * One-shot only. Layers stay mounted; opacity/transform only.
 */
export function ClassicDataLock({
  active,
  className = '',
  timeline = 'desktop',
  instantComplete = false,
}: ClassicDataLockProps) {
  const reduced = useReducedMotion()
  const closed = !!reduced || active
  const skipMotion = !!reduced || instantComplete
  const t = timeline === 'mobile' ? MOBILE_TIMELINE : DESKTOP_TIMELINE
  const animDuration =
    timeline === 'mobile' ? 1.31 : SECURITY_ANIMATION_DURATION_S
  const lockEase = timeline === 'mobile' ? softEase : premiumEase
  const fadeEase = timeline === 'mobile' ? softEase : premiumEase

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      data-testid="lv3-security-lock"
      data-motion="security-lock"
      data-security-mode="oneshot"
      data-lock-shape="classic-vertical"
      data-lock-phase={closed ? 'closed' : 'open'}
      data-security-timeline={timeline}
      data-anim-duration={animDuration}
      data-shackle-ratio={SECURITY_SHACKLE_RATIO}
      data-layers-mounted="records+lock"
      data-empty-frame-guard="records-lock-overlap"
      data-instant-complete={skipMotion ? 'true' : 'false'}
    >
      <div className={styles.stage}>
        <div className={styles.lockSlot} data-body-width="420">
          <motion.div
            className={styles.lockShell}
            data-security-layer="lock"
            initial={false}
            animate={
              closed
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 36, scale: 0.94 }
            }
            transition={{
              duration: skipMotion ? 0 : t.lockDuration,
              delay: skipMotion ? 0 : t.lockDelay,
              ease: lockEase,
            }}
          >
            <motion.div
              className={styles.shackleWrap}
              data-shackle-width="220"
              initial={false}
              animate={
                closed
                  ? { x: 0, y: 0 }
                  : { x: 32, y: -80 }
              }
              transition={{
                duration: skipMotion ? 0 : t.shackleDuration,
                delay: skipMotion ? 0 : t.shackleDelay,
                ease: premiumEase,
              }}
            >
              <svg
                className={styles.shackleSvg}
                viewBox="0 0 220 230"
                aria-hidden
              >
                <path
                  d="M40 220 V95 C40 42 78 18 110 18 C142 18 180 42 180 95 V220"
                  fill="none"
                  stroke="#1d272b"
                  strokeWidth="46"
                  strokeLinecap="round"
                />
              </svg>
            </motion.div>

            <div className={styles.lockBody} data-body-height="470">
              <div className={styles.bodyFace} aria-hidden>
                <motion.div
                  className={styles.keyhole}
                  data-keyhole="circle-stem"
                  initial={false}
                  animate={
                    closed
                      ? { opacity: 1, scale: 1 }
                      : { opacity: 0, scale: 0.88 }
                  }
                  transition={{
                    duration: skipMotion ? 0 : t.keyholeDuration,
                    delay: skipMotion ? 0 : t.keyholeDelay,
                    ease: premiumEase,
                  }}
                >
                  <span className={styles.keyholeCircle} data-keyhole-part="circle" />
                  <span className={styles.keyholeStem} data-keyhole-part="stem" />
                </motion.div>

                <motion.div
                  className={styles.checkMark}
                  initial={false}
                  animate={
                    closed
                      ? { opacity: 1, scale: 1 }
                      : { opacity: 0, scale: 0.8 }
                  }
                  transition={{
                    duration: skipMotion ? 0 : t.checkDuration,
                    delay: skipMotion ? 0 : t.checkDelay,
                    ease: premiumEase,
                  }}
                  aria-hidden
                >
                  <svg viewBox="0 0 32 32" className={styles.checkSvg}>
                    <path
                      d="M7 16.5 L13 22.5 L25 9.5"
                      fill="none"
                      stroke="#f4f1ec"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.div>
              </div>
            </div>
          </motion.div>

          <motion.p
            className={styles.sealLabel}
            initial={false}
            animate={closed ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{
              duration: skipMotion ? 0 : t.labelDuration,
              delay: skipMotion ? 0 : t.labelDelay,
              ease: premiumEase,
            }}
          >
            Dane zabezpieczone
          </motion.p>
        </div>

        {SECURITY_RECORDS.map((record, i) => {
          const start = SECURITY_RECORD_START[i]!
          const pack = SECURITY_RECORD_PACKAGE[i]!
          return (
            <motion.article
              key={record.id}
              className={styles.record}
              data-record={record.id}
              data-security-layer="record"
              data-mobile-index={i}
              initial={false}
              animate={
                closed
                  ? {
                      left: `${pack.x}%`,
                      top: `${pack.y}%`,
                      opacity: skipMotion ? 0 : t.recordOpacity,
                      scale: skipMotion ? 0.9 : t.recordScale,
                      zIndex: 1,
                    }
                  : {
                      left: `${start.x}%`,
                      top: `${start.y}%`,
                      opacity: 1,
                      scale: 1,
                      zIndex: 4,
                    }
              }
              transition={
                skipMotion
                  ? { duration: 0 }
                  : {
                      left: {
                        duration: t.recordMoveDuration,
                        delay: t.recordMoveDelay,
                        ease: premiumEase,
                      },
                      top: {
                        duration: t.recordMoveDuration,
                        delay: t.recordMoveDelay,
                        ease: premiumEase,
                      },
                      opacity: {
                        duration: t.recordFadeDuration,
                        times: t.recordOpacityTimes,
                        delay: t.recordFadeDelay,
                        ease: fadeEase,
                      },
                      scale: {
                        duration: t.recordFadeDuration,
                        times: t.recordScaleTimes,
                        delay: t.recordFadeDelay,
                        ease: fadeEase,
                      },
                      zIndex: { duration: 0 },
                    }
              }
            >
              <div className={styles.recordInner}>
                <strong>{record.couple}</strong>
                <span>
                  {record.kind === 'Płatność' || record.kind === 'Ankieta'
                    ? `${record.kind} · ${record.detail}`
                    : record.detail}
                </span>
              </div>
            </motion.article>
          )
        })}
      </div>
    </div>
  )
}
