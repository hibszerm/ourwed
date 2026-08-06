import { useEffect, useState } from 'react'
import { DEMO_ASSIGNMENT } from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import { usePrefersReducedMotion } from '@/features/landing-v3/hooks/usePrefersReducedMotion'
import styles from './mobileArtboard.module.css'

const FIELDS = [
  { label: 'Imię i nazwisko', value: 'Julia Nowak' },
  { label: 'Telefon', value: '500 100 200' },
  { label: 'Data ślubu', value: DEMO_ASSIGNMENT.dateLabel },
  { label: 'Pakiet', value: DEMO_ASSIGNMENT.packageName },
] as const

const MAP = ['Dane pary', 'Pakiet', 'Termin'] as const

/** Pattern B — compact two-scene QC artboard (≤2.2s). */
export function MobileQcArtboard() {
  const reduced = usePrefersReducedMotion()

  return (
    <MobileRevealAnchor reduced={reduced}>
      {(active) => <QcScene active={active || reduced} reduced={reduced} />}
    </MobileRevealAnchor>
  )
}

function QcScene({ active, reduced }: { active: boolean; reduced: boolean }) {
  const [phase, setPhase] = useState(() => (reduced ? 4 : 0))

  useEffect(() => {
    if (!active) return
    if (reduced) {
      const t = window.setTimeout(() => setPhase(4), 0)
      return () => window.clearTimeout(t)
    }
    const t0 = window.setTimeout(() => setPhase(1), 0)
    const t1 = window.setTimeout(() => setPhase(2), 500)
    const t2 = window.setTimeout(() => setPhase(3), 1100)
    const t3 = window.setTimeout(() => setPhase(4), 1800)
    return () => {
      window.clearTimeout(t0)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [active, reduced])

  const showMap = phase >= 2 || reduced
  const ready = phase >= 3 || reduced

  return (
    <div
      className={`${styles.board} ${styles.qcBoard}`}
      data-mobile-artboard="qc"
      data-artboard-pattern="B"
      data-qc-phase={String(phase)}
    >
      <div className={styles.qcPanels}>
        <div className={styles.qcForm}>
          <p className={styles.eyebrow}>Ankieta</p>
          {FIELDS.map((f) => (
            <label key={f.label}>
              <span className={styles.qcLabel}>{f.label}</span>
              <span className={styles.qcValue}>{f.value}</span>
            </label>
          ))}
        </div>
        <div className={styles.qcDoc}>
          <p className={styles.eyebrow}>Umowa</p>
          <p className={styles.qcValue}>
            <strong>{DEMO_ASSIGNMENT.displayName}</strong>
          </p>
          <p className={styles.qcValue}>{DEMO_ASSIGNMENT.packageName}</p>
          <p className={styles.qcValue}>{DEMO_ASSIGNMENT.contractValueLabel}</p>
          <p className={styles.qcValue}>{DEMO_ASSIGNMENT.dateLabel}</p>
        </div>
      </div>
      <div className={styles.qcBridge} data-active={showMap ? 'true' : 'false'}>
        {MAP.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <p className={styles.qcStatus}>
        {ready ? 'Umowa wygenerowana · gotowa do wysłania' : 'Mapowanie danych…'}
      </p>
    </div>
  )
}
