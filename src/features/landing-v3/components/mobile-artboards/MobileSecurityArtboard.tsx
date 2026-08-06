import { useEffect, useState, type CSSProperties } from 'react'
import { SECURITY_RECORDS } from '@/features/landing-v3/data/securityRecords'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import { usePrefersReducedMotion } from '@/features/landing-v3/hooks/usePrefersReducedMotion'
import styles from './mobileArtboard.module.css'

const RECORDS = SECURITY_RECORDS.slice(0, 4)

const START = [
  { left: '6%', top: '10%' },
  { left: '58%', top: '8%' },
  { left: '8%', top: '58%' },
  { left: '56%', top: '62%' },
] as const

const PACK = [
  { left: '28%', top: '34%' },
  { left: '42%', top: '36%' },
  { left: '30%', top: '46%' },
  { left: '40%', top: '48%' },
] as const

/**
 * Pattern B — mobile security artboard.
 * Records visible immediately (no blank stage). Lock ≤1.8s.
 */
export function MobileSecurityArtboard() {
  const reduced = usePrefersReducedMotion()
  return (
    <MobileRevealAnchor reduced={reduced} fallbackMs={700}>
      {(active) => (
        <SecurityScene active={active || reduced} reduced={reduced} />
      )}
    </MobileRevealAnchor>
  )
}

function SecurityScene({
  active,
  reduced,
}: {
  active: boolean
  reduced: boolean
}) {
  const [phase, setPhase] = useState(() => (reduced ? 5 : 1))

  useEffect(() => {
    if (!active) return
    if (reduced) {
      const t = window.setTimeout(() => setPhase(5), 0)
      return () => window.clearTimeout(t)
    }
    const t0 = window.setTimeout(() => setPhase(1), 0)
    const t1 = window.setTimeout(() => setPhase(2), 450)
    const t2 = window.setTimeout(() => setPhase(3), 1050)
    const t3 = window.setTimeout(() => setPhase(4), 1450)
    const t4 = window.setTimeout(() => setPhase(5), 1750)
    return () => {
      window.clearTimeout(t0)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      window.clearTimeout(t4)
    }
  }, [active, reduced])

  const converge = phase >= 2
  const lockVisible = phase >= 3
  const shackleClosed = phase >= 4
  const statusVisible = phase >= 5 || reduced

  return (
    <div
      className={styles.securityBoard}
      data-mobile-artboard="security"
      data-artboard-pattern="parity-scale"
      data-security-mobile="true"
      data-lock-phase={shackleClosed ? 'closed' : 'open'}
      data-anim-duration="1.75"
    >
      {RECORDS.map((rec, i) => {
        const pos = converge ? PACK[i] : START[i]
        return (
          <div
            key={rec.id}
            className={styles.secRecord}
            style={
              {
                left: pos.left,
                top: pos.top,
                opacity: converge && lockVisible ? 0.35 : 1,
                transform: converge ? 'scale(0.86)' : 'scale(1)',
              } as CSSProperties
            }
          >
            <strong>{rec.couple}</strong>
            <span>
              {rec.kind} · {rec.detail}
            </span>
          </div>
        )
      })}

      <div className={styles.secLock} data-visible={lockVisible ? 'true' : 'false'}>
        <div
          className={styles.secShackle}
          data-open={shackleClosed ? 'false' : 'true'}
          aria-hidden
        />
        <div className={styles.secLockBody} aria-hidden />
        <div
          className={styles.secKeyhole}
          data-visible={statusVisible ? 'true' : 'false'}
          aria-hidden
        />
      </div>

      <p className={styles.secStatus} data-visible={statusVisible ? 'true' : 'false'}>
        Dane zabezpieczone
      </p>
    </div>
  )
}
