import { LoaderCircle } from 'lucide-react'
import styles from './RecoveryProgressPanel.module.css'

const STATUS = [
  'Przygotowujemy dokument do odczytu…',
  'Wczytujemy dokument…',
  'Odczytujemy dane i porównujemy je ze zleceniem…',
  'Przygotowujemy zmiany do sprawdzenia…',
]

export function RecoveryProgressPanel({
  activeIndex,
  error,
}: {
  activeIndex: number
  error?: string | null
}) {
  const status = STATUS[Math.min(Math.max(activeIndex, 0), STATUS.length - 1)]

  return (
    <section className={styles.wrap} aria-busy={!error} aria-label="Analiza umowy">
      <span className={styles.loader} aria-hidden="true">
        {error ? <span className={styles.loaderMark}>!</span> : <LoaderCircle size={24} />}
      </span>
      <p className={styles.eyebrow}>Umowa źródłowa</p>
      <h2 className={styles.heading}>{error ? 'Nie udało się przeanalizować umowy' : 'Analizujemy umowę'}</h2>
      <p className={styles.status} aria-live="polite" aria-atomic="true">{error ?? status}</p>
      {!error ? <p className={styles.note}>Sprawdź propozycje przed zapisaniem. Nic nie zmieni się bez Twojego potwierdzenia.</p> : null}
    </section>
  )
}
