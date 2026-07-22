import styles from './WorkflowTimeline.module.css'

const STAGES = [
  {
    id: 'inquiry',
    label: 'Zapytanie',
    body: 'Nowe leady trafiają do skrzynki oczekujących.',
  },
  {
    id: 'offer',
    label: 'Oferta',
    body: 'Pakiet i warunki dopasowane do pary.',
  },
  {
    id: 'contract',
    label: 'Umowa',
    body: 'Ankieta umowy online, dane w karcie ślubu.',
  },
  {
    id: 'deposit',
    label: 'Zaliczka',
    body: 'Status płatności i pozostałe saldo.',
  },
  {
    id: 'survey',
    label: 'Ankieta',
    body: 'Szczegóły dnia, lokalizacje i preferencje.',
  },
  {
    id: 'wedding',
    label: 'Ślub',
    body: 'Trasa, harmonogram i checklista w jednym miejscu.',
  },
  {
    id: 'delivery',
    label: 'Oddanie materiału',
    body: 'Selekcja i galeria powiązane ze ślubem.',
  },
  {
    id: 'done',
    label: 'Zakończone',
    body: 'Pełny lifecycle zamknięty i zarchiwizowany.',
  },
] as const

export function WorkflowTimeline() {
  return (
    <ol className={styles.track}>
      {STAGES.map((stage, index) => (
        <li key={stage.id} className={styles.stage}>
          <div className={styles.node}>
            <span className={styles.icon} aria-hidden>
              {index + 1}
            </span>
            {index < STAGES.length - 1 ? (
              <span className={styles.connector} aria-hidden />
            ) : null}
          </div>
          <div className={styles.copy}>
            <strong>{stage.label}</strong>
            <p>{stage.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
