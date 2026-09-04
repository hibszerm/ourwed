import styles from './WorkflowFeatureVisuals.module.css'

type ActiveProps = { active: boolean }

export function ContractFeatureVisual({ active }: ActiveProps) {
  return (
    <div
      className={[styles.visual, active ? styles.visualActive : ''].join(' ')}
      data-wf-visual="contract"
      aria-hidden
    >
      <div className={styles.flowRow}>
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Dane z ankiety</p>
          <p className={styles.cardTitle}>Karolina Nowak</p>
          <p className={styles.cardMeta}>14 sierpnia 2027</p>
          <p className={styles.cardMeta}>Reportaż Premium</p>
          <p className={styles.cardStrong}>12 900 zł</p>
        </div>
        <span className={styles.arrow} aria-hidden>
          →
        </span>
        <div className={[styles.card, styles.cardAction].join(' ')}>
          <p className={styles.cardEyebrow}>Dokument</p>
          <p className={styles.cardTitle}>Umowa gotowa</p>
          <span className={styles.fakeBtn}>Wygeneruj umowę</span>
        </div>
        <span className={styles.arrow} aria-hidden>
          →
        </span>
        <div className={styles.docStack}>
          <div className={styles.docSheet}>
            <p className={styles.docTitle}>UMOWA O ŚWIADCZENIE USŁUG</p>
            <p className={styles.cardMeta}>Karolina Nowak i Jan Kowalski</p>
            <p className={styles.cardMeta}>Reportaż Premium</p>
            <p className={styles.cardStrong}>12 900 zł</p>
            <span className={styles.badge}>Gotowa</span>
          </div>
          <div className={styles.docGhost} />
          <div className={styles.docGhost2} />
        </div>
      </div>
    </div>
  )
}

