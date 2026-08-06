import { DEMO_ASSIGNMENT } from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import styles from './mobileArtboard.module.css'

const BENEFITS = [
  'Plan dnia w poprawnej kolejności',
  'Adresy i szybka nawigacja',
  'Kontakty do najważniejszych osób',
] as const

/** Parity artboard — layered brief document + benefits. */
export function MobileBriefArtboard() {
  return (
    <MobileRevealAnchor>
      {(active) => (
        <div
          className={styles.briefBoard}
          data-mobile-artboard="brief"
          data-artboard-pattern="parity-B"
          data-reveal-active={active ? 'true' : 'false'}
        >
          <div className={styles.briefStack} data-dominant="true">
            <div className={styles.briefBack} aria-hidden data-brief-layer="rear" />
            <article className={styles.briefPage} data-brief-layer="primary">
              <p className={styles.eyebrow}>Brief dnia</p>
              <h3>{DEMO_ASSIGNMENT.displayName}</h3>
              <p className={styles.briefPageMeta}>{DEMO_ASSIGNMENT.dateLabel}</p>

              <div className={styles.briefBlock}>
                <strong>Plan dnia</strong>
                <p>09:30 Apartamenty Stary Rynek</p>
                <p>10:30 Hotel Liberté</p>
                <p>14:00 Kościół św. Anny</p>
                <p>16:00 Folwark Wąsowo</p>
              </div>

              <div className={styles.briefBlock}>
                <strong>Kontakty</strong>
                <ul>
                  <li>Para — 500 100 200</li>
                  <li>Koordynator — 501 200 300</li>
                  <li>DJ — 502 300 400</li>
                </ul>
              </div>

              <div className={styles.briefBlock}>
                <strong>Uwagi</strong>
                <ul>
                  <li>Pierwszy taniec 20:15</li>
                  <li>Tort 21:30</li>
                  <li>Zdjęcia grupowe po ceremonii</li>
                </ul>
              </div>
            </article>
          </div>

          <ol className={styles.briefBenefits}>
            {BENEFITS.map((item, i) => (
              <li key={item}>
                <span className={styles.briefBenefitsNum}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </MobileRevealAnchor>
  )
}
