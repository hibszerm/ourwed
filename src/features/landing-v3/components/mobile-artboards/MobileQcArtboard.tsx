import { useEffect, useState } from 'react'
import { DEMO_ASSIGNMENT } from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import { usePrefersReducedMotion } from '@/features/landing-v3/hooks/usePrefersReducedMotion'
import styles from './mobileArtboard.module.css'

const FIELDS = [
  { label: 'Imię i nazwisko', value: 'Julia Nowak' },
  { label: 'Partner', value: 'Adrian Nowak' },
  { label: 'Data ślubu', value: DEMO_ASSIGNMENT.dateLabel },
  { label: 'Pakiet', value: DEMO_ASSIGNMENT.packageName },
] as const

const MAP = ['Dane pary', 'Pakiet', 'Termin'] as const

/** Real-scale overlapping questionnaire → contract. */
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
    const t1 = window.setTimeout(() => setPhase(2), 450)
    const t2 = window.setTimeout(() => setPhase(3), 1000)
    const t3 = window.setTimeout(() => setPhase(4), 1600)
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
      className={styles.qcBoard}
      data-mobile-artboard="qc"
      data-artboard-pattern="parity-scale"
      data-qc-phase={String(phase)}
    >
      <div className={styles.qcStage} data-dominant="true" data-composition="qc-overlap">
        <div
          className={styles.qcForm}
          data-surface="questionnaire"
          data-surface-w="200"
          data-surface-h="420"
        >
          <p className={styles.eyebrow}>Ankieta kontraktowa</p>
          {FIELDS.map((f) => (
            <label key={f.label}>
              <span className={styles.qcLabel}>{f.label}</span>
              <span className={styles.qcValue}>{f.value}</span>
            </label>
          ))}
        </div>

        <div
          className={styles.qcDoc}
          data-surface="contract"
          data-surface-w="224"
          data-surface-h="470"
        >
          <p className={styles.eyebrow}>Studio North Wedding</p>
          <p className={styles.qcDocTitle}>UMOWA O ŚWIADCZENIE USŁUG</p>
          <p className={styles.qcDocLine}>
            Zawarta pomiędzy:
            <br />
            <strong>{DEMO_ASSIGNMENT.displayName}</strong>
          </p>
          <p className={styles.qcDocLine}>
            Pakiet: <strong>{DEMO_ASSIGNMENT.packageName}</strong>
          </p>
          <p className={styles.qcDocLine}>
            Termin: <strong>{DEMO_ASSIGNMENT.dateLabel}</strong>
          </p>
          <p className={styles.qcDocLine}>
            Wartość: <strong>{DEMO_ASSIGNMENT.contractValueLabel}</strong>
          </p>
          <div className={styles.qcDocStatus}>
            {ready
              ? '✓ Umowa wygenerowana\nGotowa do wysłania'
              : 'Przygotowywanie dokumentu…'}
          </div>
        </div>

        <div
          className={styles.qcBridge}
          data-active={showMap ? 'true' : 'false'}
        >
          {MAP.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