export function PaymentsFeatureVisual({ active }: ActiveProps) {
  return (
    <div
      className={[styles.visual, active ? styles.visualActive : ''].join(' ')}
      data-wf-visual="payments"
      aria-hidden
    >
      <div className={styles.ledger}>
        <div className={styles.ledgerTop}>
          <span>Wartość zlecenia</span>
          <strong>12 900 zł</strong>
        </div>
        <div className={styles.equation}>
          <p>12 900 zł</p>
          <p>− 2 000 zł Zaliczka</p>
          <p>− 4 000 zł II wpłata</p>
          <hr />
          <p className={styles.remain}>
            <strong>6 900 zł</strong> pozostało
          </p>
        </div>
        <ul className={styles.payTimeline}>
          <li data-paid="">
            <span>✓ Zaliczka</span>
            <span>2 000 zł</span>
          </li>
          <li data-paid="">
            <span>✓ II wpłata</span>
            <span>4 000 zł</span>
          </li>
          <li>
            <span>○ Pozostało</span>
            <span>6 900 zł</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

export function QuestionnairesFeatureVisual({ active }: ActiveProps) {
  return (
    <div
      className={[styles.visual, active ? styles.visualActive : ''].join(' ')}
      data-wf-visual="questionnaires"
      aria-hidden
    >
      <div className={styles.flowSplit}>
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Odpowiedzi</p>
          <p className={styles.cardTitle}>Julia Nowak</p>
          <p className={styles.cardMeta}>15:00 Ceremonia</p>
          <p className={styles.cardMeta}>Kościół Piotra i Pawła</p>
          <p className={styles.cardMeta}>Zdjęcie grupowe pod kościołem</p>
        </div>
        <div className={styles.paths}>
          <span className={styles.pathLine} />
          <div className={styles.pathTargets}>
            <span>UMOWA</span>
            <span>PLAN DNIA</span>
            <span>WEDDING DAY</span>
            <span>BRIEF</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DayPlanFeatureVisual({ active }: ActiveProps) {
  const rows = [
    ['11:00', 'Przygotowania Julii', 'Hotel Stary · Kraków'],
    ['11:30', 'Przygotowania Maksymiliana', 'Hotel Saski · Kraków'],
    ['15:00', 'Ceremonia', 'Kościół Piotra i Pawła · Kraków'],
    ['17:30', 'Przyjęcie', 'Villa Love · Izdebnik'],
  ] as const
  return (
    <div
      className={[styles.visual, active ? styles.visualActive : ''].join(' ')}
      data-wf-visual="day-plan"
      aria-hidden
    >
      <ol className={styles.timeline}>
        {rows.map(([time, title, place]) => (
          <li key={time}>
            <span className={styles.time}>{time}</span>
            <div>
              <p className={styles.cardTitle}>{title}</p>
              <p className={styles.cardMeta}>{place}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function TasksFeatureVisual({ active }: ActiveProps) {
  return (
    <div
      className={[styles.visual, active ? styles.visualActive : ''].join(' ')}
      data-wf-visual="tasks"
      aria-hidden
    >
      <ul className={styles.taskStack}>
        <li data-done="">✓ Wyślij ankietę do umowy</li>
        <li data-done="">✓ Przygotuj umowę</li>
        <li>
          <span>○ Potwierdź zaliczkę</span>
          <span className={styles.due}>20 sierpnia</span>
        </li>
        <li>
          <span>○ Wyślij ankietę przedślubną</span>
          <span className={styles.due}>22 maja</span>
        </li>
        <li data-soon="">
          <span>○ Przygotuj teaser</span>
          <span className={styles.due}>do 19 czerwca</span>
        </li>
      </ul>
    </div>
  )
}

export function CalendarFeatureVisual({ active }: ActiveProps) {
  const entries = [
    ['12', 'Julia i Maksymilian', 'Ślub'],
    ['19', 'Zuzanna i Kamil', 'Ślub'],
    ['22', 'Ankieta przedślubna', 'Julia i Maksymilian'],
    ['26', 'Sesja', 'Oliwia i Jan'],
  ] as const
  return (
    <div
      className={[styles.visual, active ? styles.visualActive : ''].join(' ')}
      data-wf-visual="calendar"
      aria-hidden
    >
      <div className={styles.calGrid}>
        {entries.map(([day, title, kind]) => (
          <div key={day} className={styles.calCell}>
            <span className={styles.calDay}>{day}</span>
            <p className={styles.cardTitle}>{title}</p>
            <p className={styles.cardMeta}>{kind}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LogisticsFeatureVisual({ active }: ActiveProps) {
  const nodes = [
    ['START', 'Studio', null],
    ['12 km', 'Przygotowania', 'Hotel Stary'],
    ['6,1 km', 'Ceremonia', 'Kościół Piotra i Pawła'],
    ['23 km', 'Przyjęcie', 'Villa Love'],
  ] as const
  return (
    <div
      className={[styles.visual, active ? styles.visualActive : ''].join(' ')}
      data-wf-visual="logistics"
      aria-hidden
    >
      <div className={styles.route}>
        {nodes.map(([label, title, place], i) => (
          <div key={title} className={styles.routeNode}>
            {i > 0 ? <span className={styles.routeDist}>{label}</span> : null}
            <div className={styles.card}>
              {i === 0 ? <p className={styles.cardEyebrow}>{label}</p> : null}
              <p className={styles.cardTitle}>{title}</p>
              {place ? <p className={styles.cardMeta}>{place}</p> : null}
            </div>
          </div>
        ))}
        <div className={styles.routeSummary}>
          <span>
            Łącznie <strong>82 km</strong>
          </span>
          <span>Dojazd ustalony</span>
        </div>
      </div>
    </div>
  )
}

export function ExecutionFeatureVisual({ active }: ActiveProps) {
  return (
    <div
      className={[styles.visual, active ? styles.visualActive : ''].join(' ')}
      data-wf-visual="execution"
      aria-hidden
    >
      <div className={styles.opsStack}>
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Teraz</p>
          <p className={styles.cardTitle}>15:00 · Ceremonia</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Następnie</p>
          <p className={styles.cardTitle}>17:30 · Przyjęcie</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Nie przegap</p>
          <p className={styles.cardTitle}>Zdjęcie grupowe pod kościołem</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Kontakt</p>
          <p className={styles.cardTitle}>Julia · +48 600 111 222</p>
        </div>
        <div className={styles.card}>
          <p className={styles.cardEyebrow}>Brief</p>
          <p className={styles.cardTitle}>Dostępny offline</p>
        </div>
      </div>
    </div>
  )
}

export function StudioFeatureVisual({ active }: ActiveProps) {
  return (
    <div
      className={[styles.visual, active ? styles.visualActive : ''].join(' ')}
      data-wf-visual="studio"
      aria-hidden
    >
      <div className={styles.studioMap}>
        <div className={[styles.card, styles.studioHub].join(' ')}>
          <p className={styles.cardEyebrow}>Twoje studio</p>
          <p className={styles.cardTitle}>Studio North Wedding</p>
        </div>
        <div className={styles.studioOrbit}>
          <div className={styles.card}>
            <p className={styles.cardEyebrow}>Pakiety</p>
            <p className={styles.cardMeta}>Reportaż Premium</p>
            <p className={styles.cardMeta}>Film + Foto</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardEyebrow}>Usługi</p>
            <p className={styles.cardMeta}>Teaser · VHS</p>
            <p className={styles.cardMeta}>Dodatkowa godzina</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardEyebrow}>Dokumenty</p>
            <p className={styles.cardMeta}>Szablon umowy</p>
          </div>
          <div className={styles.card}>
            <p className={styles.cardEyebrow}>Ustawienia</p>
            <p className={styles.cardMeta}>Dojazd · Dane firmy</p>
          </div>
        </div>
      </div>
    </div>
  )
}
