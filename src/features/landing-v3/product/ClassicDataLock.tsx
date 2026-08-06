import { motion, useReducedMotion } from 'framer-motion'
import {
  SECURITY_ANIMATION_DURATION_S,
  SECURITY_RECORD_PACKAGE,
  SECURITY_RECORD_START,
  SECURITY_RECORDS,
  SECURITY_SHACKLE_RATIO,
} from '@/features/landing-v3/data/securityRecords'
import { premiumEase } from '@/features/landing-v3/motion/variants'
import styles from './ClassicDataLock.module.css'

interface ClassicDataLockProps {
  active: boolean
  className?: string
}

/**
 * Classic vertical padlock — graphite body, inverted-U shackle, keyhole.
 * One-shot only. Not a suitcase / data-container seal.
 */
export function ClassicDataLock({
  active,
  className = '',
}: ClassicDataLockProps) {
  const reduced = useReducedMotion()
  const closed = !!reduced || active

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      data-testid="lv3-security-lock"
      data-motion="security-lock"
      data-security-mode="oneshot"
      data-lock-shape="classic-vertical"
      data-lock-phase={closed ? 'closed' : 'open'}
      data-anim-duration={SECURITY_ANIMATION_DURATION_S}
      data-shackle-ratio={SECURITY_SHACKLE_RATIO}
    >
      <div className={styles.stage}>
        <div className={styles.lockSlot} data-body-width="420">
          <motion.div
            className={styles.lockShell}
            initial={false}
            animate={
              closed
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 36, scale: 0.94 }
            }
            transition={{
              duration: reduced ? 0 : 0.7,
              delay: reduced ? 0 : 1.8,
              ease: premiumEase,
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
                duration: reduced ? 0 : 0.85,
                delay: reduced ? 0 : 2.35,
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
                    duration: reduced ? 0 : 0.35,
                    delay: reduced ? 0 : 3.1,
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
                    duration: reduced ? 0 : 0.28,
                    delay: reduced ? 0 : 3.35,
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
              duration: reduced ? 0 : 0.3,
              delay: reduced ? 0 : 3.5,
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
              data-mobile-index={i}
              initial={false}
              animate={
                closed
                  ? {
                      left: `${pack.x}%`,
                      top: `${pack.y}%`,
                      opacity: reduced ? 0 : [1, 1, 0.85, 0.4, 0],
                      scale: reduced ? 0.9 : [1, 1.015, 0.94, 0.88, 0.82],
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
                reduced
                  ? { duration: 0 }
                  : {
                      left: {
                        duration: 0.8,
                        delay: 1.15,
                        ease: premiumEase,
                      },
                      top: {
                        duration: 0.8,
                        delay: 1.15,
                        ease: premiumEase,
                      },
                      opacity: {
                        duration: 3.5,
                        times: [0, 0.33, 0.55, 0.75, 1],
                        delay: 0,
                        ease: premiumEase,
                      },
                      scale: {
                        duration: 3.5,
                        times: [0, 0.33, 0.55, 0.75, 1],
                        delay: 0,
                        ease: premiumEase,
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
