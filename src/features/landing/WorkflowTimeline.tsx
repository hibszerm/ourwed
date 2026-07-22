import { useState } from 'react'
import styles from './WorkflowTimeline.module.css'

const STAGES = [
  {
    id: 'inquiry',
    label: 'Zapytanie',
    body: 'Lead trafia do skrzynki oczekujących.',
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
    body: 'Szczegóły dnia i preferencje pary.',
  },
  {
    id: 'plan',
    label: 'Plan dnia',
    body: 'Harmonogram, trasa i checklista.',
  },
  {
    id: 'day',
    label: 'Realizacja',
    body: 'Ślub pod kontrolą — wszystko pod ręką.',
  },
  {
    id: 'gallery',
    label: 'Galeria',
    body: 'Selekcja i oddanie materiału.',
  },
  {
    id: 'done',
    label: 'Gotowe',
    body: 'Ślub zamknięty i zarchiwizowany.',
  },
] as const

export function WorkflowTimeline() {
  const [active, setActive] = useState(0)

  return (
    <ol className={styles.track}>
      {STAGES.map((stage, index) => (
        <li
          key={stage.id}
          className={`${styles.stage} ${active === index ? styles.stageActive : ''}`}
          onMouseEnter={() => setActive(index)}
          onFocus={() => setActive(index)}
        >
          <button
            type="button"
            className={styles.stageButton}
            onClick={() => setActive(index)}
            aria-current={active === index ? 'step' : undefined}
          >
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
          </button>
        </li>
      ))}
    </ol>
  )
}
