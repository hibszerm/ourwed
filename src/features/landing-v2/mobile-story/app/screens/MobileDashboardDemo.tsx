import { motion, useTransform, type MotionValue } from 'framer-motion'
import { IconMapPin } from '@/components/icons'
import { mobileOurWedDemo } from '@/features/landing-v2/mobile-story/app/data/mobileOurWedDemoData'
import styles from './MobileDashboardDemo.module.css'

type Props = {
  focusT: MotionValue<number>
}

/**
 * Production mobile Pulpit reconstruction (max-width: 767px architecture).
 * Order (priority inquiries): Hero → Kolejne zlecenia → Nowe zgłoszenia → Dzisiaj → Terminy oddania → Powiadomienia
 * Sources: DashboardV3Page.module.css orders, Hero, Upcoming, Inquiries, Today, Deadline, Notifications.
 */
export function MobileDashboardDemo({ focusT }: Props) {
  const d = mobileOurWedDemo.dashboard
  const n = d.nearest
  const scale = useTransform(focusT, [0, 1], [1, 1.008])
  const ringOp = useTransform(focusT, [0, 1], [0, 1])

  return (
    <div
      className={styles.root}
      data-mobile-app-screen="dashboard"
      data-mobile-dashboard-content=""
      data-dashboard-order="hero,upcoming,inquiries,today,deadlines,notifications"
    >
      <motion.section
        className={styles.hero}
        data-mobile-wedding-card=""
        data-dashboard-section="hero"
        data-mobile-dashboard-hero=""
        id="dashboard-v3-nearest-assignment-demo"
        style={{ scale }}
      >
        <div className={styles.dateBlock} aria-hidden>
          <span className={styles.dateDay}>{n.day}</span>
          <span className={styles.dateMonth}>{n.month}</span>
        </div>

        <div className={styles.body}>
          <div className={styles.typeRow}>
            <span className={styles.typeChip}>{n.typeLabel}</span>
          </div>
          <p className={styles.couple}>{n.coupleName}</p>
          <div className={styles.chips}>
            <span className={styles.locationChip}>
              <IconMapPin width={13} height={13} aria-hidden />
              <span>{n.location}</span>
            </span>
          </div>
        </div>

        <div className={styles.countdown} aria-hidden>
          <span className={styles.countdownMobile}>{n.countdownRelative}</span>
        </div>

        <span className={styles.sentinel} data-mobile-assignment-sentinel="" aria-hidden />
        <motion.span className={styles.focusRing} style={{ opacity: ringOp }} aria-hidden />
      </motion.section>

      <section
        className={styles.upcomingBand}
        data-dashboard-section="upcoming"
        data-mobile-upcoming=""
        data-mobile-dashboard-upcoming=""
      >
        <p className={styles.upcomingLabel}>{d.upcomingLabel}</p>
        <div className={styles.upcomingGrid}>
          {d.upcoming.map((u) => (
            <div key={u.id} className={styles.upcomingCard}>
              <div className={styles.upDate} aria-hidden>
                <span className={styles.upDay}>{u.day}</span>
                <span className={styles.upMonth}>{u.month}</span>
              </div>
              <p className={styles.upName}>{u.coupleName}</p>
              <span className={styles.upType}>{u.typeLabel}</span>
              <span className={styles.upRel}>{u.relative}</span>
              <p className={styles.upLoc}>
                <IconMapPin width={13} height={13} aria-hidden />
                <span>{u.location}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* order 4 — Nowe zgłoszenia (priority when non-empty) */}
      <section
        className={`${styles.inquiriesPanel} ${styles.secondaryCard}`}
        data-dashboard-section="inquiries"
        data-mobile-dashboard-inquiries=""
        data-mobile-slot="priority"
      >
        <header className={styles.inquiriesHead}>
          <div>
            <p className={styles.inquiriesTitle}>{d.inquiriesLabel}</p>
            <p className={styles.inquiriesSub}>{d.inquiriesSubtitle}</p>
          </div>
          <span className={styles.inquiriesAll}>{d.inquiriesAllLabel}</span>
        </header>
        <ul className={styles.inquiriesList}>
          {d.inquiries.map((item) => (
            <li key={item.id} className={styles.inquiryItem}>
              <div className={styles.inquiryMain}>
                <p className={styles.inquiryCouple}>{item.coupleName}</p>
                <p className={styles.inquiryMeta}>
                  <span>{item.weddingDateLabel}</span>
                  <span aria-hidden> · </span>
                  <span>{item.packageName}</span>
                </p>
                <p className={styles.inquirySubmitted}>{item.submittedLabel}</p>
              </div>
              <div className={styles.inquiryActions} aria-hidden>
                <span className={styles.btnPrimary}>Akceptuj</span>
                <span className={styles.btnGhost}>Odrzuć</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        className={`${styles.todayPanel} ${styles.operational}`}
        data-dashboard-section="today"
        data-mobile-tasks=""
        data-mobile-dashboard-today=""
      >
        <header className={styles.todayHead}>
          <p className={styles.horizonLabel}>{d.tasksLabel}</p>
          <span className={styles.count}>{d.tasks.length}</span>
        </header>
        <ul className={styles.taskList}>
          {d.tasks.map((t) => (
            <li key={t.id} className={styles.taskItem}>
              <span className={styles.checkbox} aria-hidden />
              <span className={styles.taskBody}>
                <span className={styles.coupleMeta}>{t.meta}</span>
                <span className={styles.taskTitle}>{t.title}</span>
                <span className={styles.taskDate}>{t.due}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* order 6 — Terminy oddania */}
      <section
        className={`${styles.deadlinesPanel} ${styles.operational}`}
        data-dashboard-section="deadlines"
        data-mobile-dashboard-deadlines=""
      >
        <header className={styles.deadlinesHead}>
          <p className={styles.deadlinesTitle}>{d.deadlinesLabel}</p>
          <span className={styles.deadlinesCount}>{d.deadlines.length}</span>
        </header>
        <ul className={styles.deadlinesList}>
          {d.deadlines.map((dl, index) => (
            <li key={dl.id}>
              <div
                className={`${styles.deadlineRow}${index === 0 ? ` ${styles.deadlineNearest}` : ''}`}
              >
                <span className={styles.deadlineMarker} aria-hidden>
                  <span className={styles.deadlineDay}>{dl.day}</span>
                  <span className={styles.deadlineMonth}>{dl.month}</span>
                </span>
                <span className={styles.deadlineBody}>
                  <span className={styles.deadlineName}>{dl.coupleName}</span>
                  <span className={styles.deadlineDue}>{dl.dueLabel}</span>
                </span>
                <span className={styles.deadlineRel} data-state={dl.state}>
                  {dl.contextLabel}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        className={`${styles.notesPanel} ${styles.supporting}`}
        data-dashboard-section="notifications"
        data-mobile-notifications=""
        data-mobile-dashboard-notifications=""
        data-mobile-dashboard-last-section=""
      >
        <header className={styles.notesHead}>
          <p className={styles.notesTitle}>{d.notificationsLabel}</p>
          <p className={styles.notesSub}>{d.notificationsSubtitle}</p>
        </header>
        <ul className={styles.notesList}>
          {d.notifications.map((item) => (
            <li key={item.id}>
              <div
                className={styles.noteItem}
                data-unread={item.unread ? 'true' : 'false'}
              >
                <span className={styles.noteIcon} aria-hidden />
                <span className={styles.noteMain}>
                  <span className={styles.noteTitle}>{item.title}</span>
                  <span className={styles.noteBody}>{item.body}</span>
                  <span className={styles.noteTime}>{item.time}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
