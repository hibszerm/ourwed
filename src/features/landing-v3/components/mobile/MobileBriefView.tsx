import { getMobileBriefContent } from '@/features/landing-v3/data/mobileWeddingDayDemo'
import styles from './MobileBriefView.module.css'

type Props = {
  /** 0 = hidden, 1 = fully shown */
  progress: number
}

/**
 * Mobile-native Brief layer — not a scaled PDF.
 * Content derived from shared mobileWeddingDayDemo.
 */
export function MobileBriefView({ progress }: Props) {
  const brief = getMobileBriefContent()
  const visible = progress > 0.02

  return (
    <div
      className={styles.layer}
      data-mobile-screen="brief"
      data-screen-layer="brief"
      data-active={visible ? 'true' : 'false'}
      style={{
        opacity: progress,
        transform: `translateX(${(1 - progress) * 24}px)`,
      }}
      aria-hidden={!visible}
    >
      <header className={styles.head}>
        <p className={styles.eyebrow}>{brief.eyebrow}</p>
        <h3 className={styles.title}>{brief.title}</h3>
        <p className={styles.meta}>{brief.meta}</p>
        <p className={styles.status}>{brief.status}</p>
        <p className={styles.routeSummary}>
          <span>{brief.routeSummary.line}</span>
          <span>{brief.routeSummary.metrics}</span>
        </p>
      </header>

      <section className={styles.card} data-brief-section="next">
        <p className={styles.sectionLabel}>Najbliższy punkt</p>
        <p className={styles.nextTime}>{brief.nextStop.time}</p>
        <p className={styles.nextTitle}>{brief.nextStop.title}</p>
        <p className={styles.nextPlace}>{brief.nextStop.location}</p>
      </section>

      <section className={styles.block} data-brief-section="contacts">
        <p className={styles.sectionLabel}>Kontakty</p>
        <ul className={styles.contacts}>
          {brief.contacts.map((contact) => (
            <li key={contact.name}>
              <strong>{contact.name}</strong>
              <span>{contact.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block} data-brief-section="shots">
        <p className={styles.sectionLabel}>Do ujęcia</p>
        <ul className={styles.shots}>
          {brief.shotList.map((shot) => (
            <li key={shot}>{shot}</li>
          ))}
        </ul>
      </section>

      <section className={styles.note} data-brief-section="note">
        <p className={styles.sectionLabel}>Ważna informacja</p>
        <p className={styles.noteValue}>
          {brief.firstDance.label}
          <span aria-hidden> · </span>
          {brief.firstDance.time}
        </p>
      </section>

      <p className={styles.footer}>{brief.footer}</p>
    </div>
  )
}
