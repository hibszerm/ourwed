import {
  getMobileItineraryRows,
  mobileWeddingDayDemo,
} from '@/features/landing-v3/data/mobileWeddingDayDemo'
import styles from './MobileItineraryView.module.css'

/** Static secondary-phone itinerary — never animated. */
export function MobileItineraryView() {
  const demo = mobileWeddingDayDemo
  const rows = getMobileItineraryRows()

  return (
    <div
      className={styles.view}
      data-mobile-screen="itinerary"
      data-screen-layer="itinerary"
    >
      <header className={styles.head}>
        <p className={styles.eyebrow}>Plan dnia</p>
        <h3 className={styles.title}>{demo.couple}</h3>
        <p className={styles.meta}>{demo.date}</p>
      </header>

      <ol className={styles.list}>
        {rows.map((stop) => (
          <li key={stop.id} className={styles.item}>
            {stop.travel ? (
              <p className={styles.travel}>{stop.travel}</p>
            ) : null}
            <div
              className={styles.card}
              data-current={stop.current ? 'true' : 'false'}
            >
              <span className={styles.time}>{stop.time}</span>
              <div className={styles.body}>
                <strong>{stop.title}</strong>
                <span>{stop.place}</span>
              </div>
              {stop.current ? (
                <span className={styles.marker} aria-hidden />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
