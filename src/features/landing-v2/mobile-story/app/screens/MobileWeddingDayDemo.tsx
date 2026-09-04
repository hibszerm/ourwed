import { motion, useTransform, type MotionValue } from 'framer-motion'
import styles from './MobileWeddingDayDemo.module.css'
import { mobileOurWedDemo } from '@/features/landing-v2/mobile-story/app/data/mobileOurWedDemoData'

type Props = {
  nawigujPress: MotionValue<number>
}

/**
 * Tryb dnia ślubu — Cockpit-like mobile document (visual only).
 * Single scrollable content layer; Y driven by shared MotionValue in the shell.
 */
export function MobileWeddingDayDemo({ nawigujPress }: Props) {
  const day = mobileOurWedDemo.weddingDay
  const btnScale = useTransform(nawigujPress, [0, 1], [1, 0.98])

  return (
    <div
      className={styles.root}
      data-mobile-app-screen="wedding-day"
      data-mobile-wedding-day-content=""
    >
      <p className={styles.back}>{day.backLabel}</p>

      <header className={styles.identity}>
        <p className={styles.couple}>{day.coupleName}</p>
        <p className={styles.date}>
          {day.dateLabel} · {day.packageName}
        </p>
      </header>

      <section className={styles.punkt} data-mobile-next-point="">
        <p className={styles.eyebrow}>{day.nowLabel}</p>
        <p className={styles.heroTime}>{day.now.time}</p>
        <p className={styles.heroTitle}>{day.now.role}</p>
        <p className={styles.heroPlace}>{day.now.place}</p>
        <p className={styles.heroAddress}>{day.now.city}</p>
        <p className={styles.heroLeg}>
          {day.now.leg.duration} · {day.now.leg.distance}
        </p>

        <div className={styles.actions}>
          <motion.button
            type="button"
            className={styles.primaryBtn}
            data-mobile-nawiguj=""
            style={{ scale: btnScale }}
            tabIndex={-1}
            aria-hidden
          >
            {day.navCta}
          </motion.button>
        </div>

        <p className={styles.nextHint}>
          {day.nextLabel}: {day.next.role} · {day.next.time}
        </p>
      </section>

      <section className={styles.plan} data-mobile-day-plan="">
        <p className={styles.sectionTitle}>{day.planLabel}</p>
        <ol className={styles.stops}>
          {day.schedule.map((s, i) => (
            <li
              key={`${s.time}-${s.role}`}
              className={styles.stop}
              data-active={i === 2 ? 'true' : undefined}
              data-mobile-plan-stop={s.role}
            >
              <span className={styles.stopTime}>{s.time}</span>
              <span className={styles.stopBody}>
                <strong>{s.role}</strong>
                <em>{s.place}</em>
              </span>
              {day.routeLegs[i] ? (
                <span className={styles.stopLeg}>
                  ↓ {day.routeLegs[i].duration} · {day.routeLegs[i].distance}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.contacts} data-mobile-contacts="">
        <p className={styles.sectionTitle}>{day.contactsLabel}</p>
        <ul className={styles.contactList}>
          {day.contacts.map((c) => (
            <li key={c.name} className={styles.contactRow}>
              <div className={styles.contactMeta}>
                <p className={styles.contactName}>{c.name}</p>
                <p className={styles.contactPhone}>{c.phone}</p>
              </div>
              <span className={styles.contactAction}>Zadzwoń</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.critical} data-mobile-critical="">
        <p className={styles.criticalHeading}>{day.criticalLabel}</p>
        <ul className={styles.criticalList}>
          {day.criticalNotes.map((n) => (
            <li key={n.label} className={styles.criticalItem}>
              <p className={styles.criticalLabel}>{n.label}</p>
              <p className={styles.criticalContent}>{n.content}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        className={styles.briefBlock}
        data-mobile-brief-card=""
        data-mobile-wedding-day-last-section=""
      >
        <p className={styles.sectionTitle}>{day.briefTitle}</p>
        <div className={styles.briefInner}>
          <div>
            <p className={styles.briefLabel}>{day.briefLabel}</p>
            <p className={styles.briefSub}>{day.briefSupport}</p>
          </div>
          <span className={styles.briefAction}>{day.briefOpen}</span>
        </div>
      </section>
    </div>
  )
}
