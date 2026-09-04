import { motion, motionValue, useTransform, type MotionValue } from 'framer-motion'
import styles from './MobileOfflineBriefDemo.module.css'
import { mobileOurWedDemo } from '@/features/landing-v2/mobile-story/app/data/mobileOurWedDemoData'

const ONE_SCALE = motionValue(1)

type Props = {
  openT: MotionValue<number>
  /** Optional paper scale polish during enter. */
  paperScale?: MotionValue<number>
  enterY?: MotionValue<number>
}

/**
 * One-page offline Brief — editorial mobile call sheet.
 * Phase 6H.3: two-column recomposition for landing-page readability.
 */
export function MobileOfflineBriefDemo({
  openT,
  paperScale = ONE_SCALE,
  enterY,
}: Props) {
  const b = mobileOurWedDemo.brief
  const fallbackEnterY = useTransform(openT, [0, 1], [10, 0])
  const y = enterY ?? fallbackEnterY

  return (
    <motion.div
      className={styles.root}
      style={{ y, opacity: openT }}
      data-mobile-app-screen="brief"
      data-mobile-brief-sheet=""
    >
      <div className={styles.shell}>
        <div className={styles.status} data-mobile-brief-meta="">
          <p className={styles.offline} data-mobile-brief-offline="">
            <span className={styles.offlineDot} aria-hidden />
            {b.offline}
          </p>
          <p className={styles.page}>{b.pageIndicator}</p>
        </div>

        <motion.div
          className={styles.paper}
          data-mobile-brief-paper=""
          data-mobile-brief-viewport=""
          style={{ scale: paperScale }}
        >
          <div className={styles.doc} data-mobile-brief-content="">
            <header className={styles.docHeader} data-mobile-brief-first="">
              <p className={styles.brand}>{b.brand}</p>
              <p className={styles.docCouple}>{b.coupleName}</p>
              <p className={styles.docMeta}>
                {b.date}
                <span className={styles.docMetaSep}>·</span>
                {b.packageName}
              </p>
            </header>

            <section className={styles.section} data-mobile-brief-section="schedule">
              <p className={styles.sectionTitle}>HARMONOGRAM</p>
              <ul className={styles.timeline}>
                {b.schedule.map((row) => (
                  <li key={`${row.time}-${row.role}`}>
                    <span className={styles.time}>{row.time}</span>
                    <span className={styles.tlBody}>
                      <strong>
                        {row.role}
                        <em>{row.place}</em>
                      </strong>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <div className={styles.primaryGrid} data-mobile-brief-section="primary-grid">
              <section className={styles.col} data-mobile-brief-section="facts">
                <p className={styles.sectionTitle}>KLUCZOWE INFORMACJE</p>
                <ul className={styles.kvTable}>
                  {b.facts.map((f) => (
                    <li key={f.label}>
                      <span>{f.label}</span>
                      <strong>{f.value}</strong>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={styles.col} data-mobile-brief-section="critical">
                <p className={styles.sectionTitle}>{b.criticalLabel}</p>
                <ul className={styles.critical}>
                  {b.criticalNotes.map((n) => (
                    <li key={n.label}>
                      <strong>{n.label}</strong>
                      <span>{n.content}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className={styles.peopleGrid} data-mobile-brief-section="people-grid">
              <section className={styles.col} data-mobile-brief-section="contacts">
                <p className={styles.sectionTitle}>KONTAKTY</p>
                <ul className={styles.peopleList}>
                  {b.contacts.map((c) => (
                    <li key={c.role}>
                      <strong>{c.role}</strong>
                      <span>{c.phone}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={styles.col} data-mobile-brief-section="key-people">
                <p className={styles.sectionTitle}>OSOBY KLUCZOWE</p>
                <ul className={styles.peopleList}>
                  {b.keyPeople.map((p) => (
                    <li key={p.role}>
                      <em>{p.role}</em>
                      <strong>{p.name}</strong>
                      <span>{p.phone}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className={styles.section} data-mobile-brief-section="logistics">
              <p className={styles.sectionTitle}>LOGISTYKA</p>
              <ul className={styles.logistics}>
                {b.logistics.map((row) => (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </li>
                ))}
              </ul>
            </section>

            <section
              className={styles.crewPanel}
              data-mobile-brief-section="crew-note"
              data-mobile-brief-last-section=""
            >
              <p className={styles.sectionTitle}>{b.crewNoteLabel}</p>
              <p className={styles.crewNote}>
                {b.crewNoteLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
