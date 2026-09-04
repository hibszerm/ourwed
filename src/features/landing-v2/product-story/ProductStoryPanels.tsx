import { juliaMaksymilian } from '@/features/landing-v2/narrative'
import styles from './ProductStoryPanels.module.css'

const w = juliaMaksymilian.wedding
const c = juliaMaksymilian.commercial
const pkg = juliaMaksymilian.package
const q = juliaMaksymilian.questionnaire
const legs = juliaMaksymilian.routeLegs
const totals = juliaMaksymilian.routeTotals
const mapPoints = juliaMaksymilian.mapPoints
const places = [w.places.juliaPrep, w.places.maksPrep, w.places.ceremony, w.places.reception]

/** Landing Przegląd — denser Modern overview adaptation. */
export function ProductStoryOverviewPanel() {
  return (
    <div className={styles.panel} data-chapter="overview">
      <div className={styles.overviewLayout}>
        <div className={styles.overviewMain}>
          <section className={styles.sheet}>
            <p className={styles.eyebrow}>Gotowe</p>
            <p className={styles.lead}>{w.story.title}</p>
            <p className={styles.support}>{w.story.support}</p>
          </section>

          <section className={styles.sheet}>
            <p className={styles.eyebrow}>Miejsca</p>
            <div className={styles.placeList}>
              {places.map((place) => (
                <div key={place.label} className={styles.placeRow}>
                  <span className={styles.placeTime}>{'time' in place ? place.time : '—'}</span>
                  <div className={styles.placeBody}>
                    <span className={styles.placeRole}>{place.label}</span>
                    <span className={styles.placeName}>
                      {place.place} — {place.city}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={styles.overviewSide}>
          <section className={styles.sheet}>
            <p className={styles.eyebrow}>Rozliczenie</p>
            <div className={styles.factStack}>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>Wartość umowy</span>
                <span className={styles.factValue}>{c.contractValue}</span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>Wpłacono</span>
                <span className={styles.factValue}>{c.paid}</span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>Pozostało</span>
                <span className={styles.factValueEmph}>{c.remaining}</span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>{c.paymentDueLabel}</span>
                <span className={styles.factValue}>{c.paymentDueDate}</span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>{c.travelLabel}</span>
                <span className={styles.factValue}>{c.travelAmount}</span>
              </div>
            </div>
          </section>

          <section className={styles.sheet}>
            <p className={styles.eyebrow}>Pakiet</p>
            <p className={styles.packageTitle}>{pkg.name}</p>
            <p className={styles.packageMeta}>{pkg.coverage}</p>
            <ul className={styles.packageList}>
              {pkg.contents.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className={styles.statusPair}>
              <span>
                Umowa · <strong>{w.contractStatus}</strong>
              </span>
              <span>
                Ankieta · <strong>{w.questionnaireStatus}</strong>
              </span>
            </div>
          </section>
        </div>
      </div>

      <section className={styles.nextSteps} data-ps-next-steps="">
        <p className={styles.eyebrow}>Najbliższe kroki</p>
        <div className={styles.nextStepsRow}>
          {w.nextSteps.map((step) => (
            <div key={step.label} className={styles.nextStepCell}>
              <span className={styles.factLabel}>{step.label}</span>
              <span className={styles.nextStepValue}>{step.value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * Landing-local stylized map — irregular streets + curved route.
 * Inspired by TravelMap presentation; no API / no screenshot.
 */
function LogisticsMap() {
  const route = `M ${mapPoints[0]!.x} ${mapPoints[0]!.y}
    C 32 30, 36 34, ${mapPoints[1]!.x} ${mapPoints[1]!.y}
    C 48 42, 52 44, ${mapPoints[2]!.x} ${mapPoints[2]!.y}
    C 66 54, 70 62, ${mapPoints[3]!.x} ${mapPoints[3]!.y}`

  return (
    <div className={styles.mapCard} data-ps-route-map="">
      <p className={styles.eyebrow}>Trasa</p>
      <div className={styles.mapFrame}>
        <svg
          className={styles.mapSvg}
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <linearGradient id="psMapWash" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f7f3ec" />
              <stop offset="55%" stopColor="#efe8dc" />
              <stop offset="100%" stopColor="#e7dfd2" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="url(#psMapWash)" />

          {/* Soft park / block fills */}
          <path
            className={styles.mapPark}
            d="M8 12 C18 8, 28 14, 34 22 L28 38 C18 36, 10 28, 8 12 Z"
          />
          <path
            className={styles.mapPark}
            d="M62 8 C78 6, 92 16, 94 28 L82 34 C70 22, 64 14, 62 8 Z"
          />
          <path
            className={styles.mapWater}
            d="M4 58 C18 52, 30 62, 38 74 C22 80, 10 78, 4 70 Z"
          />
          <path
            className={styles.mapBlock}
            d="M48 62 L68 58 L72 78 L52 82 Z"
          />
          <path
            className={styles.mapBlock}
            d="M14 42 L30 40 L34 54 L16 56 Z"
          />

          {/* Secondary street network — irregular, not a chart grid */}
          <g className={styles.mapStreets}>
            <path d="M2 18 C22 16, 40 22, 58 18 C72 15, 88 20, 98 16" />
            <path d="M6 34 C24 30, 42 38, 60 34 C76 30, 90 36, 99 33" />
            <path d="M3 50 C20 46, 38 54, 55 50 C70 47, 86 52, 98 49" />
            <path d="M5 68 C22 64, 40 72, 58 68 C74 65, 88 70, 97 67" />
            <path d="M8 84 C28 80, 48 88, 70 84 C82 82, 92 86, 99 84" />
            <path d="M18 4 C16 22, 24 40, 20 58 C17 72, 26 88, 22 98" />
            <path d="M36 2 C34 20, 42 38, 38 56 C35 70, 44 86, 40 99" />
            <path d="M54 3 C52 24, 60 42, 56 60 C53 74, 62 90, 58 99" />
            <path d="M72 2 C70 22, 78 40, 74 58 C71 74, 80 90, 76 99" />
            <path d="M88 5 C86 26, 94 44, 90 62 C87 78, 95 92, 92 99" />
            <path d="M12 28 C28 40, 44 28, 60 42 C70 50, 82 44, 94 54" />
            <path d="M10 72 C26 60, 44 76, 62 64 C74 56, 86 70, 96 62" />
          </g>

          {/* Primary arteries */}
          <g className={styles.mapArteries}>
            <path d="M4 40 C30 36, 50 48, 78 44 C88 42, 96 46, 100 45" />
            <path d="M30 2 C28 30, 40 55, 34 78 C30 90, 38 98, 36 100" />
          </g>

          <path className={styles.mapRoute} d={route} />

          {mapPoints.map((p, i) => (
            <g key={p.id}>
              <circle className={styles.mapPinHalo} cx={p.x} cy={p.y} r="3.4" />
              <circle className={styles.mapPin} cx={p.x} cy={p.y} r="2.1" />
              <text className={styles.mapPinNum} x={p.x} y={p.y + 0.85}>
                {i + 1}
              </text>
              <text
                className={styles.mapLabel}
                x={p.x + (p.x > 70 ? -4 : 4)}
                y={p.y - 3.6}
                textAnchor={p.x > 70 ? 'end' : 'start'}
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className={styles.mapTotals}>
        <p className={styles.eyebrow}>Podsumowanie trasy</p>
        <div className={styles.mapTotalsRow}>
          <div>
            <span className={styles.factLabel}>W trasie</span>
            <span className={styles.factValue}>{totals.duration}</span>
          </div>
          <div>
            <span className={styles.factLabel}>Dystans</span>
            <span className={styles.factValue}>{totals.distance}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Landing Logistyka — timeline + legs + SVG route map. */
export function ProductStoryLogisticsPanel() {
  const stops = juliaMaksymilian.schedule

  return (
    <div className={styles.panel} data-chapter="logistics">
      <div className={styles.logisticsLayout}>
        <section className={styles.sheet}>
          <p className={styles.eyebrow}>Trasa dnia</p>
          <p className={styles.lead}>{w.longDateShort}</p>
          <ol className={styles.routeList}>
            {stops.map((row, i) => (
              <li key={`${row.time}-${row.role}`} className={styles.routeStop}>
                <div className={styles.routeStopHead}>
                  <span className={styles.timelineTime}>{row.time}</span>
                  <span className={styles.routeRole}>{row.role}</span>
                </div>
                <p className={styles.routePlace}>{row.place}</p>
                {legs[i] ? (
                  <p className={styles.routeLeg}>
                    {legs[i]!.duration} · {legs[i]!.distance}
                  </p>
                ) : null}
              </li>
            ))}
            <li className={styles.routeStopEnd}>
              <div className={styles.routeStopHead}>
                <span className={styles.timelineTime}>
                  {juliaMaksymilian.coverageEnd.time}
                </span>
                <span className={styles.routeRole}>
                  {juliaMaksymilian.coverageEnd.label}
                </span>
              </div>
            </li>
          </ol>
        </section>
        <LogisticsMap />
      </div>
    </div>
  )
}

/** Landing Umowa i finanse — denser Modern settlement adaptation. */
export function ProductStoryFinancePanel() {
  return (
    <div className={styles.panel} data-chapter="finance">
      <section className={styles.sheet}>
        <div className={styles.splitHead}>
          <div>
            <p className={styles.eyebrow}>Umowa</p>
            <p className={styles.contractTitle}>Umowa — {w.coupleName}</p>
            <p className={styles.contractMeta}>
              {pkg.name} · DOCX
            </p>
          </div>
          <div className={styles.statusSoft}>
            <p className={styles.eyebrow}>Status</p>
            <p className={styles.statusValue}>{w.contractStatus}</p>
          </div>
        </div>
      </section>

      <section className={styles.sheet}>
        <p className={styles.eyebrow}>Rozliczenie</p>
        <div className={styles.financeFacts}>
          <div>
            <span className={styles.factLabel}>Wartość umowy</span>
            <span className={styles.factValue}>{c.contractValue}</span>
          </div>
          <div>
            <span className={styles.factLabel}>Wpłacono</span>
            <span className={styles.factValue}>{c.paid}</span>
          </div>
          <div>
            <span className={styles.factLabel}>Pozostało</span>
            <span className={styles.factValueEmph}>{c.remaining}</span>
          </div>
          <div>
            <span className={styles.factLabel}>{c.paymentDueLabel}</span>
            <span className={styles.factValue}>{c.paymentDueDate}</span>
          </div>
          <div>
            <span className={styles.factLabel}>{c.travelLabel}</span>
            <span className={styles.factValue}>{c.travelAmount}</span>
          </div>
        </div>

        <div className={styles.paymentRows}>
          <div className={styles.paymentRow}>
            <span>
              <strong>{c.depositLabel}</strong> · {c.depositAmount}
            </span>
            <span className={styles.paidTag}>{c.depositStatus}</span>
          </div>
          <div className={styles.paymentRow}>
            <span>
              <strong>{c.finalPaymentLabel}</strong> · {c.finalPaymentAmount}
            </span>
            <span className={styles.dueTag}>Termin: {c.paymentDueDate}</span>
          </div>
        </div>
      </section>

      <div className={styles.financeBottom}>
        <section className={styles.sheet}>
          <p className={styles.eyebrow}>Szczegóły pakietu</p>
          <p className={styles.packageTitle}>{pkg.name}</p>
          <p className={styles.packageMeta}>{pkg.coverage}</p>
          <ul className={styles.packageList}>
            {pkg.contents.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className={styles.sheet}>
          <p className={styles.eyebrow}>Dodatki / koszty</p>
          <div className={styles.factStack}>
            <div className={styles.factRow}>
              <span className={styles.factLabel}>{c.travelLabel}</span>
              <span className={styles.factValue}>{c.travelAmount}</span>
            </div>
            <div className={styles.factRow}>
              <span className={styles.factLabel}>Zaliczka</span>
              <span className={styles.factValue}>{pkg.depositFact}</span>
            </div>
            <div className={styles.factRow}>
              <span className={styles.factLabel}>Nadgodzina</span>
              <span className={styles.factValue}>{pkg.overtimeFact}</span>
            </div>
            <div className={styles.factRow}>
              <span className={styles.factLabel}>Razem</span>
              <span className={styles.factValueEmph}>{c.contractValue}</span>
            </div>
          </div>
        </section>
      </div>

      <section className={styles.sheet} data-ps-payment-history="">
        <p className={styles.eyebrow}>{c.paymentHistoryLabel}</p>
        <div className={styles.historyRow}>
          <div>
            <span className={styles.factLabel}>{c.depositLabel}</span>
            <span className={styles.factValue}>{c.depositAmount}</span>
          </div>
          <span className={styles.paidTag}>{c.depositStatus}</span>
          <div>
            <span className={styles.factLabel}>{c.finalPaymentLabel}</span>
            <span className={styles.factValue}>{c.finalPaymentAmount}</span>
          </div>
          <span className={styles.dueTag}>Termin {c.paymentDueDate}</span>
        </div>
      </section>
    </div>
  )
}

/** Landing Ankieta — fills chapter via explicit grid rows (no clip). */
export function ProductStoryQuestionnairePanel() {
  const noteMain = q.notes[0]
  const noteSession = q.notes[1]

  return (
    <div
      className={styles.questionnaireContent}
      data-chapter="questionnaire"
      data-ps-questionnaire=""
    >
      <section className={styles.qStatusBar} data-ps-q-status="">
        <p className={styles.eyebrow}>Ankieta przedślubna</p>
        <p className={styles.qStatusLead}>{q.status}</p>
        <p className={styles.qStatusSupport}>Dane z ankiety są aktualne.</p>
      </section>

      <section className={styles.qSummarySheet} data-ps-q-summary="">
        <p className={styles.eyebrow}>Podstawowe informacje</p>
        <div className={styles.qSummaryGrid}>
          {q.summary.map((a) => (
            <div key={a.label} className={styles.qSummaryCell}>
              <span className={styles.answerLabel}>{a.label}</span>
              <span className={styles.qSummaryValue}>{a.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.qLocationsSheet} data-ps-q-locations="">
        <p className={styles.eyebrow}>Miejsca</p>
        <div className={styles.qLocationsGrid}>
          {q.locations.map((a) => (
            <div key={a.label} className={styles.qLocationCard}>
              <span className={styles.answerLabel}>{a.label}</span>
              <span className={styles.answerValue}>{a.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.qPrioritiesSheet} data-ps-q-priorities="">
        <p className={styles.eyebrow}>Na czym im zależy</p>
        <div className={styles.qPrioritiesLayout}>
          {q.priorities.map((a) => (
            <div key={a.label} className={styles.qPriorityCard}>
              <span className={styles.answerLabel}>{a.label}</span>
              <span className={styles.answerValue}>{a.value}</span>
            </div>
          ))}
          {noteMain ? (
            <div className={styles.qNoteFull} data-ps-q-notes="">
              <span className={styles.answerLabel}>{noteMain.label}</span>
              <span className={styles.answerValue}>{noteMain.value}</span>
            </div>
          ) : null}
          {noteSession ? (
            <div className={styles.qSessionRow} data-ps-q-session="">
              <span className={styles.answerLabel}>{noteSession.label}</span>
              <span className={styles.answerValue}>{noteSession.value}</span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
