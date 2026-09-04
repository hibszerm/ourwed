import { IconCheck } from '@/components/icons'
import styles from './LandingV2FeaturesGrid.module.css'

/** Product Atlas v4 — one dominant object per module (Umowy = reference). */

const FIN_LEDGER = [
  { date: '14 SIE', who: 'Karolina i Jan', kind: 'Zadatek', amt: '+2 500 zł' },
  { date: '03 SIE', who: 'Marta i Kuba', kind: 'II rata', amt: '+3 200 zł' },
  { date: '26 LIP', who: 'Julia i Maksymilian', kind: 'Zadatek', amt: '+2 500 zł' },
  { date: '12 LIP', who: 'Anna i Michał', kind: 'Rozszerzenie', amt: '+900 zł' },
] as const

const FIN_CHART = [
  { month: 'KWI', scale: 0.42 },
  { month: 'MAJ', scale: 0.58 },
  { month: 'CZE', scale: 0.78 },
  { month: 'LIP', scale: 0.91 },
  { month: 'SIE', scale: 1, accent: true },
  { month: 'WRZ', scale: 0.72 },
  { month: 'PAŹ', scale: 0.44 },
  { month: 'LIS', scale: 0.22 },
] as const

export function AtlasFinanse() {
  return (
    <div className={styles.financeInstrument} data-mini="finanse">
      <div className={styles.financeSeasonHead}>
        <span className={styles.financeSeasonLabel}>Sezon 2027</span>
        <span className={styles.financeSeasonAmt}>82 100 zł</span>
        <span className={styles.financeSeasonSub}>Przychód sezonu</span>
      </div>

      <div className={styles.financeStage}>
        <div className={styles.financeLedger} aria-label="Ostatnie wpłaty">
          {FIN_LEDGER.map((row) => (
            <div key={`${row.date}-${row.who}`} className={styles.financeLedgerRow}>
              <span className={styles.financeLedgerDate}>{row.date}</span>
              <span className={styles.financeLedgerWho}>{row.who}</span>
              <span className={styles.financeLedgerKind}>{row.kind}</span>
              <span className={styles.financeLedgerAmt}>{row.amt}</span>
            </div>
          ))}
        </div>

        <div className={styles.financeChart} aria-hidden>
          <div className={styles.financeChartPlot}>
            {FIN_CHART.map((col) => (
              <div key={col.month} className={styles.financeBarCol}>
                <div className={styles.financeBarTrack}>
                  <span
                    className={`${styles.financeBar}${'accent' in col ? ` ${styles.financeBarAccent}` : ''}`}
                    style={{ ['--bar-scale' as string]: col.scale }}
                  />
                </div>
                <span
                  className={`${styles.financeMonth}${'accent' in col ? ` ${styles.financeMonthAccent}` : ''}`}
                >
                  {col.month}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.financeFootRest}>
        <div className={styles.financeFootRow}>
          <span>Wpłacono</span>
          <span>28 900 zł</span>
        </div>
        <div className={styles.financeFootRow}>
          <span>Do rozliczenia</span>
          <span>53 200 zł</span>
        </div>
      </div>
    </div>
  )
}

export function AtlasPowiadomienia() {
  return (
    <div className={styles.sceneNotifs} data-mini="powiadomienia">
      <div className={styles.objSurface}>
        <div className={styles.inboxHead}>
          <span className={styles.inboxTitle}>Powiadomienia</span>
          <span className={styles.inboxCount}>
            <span className={styles.inboxCountRest}>2 nowe</span>
            <span className={styles.inboxCountHover}>3 nowe</span>
          </span>
        </div>
        <div className={styles.inboxInstrument}>
          <div className={styles.inboxFeed}>
            <article className={`${styles.inboxItem} ${styles.inboxItemRest}`}>
              <span className={styles.inboxDot} aria-hidden />
              <div>
                <span className={styles.inboxCat}>Ankieta</span>
                <strong>Karolina i Jan</strong>
                <p>Ankieta przedślubna została wypełniona</p>
                <time>27.08.2027</time>
              </div>
            </article>
            <article className={`${styles.inboxItem} ${styles.inboxItemRest}`}>
              <span className={styles.inboxDot} aria-hidden />
              <div>
                <span className={styles.inboxCat}>Płatność</span>
                <strong>Marta i Kuba</strong>
                <p>Termin płatności za 7 dni</p>
                <time>26.08.2027</time>
              </div>
            </article>
            <article className={`${styles.inboxItem} ${styles.inboxItemEnter}`}>
              <span className={styles.inboxDot} aria-hidden />
              <div>
                <span className={styles.inboxCat}>Umowa</span>
                <strong>Julia i Maksymilian</strong>
                <p>Umowa została podpisana</p>
                <time>28.08.2027</time>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AtlasZadania() {
  return (
    <div className={styles.sceneTasks} data-mini="zadania">
      <div className={styles.objSurface}>
        <div className={styles.taskPanelHead}>
          <span className={styles.objKicker}>Dzisiaj</span>
          <span className={styles.taskPanelCount}>
            <span className={styles.taskCountRest}>4 zadania</span>
          </span>
        </div>
        <ul className={styles.taskStack}>
          <li className={`${styles.taskItem} ${styles.taskDone}`}>
            <span className={styles.taskMark} aria-hidden>
              <span className={styles.taskMarkRing} />
              <IconCheck className={styles.taskMarkIcon} width={13} height={13} />
            </span>
            <div>
              <span className={styles.taskTitle}>Wyślij ankietę</span>
              <span className={styles.taskCtx}>Karolina i Jan</span>
            </div>
          </li>
          <li className={styles.taskItem}>
            <span className={styles.taskMark} aria-hidden>
              <span className={styles.taskMarkRing} />
              <IconCheck className={styles.taskMarkIcon} width={13} height={13} />
            </span>
            <div>
              <span className={styles.taskTitle}>Potwierdź harmonogram</span>
              <span className={styles.taskCtx}>Karolina i Jan</span>
              <span className={styles.taskDue}>18:00</span>
            </div>
          </li>
          <li className={styles.taskItem}>
            <span className={styles.taskMark} aria-hidden>
              <span className={styles.taskMarkRing} />
              <IconCheck className={styles.taskMarkIcon} width={13} height={13} />
            </span>
            <div>
              <span className={styles.taskTitle}>Przygotuj sprzęt</span>
              <span className={styles.taskCtx}>Marta i Kuba</span>
              <span className={styles.taskDue}>jutro</span>
            </div>
          </li>
          <li className={styles.taskItem}>
            <span className={styles.taskMark} aria-hidden>
              <span className={styles.taskMarkRing} />
              <IconCheck className={styles.taskMarkIcon} width={13} height={13} />
            </span>
            <div>
              <span className={styles.taskTitle}>Wyślij teaser</span>
              <span className={styles.taskCtx}>Julia i Maksymilian</span>
              <span className={styles.taskDue}>+3 dni</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  )
}

/** Approved reference module — do not redesign. */
export function AtlasUmowy() {
  return (
    <div className={styles.sceneUmowy} data-mini="umowy">
      <div className={styles.umowySplit}>
        <div className={styles.umowySource}>
          <span className={styles.sceneEyebrow}>Szablon</span>
          <p className={styles.umowyTemplate}>Reportaż Signature</p>
          <dl className={styles.umowyVars}>
            <div className={`${styles.umowyVar} ${styles.umowyVar1}`}>
              <dt>Para</dt>
              <dd>Karolina i Jan</dd>
            </div>
            <div className={`${styles.umowyVar} ${styles.umowyVar2}`}>
              <dt>Data</dt>
              <dd>14.08.2027</dd>
            </div>
            <div className={`${styles.umowyVar} ${styles.umowyVar3}`}>
              <dt>Pakiet</dt>
              <dd>Reportaż Signature</dd>
            </div>
            <div className={`${styles.umowyVar} ${styles.umowyVar4}`}>
              <dt>Wartość</dt>
              <dd>10 900 zł</dd>
            </div>
            <div className={`${styles.umowyVar} ${styles.umowyVar5}`}>
              <dt>Miejsce</dt>
              <dd>Warszawa</dd>
            </div>
            <div className={`${styles.umowyVar} ${styles.umowyVar6}`}>
              <dt>Zaliczka</dt>
              <dd>2 500 zł</dd>
            </div>
          </dl>
        </div>
        <div className={styles.umowyDoc}>
          <div className={styles.umowyDocPage}>
            <header className={styles.umowyDocHeader}>
              <span className={styles.umowyDocHeaderSkel} aria-hidden />
              <p className={styles.umowyDocHeading}>UMOWA</p>
              <span className={`${styles.umowySkel} ${styles.umowySkelW55}`} aria-hidden />
            </header>
            <div className={styles.umowyDocIntro} aria-hidden>
              <span className={`${styles.umowySkel} ${styles.umowySkelW100}`} />
              <span className={`${styles.umowySkel} ${styles.umowySkelW72}`} />
              <span className={`${styles.umowySkel} ${styles.umowySkelW88}`} />
            </div>
            <section className={styles.umowyDocSection}>
              <span className={styles.umowySectionMark}>§ 1</span>
              <div className={`${styles.umowyDocLine} ${styles.umowyDocLine1}`}>
                <span className={`${styles.umowySkel} ${styles.umowySkelW90}`} aria-hidden />
                <span className={styles.umowyResolved}>Karolina i Jan</span>
              </div>
              <div className={`${styles.umowyDocLine} ${styles.umowyDocLine2}`}>
                <span className={`${styles.umowySkel} ${styles.umowySkelW72}`} aria-hidden />
                <span className={styles.umowyResolved}>14.08.2027</span>
              </div>
              <div className={`${styles.umowyDocLine} ${styles.umowyDocLine3}`}>
                <span className={`${styles.umowySkel} ${styles.umowySkelW84}`} aria-hidden />
                <span className={styles.umowyResolved}>Reportaż Signature</span>
              </div>
              <div className={`${styles.umowyDocLine} ${styles.umowyDocLine4}`}>
                <span className={`${styles.umowySkel} ${styles.umowySkelW58}`} aria-hidden />
                <span className={styles.umowyResolved}>10 900 zł</span>
              </div>
            </section>
            <section className={`${styles.umowyDocSection} ${styles.umowyDocSection2}`}>
              <span className={styles.umowySectionMark}>§ 2</span>
              <div className={`${styles.umowyDocLine} ${styles.umowyDocLine5}`}>
                <span className={`${styles.umowySkel} ${styles.umowySkelW90}`} aria-hidden />
                <span className={styles.umowyResolved}>Warszawa</span>
              </div>
              <div className={`${styles.umowyDocLine} ${styles.umowyDocLine6}`}>
                <span className={`${styles.umowySkel} ${styles.umowySkelW76}`} aria-hidden />
                <span className={styles.umowyResolved}>Zaliczka 2 500 zł</span>
              </div>
              <div className={styles.umowyDocLine}>
                <span className={`${styles.umowySkel} ${styles.umowySkelW64}`} aria-hidden />
              </div>
            </section>
            <footer className={styles.umowyDocSign}>
              <div className={styles.umowySignCol}>
                <span className={styles.umowySignLine} aria-hidden />
                <span className={styles.umowySignLabel}>Zamawiający</span>
              </div>
              <div className={styles.umowySignCol}>
                <span className={styles.umowySignLine} aria-hidden />
                <span className={styles.umowySignLabel}>Wykonawca</span>
              </div>
            </footer>
          </div>
        </div>
      </div>
      <div className={styles.umowyStatus}>
        <span className={styles.umowyStatusRest}>Gotowa do wygenerowania</span>
        <span className={styles.umowyStatusHover}>Umowa wygenerowana</span>
      </div>
    </div>
  )
}

export function AtlasPakiety() {
  return (
    <div className={styles.scenePakiety} data-mini="pakiety">
      <div className={styles.pkgInstrument}>
        <div className={styles.pkgStack}>
          <article className={styles.pkgRow}>
            <div className={styles.pkgRowMain}>
              <span className={styles.pkgName}>Podstawowy</span>
              <span className={styles.pkgPrice}>7 900 zł</span>
            </div>
            <ul className={styles.pkgDetails}>
              <li className={`${styles.pkgDetailLine} ${styles.pkgDetailR1}`}>250 zdjęć</li>
              <li className={`${styles.pkgDetailLine} ${styles.pkgDetailR2}`}>Album</li>
              <li className={`${styles.pkgDetailLine} ${styles.pkgDetailR3}`}>Sesja w dniu ślubu</li>
            </ul>
          </article>

          <article className={styles.pkgRow}>
            <div className={styles.pkgRowMain}>
              <span className={styles.pkgName}>Standard</span>
              <span className={styles.pkgPrice}>10 900 zł</span>
            </div>
            <ul className={styles.pkgDetails}>
              <li className={`${styles.pkgDetailLine} ${styles.pkgDetailR1}`}>500 zdjęć</li>
              <li className={`${styles.pkgDetailLine} ${styles.pkgDetailR2}`}>Album</li>
              <li className={`${styles.pkgDetailLine} ${styles.pkgDetailR3}`}>Sesja w innym dniu</li>
            </ul>
          </article>

          <article className={styles.pkgRow}>
            <div className={styles.pkgRowMain}>
              <span className={styles.pkgName}>Premium</span>
              <span className={styles.pkgPrice}>14 900 zł</span>
            </div>
            <ul className={styles.pkgDetails}>
              <li className={`${styles.pkgDetailLine} ${styles.pkgDetailR1}`}>600 zdjęć</li>
              <li className={`${styles.pkgDetailLine} ${styles.pkgDetailR2}`}>Film 15 minut</li>
              <li className={`${styles.pkgDetailLine} ${styles.pkgDetailR3}`}>Sesja w innym dniu</li>
            </ul>
          </article>
        </div>
      </div>
    </div>
  )
}

export function AtlasSluby() {
  const stages = ['Rezerwacja', 'Dane', 'Umowa', 'Przygotowania', 'Realizacja'] as const
  return (
    <div className={styles.sceneSluby} data-mini="sluby">
      <div className={styles.objSurface}>
        <div className={styles.jobCardTop}>
          <div className={styles.jobDateCol}>
            <span className={styles.jobDay}>14</span>
            <span className={styles.jobMon}>SIE</span>
            <span className={styles.jobYear}>2027</span>
          </div>
          <div className={styles.jobMain}>
            <p className={styles.jobCouple}>Karolina i Jan</p>
            <p className={styles.jobLine}>Reportaż Signature</p>
            <p className={styles.jobLine}>Warszawa</p>
          </div>
        </div>
        <div className={styles.jobStates}>
          <span><em>Umowa</em> Podpisana</span>
          <span><em>Zadatek</em> Opłacony</span>
          <span><em>Ankieta</em> Wypełniona</span>
        </div>
        <div className={styles.jobStageBlock}>
          <span className={styles.objKicker}>Następny etap</span>
          <span className={styles.jobStageRest}>Umowa</span>
          <span className={styles.jobStageHover}>Przygotowania</span>
        </div>
        <div className={styles.jobSteps} aria-hidden>
          {stages.map((s, i) => (
            <span
              key={s}
              className={
                i < 2
                  ? `${styles.jobStep} ${styles.jobStepDone}`
                  : i === 2
                    ? `${styles.jobStep} ${styles.jobStepActive}`
                    : i === 3
                      ? `${styles.jobStep} ${styles.jobStepNext}`
                      : styles.jobStep
              }
            >
              {s}
            </span>
          ))}
        </div>
        <div className={styles.jobNextAction}>
          <span className={styles.jobNextRest} />
          <span className={styles.jobNextHover}>Wyślij ankietę przedślubną</span>
        </div>
      </div>
    </div>
  )
}

export function AtlasSesje() {
  const timelineLabels = [
    { time: '17:00', left: '0%' },
    { time: '17:30', left: '20%' },
    { time: '18:00', left: '40%' },
    { time: '18:30', left: '60%' },
    { time: '19:00', left: '80%' },
    { time: '19:30', left: '100%' },
  ] as const

  return (
    <div className={styles.sceneSesje} data-mini="sesje">
      <div className={styles.objSurface}>
        <span className={styles.objKicker}>Sesja narzeczeńska</span>
        <p className={styles.sesCouple}>Karolina i Jan</p>
        <p className={styles.sesWhen}>12 września 2027</p>
        <dl className={styles.sesLogistics}>
          <div>
            <dt>Miejsce</dt>
            <dd>Park Cytadela — Poznań</dd>
          </div>
          <div>
            <dt>Czas</dt>
            <dd className={styles.sesTimeSlot}>
              <span className={styles.sesTimeRest}>17:30–18:30</span>
              <span className={styles.sesTimeHover}>18:00–19:00</span>
            </dd>
          </div>
          <div>
            <dt>Zachód słońca</dt>
            <dd>19:11</dd>
          </div>
        </dl>
        <div className={styles.sesTimelineInstrument} aria-hidden>
          <div className={styles.sesTimelineLabels}>
            {timelineLabels.map(({ time, left }) => (
              <span key={time} className={styles.sesTimelineLabel} style={{ left }}>
                {time}
              </span>
            ))}
          </div>
          <div className={styles.sesTimeline}>
            <div className={styles.sesTimelineBaseline} />
            <div className={styles.sesGoldenHour}>
              <span className={styles.sesGoldenLabel}>Złota godzina</span>
            </div>
            <div className={styles.sesSunsetMarker}>
              <span className={styles.sesSunsetLabel}>Zachód 19:11</span>
            </div>
            <div className={`${styles.sesSessionBlock} ${styles.sesSessionRest}`}>
              <span className={styles.sesSessionBlockLabel}>Sesja</span>
            </div>
            <div className={`${styles.sesSessionBlock} ${styles.sesSessionHover}`}>
              <span className={styles.sesSessionBlockLabel}>Sesja</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AtlasKalendarz() {
  const weekdays = ['PON', 'WT', 'ŚR', 'CZW', 'PT', 'SOB', 'ND'] as const
  const augustDays = [9, 10, 11, 12, 13, 14, 15]
  const septemberDays = [13, 14, 15, 16, 17, 18, 19]

  type CalEventData = {
    time?: string
    tag?: string
    title: string
    subtitle: string
    major?: boolean
    stagger: string
  }

  const augustEvents: Array<CalEventData | null> = [
    { time: '11:00', title: 'Spotkanie', subtitle: 'Anna i Michał', stagger: 'calAugEv1' },
    null,
    { time: '18:30', title: 'Sesja', subtitle: 'Marta i Kuba', stagger: 'calAugEv2' },
    null,
    { time: '16:00', title: 'Spotkanie', subtitle: 'Julia i Maksymilian', stagger: 'calAugEv3' },
    { tag: 'ŚLUB', title: 'Karolina i Jan', subtitle: 'Warszawa', major: true, stagger: 'calAugEv4' },
    null,
  ]

  const septemberEvents: Array<CalEventData | null> = [
    null,
    { time: '17:30', title: 'Sesja narzeczeńska', subtitle: 'Karolina i Jan', stagger: 'calSepEv1' },
    null,
    { time: '18:00', title: 'Spotkanie', subtitle: 'Marta i Kuba', stagger: 'calSepEv2' },
    null,
    { tag: 'ŚLUB', title: 'Julia i Maksymilian', subtitle: 'Poznań', major: true, stagger: 'calSepEv3' },
    { time: '16:30', title: 'Sesja', subtitle: 'Anna i Michał', stagger: 'calSepEv4' },
  ]

  const staggerClass = (stagger: string) => {
    switch (stagger) {
      case 'calAugEv1':
        return styles.calAugEv1
      case 'calAugEv2':
        return styles.calAugEv2
      case 'calAugEv3':
        return styles.calAugEv3
      case 'calAugEv4':
        return styles.calAugEv4
      case 'calSepEv1':
        return styles.calSepEv1
      case 'calSepEv2':
        return styles.calSepEv2
      case 'calSepEv3':
        return styles.calSepEv3
      case 'calSepEv4':
        return styles.calSepEv4
      default:
        return ''
    }
  }

  const renderEvent = (event: CalEventData, layerClass: string) => (
    <div
      className={`${styles.calEventBlock} ${layerClass} ${staggerClass(event.stagger)} ${event.major ? styles.calEventMajor : ''}`}
    >
      {event.tag ? (
        <span className={styles.calEventTag}>{event.tag}</span>
      ) : (
        <span className={styles.calEventTime}>{event.time}</span>
      )}
      <strong>{event.title}</strong>
      <span>{event.subtitle}</span>
    </div>
  )

  return (
    <div className={styles.sceneKalendarz} data-mini="kalendarz">
      <div className={styles.objSurface}>
        <div className={styles.calHeadSlot}>
          <div className={`${styles.calHeadLayer} ${styles.calHeadAug}`}>
            <span className={styles.calPanelTitle}>Sierpień 2027</span>
            <span className={styles.calPanelRange}>09–15 sierpnia</span>
          </div>
          <div className={`${styles.calHeadLayer} ${styles.calHeadSep}`}>
            <span className={styles.calPanelTitle}>Wrzesień 2027</span>
            <span className={styles.calPanelRange}>13–19 września</span>
          </div>
        </div>
        <div className={styles.calWeek} aria-hidden>
          {weekdays.map((wd, i) => (
            <div key={wd} className={styles.calDayCol}>
              <span className={styles.calDayWd}>{wd}</span>
              <div className={styles.calDayNumSlot}>
                <span className={`${styles.calDayNum} ${styles.calDayNumAug}`}>{augustDays[i]}</span>
                <span className={`${styles.calDayNum} ${styles.calDayNumSep}`}>{septemberDays[i]}</span>
              </div>
              <div className={styles.calEventSlot}>
                {augustEvents[i] && renderEvent(augustEvents[i]!, styles.calEventAug)}
                {septemberEvents[i] && renderEvent(septemberEvents[i]!, styles.calEventSep)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AtlasAnkiety() {
  return (
    <div className={styles.sceneAnkiety} data-mini="ankiety">
      <div className={styles.objSurface}>
        <div className={styles.formHead}>
          <div>
            <span className={styles.objKicker}>Ankieta przedślubna</span>
            <p className={styles.formCouple}>Karolina i Jan</p>
          </div>
          <span className={styles.formProgress}>
            <span className={styles.formProgRest}>12 / 14 odpowiedzi</span>
            <span className={styles.formProgHover}>14 / 14 odpowiedzi</span>
          </span>
        </div>
        <div className={styles.formInstrument}>
          <div className={styles.formGroups}>
            <section className={styles.formGroup}>
              <p className={styles.formGroupLabel}>Podstawowe</p>
              <p>120 gości</p>
              <p>15:00 ceremonia</p>
              <p>19:30 pierwszy taniec</p>
            </section>
            <section className={styles.formGroup}>
              <p className={styles.formGroupLabel}>Miejsca</p>
              <p>Hotel Bristol</p>
              <p>Kościół Świętego Krzyża</p>
              <p>The Bridge</p>
            </section>
            <section className={styles.formGroup}>
              <p className={styles.formGroupLabel}>Zależy im na</p>
              <p>Naturalnych emocjach</p>
              <p>Rodzinie i bliskich</p>
              <p>Krótkiej sesji po ceremonii</p>
            </section>
          </div>
          <div className={styles.formSecondaryZone}>
            <p className={styles.formMissingRest}>2 odpowiedzi brakują</p>
            <div className={styles.formFinalRow}>
              <section className={`${styles.formAnswerSlot} ${styles.formAnswerSlot1}`}>
                <div className={styles.formAnswerSlotInner}>
                  <p className={styles.formGroupLabel}>Sesja w dniu ślubu</p>
                  <p>Tak</p>
                </div>
              </section>
              <section className={`${styles.formAnswerSlot} ${styles.formAnswerSlot2}`}>
                <div className={styles.formAnswerSlotInner}>
                  <p className={styles.formGroupLabel}>Ważne momenty</p>
                  <p>Rodzice · pierwszy taniec · podziękowania</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const MiniFinanse = AtlasFinanse
export const MiniPowiadomienia = AtlasPowiadomienia
export const MiniZadania = AtlasZadania
export const MiniUmowy = AtlasUmowy
export const MiniPakiety = AtlasPakiety
export const MiniSluby = AtlasSluby
export const MiniSesje = AtlasSesje
export const MiniKalendarz = AtlasKalendarz
export const MiniAnkiety = AtlasAnkiety
