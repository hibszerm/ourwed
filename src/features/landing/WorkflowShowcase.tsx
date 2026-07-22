import { useState } from 'react'
import styles from './WorkflowShowcase.module.css'

const STEPS = [
  {
    id: 'inquiry',
    label: 'Zapytanie',
    title: 'Nowe zapytanie od pary',
    body: 'Lead pojawia się w skrzynce oczekujących z datą, lokalizacją i pakietem zainteresowania.',
    detail: [
      { label: 'Para', value: 'Anna & Michał' },
      { label: 'Data', value: '15 sie 2026' },
      { label: 'Status', value: 'Nowe' },
    ],
  },
  {
    id: 'contract',
    label: 'Umowa',
    title: 'Umowa wysłana online',
    body: 'Para uzupełnia ankietę umowy. Dane trafiają od razu do karty ślubu.',
    detail: [
      { label: 'Formularz', value: 'Umowa produkcyjna' },
      { label: 'Postęp', value: '68%' },
      { label: 'Status', value: 'Wysłana' },
    ],
  },
  {
    id: 'deposit',
    label: 'Zaliczka',
    title: 'Zaliczka zaksięgowana',
    body: 'Widzisz kwotę, termin i pozostałe saldo — bez ręcznego śledzenia w Excelu.',
    detail: [
      { label: 'Pakiet', value: 'Premium · 9 500 zł' },
      { label: 'Zaliczka', value: '3 000 zł' },
      { label: 'Pozostało', value: '6 500 zł' },
    ],
  },
  {
    id: 'survey',
    label: 'Ankieta',
    title: 'Szczegóły dnia zebrane',
    body: 'Timeline, lokalizacje i preferencje pary — komplet przed wyjazdem.',
    detail: [
      { label: 'Ankieta', value: 'Szczegóły ślubu' },
      { label: 'Ukończenie', value: '100%' },
      { label: 'Status', value: 'Gotowe' },
    ],
  },
  {
    id: 'wedding',
    label: 'Ślub',
    title: 'Dzień ślubu pod kontrolą',
    body: 'Trasa, harmonogram i checklista sprzętu w jednym miejscu na telefonie.',
    detail: [
      { label: 'Start', value: '09:30 przygotowania' },
      { label: 'Ceremonia', value: '13:00' },
      { label: 'Trasa', value: '3 przystanki' },
    ],
  },
  {
    id: 'selection',
    label: 'Selekcja',
    title: 'Selekcja zdjęć w toku',
    body: 'Status selekcji i deadline są przy ślubie — nic nie ginie w mailach.',
    detail: [
      { label: 'Zdjęcia', value: '420 roboczych' },
      { label: 'Selekcja', value: 'W trakcie' },
      { label: 'Termin', value: '5 wrz' },
    ],
  },
  {
    id: 'gallery',
    label: 'Galeria',
    title: 'Galeria gotowa do oddania',
    body: 'Finalny materiał, link i potwierdzenie odbioru — domknięty etap.',
    detail: [
      { label: 'Galeria', value: 'Online' },
      { label: 'Zdjęcia', value: '180 finalnych' },
      { label: 'Status', value: 'Wysłana' },
    ],
  },
  {
    id: 'done',
    label: 'Zakończenie',
    title: 'Ślub zamknięty',
    body: 'Cały lifecycle od zapytania do galerii zarchiwizowany w jednym miejscu.',
    detail: [
      { label: 'Workflow', value: '100%' },
      { label: 'Płatności', value: 'Opłacone' },
      { label: 'Status', value: 'Zakończony' },
    ],
  },
] as const

type StepId = (typeof STEPS)[number]['id']

export function WorkflowShowcase() {
  const [active, setActive] = useState<StepId>('inquiry')
  const [animKey, setAnimKey] = useState(0)
  const step = STEPS.find((s) => s.id === active) ?? STEPS[0]

  function select(id: StepId) {
    setActive(id)
    setAnimKey((k) => k + 1)
  }

  return (
    <div className={styles.root}>
      <div className={styles.steps} role="tablist" aria-label="Etapy workflow">
        {STEPS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            className={`${styles.step} ${active === item.id ? styles.stepActive : ''}`}
            onClick={() => select(item.id)}
          >
            <span className={styles.stepIndex}>{index + 1}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </div>

      <div key={animKey} className={styles.panel} role="tabpanel">
        <p className={styles.panelEyebrow}>Etap · {step.label}</p>
        <h3 className={styles.panelTitle}>{step.title}</h3>
        <p className={styles.panelBody}>{step.body}</p>
        <div className={styles.detailGrid}>
          {step.detail.map((row) => (
            <div key={row.label} className={styles.detailCard}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
