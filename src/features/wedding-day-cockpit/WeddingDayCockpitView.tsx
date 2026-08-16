import { useState } from 'react'
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { CockpitMobileNav } from '@/features/wedding-day-cockpit/CockpitMobileNav'
import {
  buildFieldNavigationLinks,
  buildSmsHref,
  buildTelHref,
} from '@/features/wedding-day-cockpit/fieldNavigation'
import type {
  CockpitStop,
  WeddingDayCockpitData,
} from '@/features/wedding-day-cockpit/types'
import { downloadWeddingBriefPdf } from '@/features/wedding-brief/downloadWeddingBriefPdf'
import { mapPdfRenderErrorForUser } from '@/features/documents/pdf/pdfRenderErrors'
import { operationalCompletionsQueryKey } from '@/features/wedding-day/queryKeys'
import type { OperationalCompletionMap } from '@/lib/api/weddingOperationalCompletionsService'
import { weddingOperationalCompletionsService } from '@/lib/api/weddingOperationalCompletionsService'
import { formatCurrency } from '@/lib/utils/currency'
import styles from './WeddingDayCockpit.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

function legLabel(
  leg: CockpitStop['incomingLeg'],
  routeStatus: WeddingDayCockpitData['routeStatus'],
): { text: string; muted: boolean } {
  if (routeStatus === 'loading' || leg?.status === 'stale') {
    return { text: 'Przeliczamy trasę…', muted: true }
  }
  if (!leg || leg.status === 'missing') {
    return { text: 'Czas dojazdu niedostępny', muted: true }
  }
  if (leg.status === 'error') {
    return { text: 'Nie udało się przeliczyć trasy', muted: true }
  }
  const parts = [leg.durationText, leg.distanceText].filter(Boolean)
  return { text: parts.join(' · '), muted: false }
}

function StopNavActions({
  stop,
  primary,
}: {
  stop: CockpitStop
  primary?: boolean
}) {
  const [chooserOpen, setChooserOpen] = useState(false)
  const links = buildFieldNavigationLinks({
    label: stop.placeName,
    formattedAddress: stop.address,
    latitude: stop.latitude,
    longitude: stop.longitude,
  })
  const tel = stop.phone ? buildTelHref(stop.phone) : null
  const sms = stop.phone ? buildSmsHref(stop.phone) : null
  const canNav = Boolean(links.google || links.apple)

  return (
    <div className={styles.actions}>
      {canNav ? (
        <>
          <button
            type="button"
            className={`${styles.actionBtn} ${primary ? styles.actionBtnPrimary : ''}`}
            data-testid={`cockpit-nav-${stop.key}`}
            onClick={() => setChooserOpen((v) => !v)}
          >
            Jedź
          </button>
          {chooserOpen ? (
            <div className={styles.navChooser} role="group" aria-label="Wybierz mapę">
              {links.apple ? (
                <a
                  className={styles.actionBtn}
                  href={links.apple}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`cockpit-nav-apple-${stop.key}`}
                >
                  Apple Maps
                </a>
              ) : null}
              {links.google ? (
                <a
                  className={styles.actionBtn}
                  href={links.google}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`cockpit-nav-google-${stop.key}`}
                >
                  Google Maps
                </a>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {tel ? (
        <a
          className={styles.actionBtn}
          href={tel}
          data-testid={`cockpit-call-${stop.key}`}
        >
          Zadzwoń
        </a>
      ) : null}
      {sms ? (
        <a
          className={styles.actionBtn}
          href={sms}
          data-testid={`cockpit-sms-${stop.key}`}
        >
          SMS
        </a>
      ) : null}
    </div>
  )
}

function ContactActions({ phone, id }: { phone?: string; id: string }) {
  if (!phone?.trim()) return null
  const tel = buildTelHref(phone)
  const sms = buildSmsHref(phone)
  if (!tel && !sms) return null
  return (
    <div className={styles.contactActions}>
      {tel ? (
        <a
          className={styles.actionBtn}
          href={tel}
          data-testid={`cockpit-contact-call-${id}`}
        >
          Zadzwoń
        </a>
      ) : null}
      {sms ? (
        <a
          className={styles.actionBtn}
          href={sms}
          data-testid={`cockpit-contact-sms-${id}`}
        >
          SMS
        </a>
      ) : null}
    </div>
  )
}

type Props = {
  data: WeddingDayCockpitData
  userId: string | null | undefined
}

export function WeddingDayCockpitView({ data, userId }: Props) {
  const queryClient = useQueryClient()
  const [briefBusy, setBriefBusy] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)
  const [completionError, setCompletionError] = useState<string | null>(null)

  const hero = data.stops.find((s) => s.key === data.heroStopKey) ?? null
  const nextAfterHero = (() => {
    if (!hero) return null
    const actionable = data.stops.filter((s) => s.actionable)
    const idx = actionable.findIndex((s) => s.key === hero.key)
    if (idx < 0 || idx >= actionable.length - 1) return null
    return actionable[idx + 1] ?? null
  })()

  const hasCritical = data.criticalNotes.length > 0
  const phoneContacts = data.contacts.filter((c) => Boolean(c.phone?.trim()))
  const completionsKey = operationalCompletionsQueryKey(userId, data.weddingId)

  const completionMutation = useMutation({
    mutationFn: async (input: { stopKey: string; complete: boolean }) => {
      if (input.complete) {
        await weddingOperationalCompletionsService.markComplete(
          data.weddingId,
          input.stopKey,
        )
      } else {
        await weddingOperationalCompletionsService.clearComplete(
          data.weddingId,
          input.stopKey,
        )
      }
      return input
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: completionsKey })
      const previous =
        queryClient.getQueryData<OperationalCompletionMap>(completionsKey)
      queryClient.setQueryData<OperationalCompletionMap>(
        completionsKey,
        (prev) => {
          const next = { ...(prev ?? {}) }
          if (input.complete) next[input.stopKey] = new Date().toISOString()
          else delete next[input.stopKey]
          return next
        },
      )
      return { previous }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(completionsKey, ctx.previous)
      }
      setCompletionError('Nie udało się zapisać statusu punktu.')
    },
    onSuccess: () => {
      setCompletionError(null)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: completionsKey })
    },
  })

  async function handleBrief() {
    if (briefBusy) return
    setBriefBusy(true)
    setBriefError(null)
    try {
      await downloadWeddingBriefPdf(data.weddingId)
    } catch (e) {
      const raw = getUserFacingErrorMessage(e, '')
      setBriefError(mapPdfRenderErrorForUser(raw))
    } finally {
      setBriefBusy(false)
    }
  }

  return (
    <div className={styles.page} data-testid="wedding-day-cockpit">
      <div className={styles.topBar}>
        <div className={styles.identity}>
          <Link
            to={`/sluby/${data.weddingId}`}
            className={styles.backLink}
            data-testid="cockpit-back"
          >
            ← Wróć do zlecenia
          </Link>
          <h1 className={styles.couple}>{data.displayName}</h1>
          <p className={styles.dateLine}>{data.dateLabel}</p>
          {data.packageName ? (
            <p className={styles.packageLine}>{data.packageName}</p>
          ) : null}
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.primaryCol}>
          <section id="cockpit-teraz" aria-labelledby="cockpit-hero-heading">
            <div className={styles.hero} data-testid="cockpit-hero">
              {hero ? (
                <>
                  <p className={styles.heroEyebrow} id="cockpit-hero-heading">
                    Następny punkt
                  </p>
                  {hero.time ? (
                    <p
                      className={styles.heroTime}
                      data-testid="cockpit-hero-time"
                    >
                      {hero.time}
                    </p>
                  ) : (
                    <p
                      className={styles.heroTimeQuiet}
                      data-testid="cockpit-hero-time-missing"
                    >
                      Godzina nieustalona
                    </p>
                  )}
                  <h2 className={styles.heroTitle}>{hero.title}</h2>
                  {hero.placeName ? (
                    <p className={styles.heroPlace}>{hero.placeName}</p>
                  ) : null}
                  {hero.address ? (
                    <p className={styles.heroAddress}>{hero.address}</p>
                  ) : null}
                  {hero.incomingLeg ? (
                    (() => {
                      const L = legLabel(hero.incomingLeg, data.routeStatus)
                      return (
                        <p
                          className={`${styles.heroLeg} ${L.muted ? styles.heroLegMuted : ''}`}
                          data-testid="cockpit-hero-leg"
                        >
                          {L.text}
                        </p>
                      )
                    })()
                  ) : null}
                  <StopNavActions stop={hero} primary />
                  {nextAfterHero ? (
                    <p
                      className={styles.heroNextHint}
                      data-testid="cockpit-hero-next"
                    >
                      Następnie: {nextAfterHero.title}
                      {nextAfterHero.time ? ` · ${nextAfterHero.time}` : ''}
                    </p>
                  ) : null}
                  <div className={styles.planActions}>
                    <button
                      type="button"
                      className={styles.completeBtn}
                      disabled={completionMutation.isPending}
                      data-testid="cockpit-complete-hero"
                      onClick={() =>
                        completionMutation.mutate({
                          stopKey: hero.key,
                          complete: true,
                        })
                      }
                    >
                      {completionMutation.isPending
                        ? 'Zapisywanie…'
                        : 'Oznacz jako zrealizowane'}
                    </button>
                  </div>
                </>
              ) : data.dayComplete ? (
                <>
                  <p className={styles.heroEyebrow} id="cockpit-hero-heading">
                    Dzień zakończony
                  </p>
                  <h2
                    className={styles.heroTitle}
                    data-testid="cockpit-day-complete"
                  >
                    Wszystkie punkty planu zostały oznaczone jako zrealizowane.
                  </h2>
                  <p className={styles.muted}>
                    Możesz cofnąć status przy dowolnym punkcie poniżej.
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.heroEyebrow} id="cockpit-hero-heading">
                    Następny punkt
                  </p>
                  <h2 className={styles.heroTitle}>Brak punktów operacyjnych</h2>
                  <p className={styles.muted}>
                    Uzupełnij lokalizacje w planie dnia zlecenia.
                  </p>
                </>
              )}
              {completionError ? (
                <p className={styles.briefError} role="alert">
                  {completionError}
                </p>
              ) : null}
            </div>
          </section>

          <section id="cockpit-plan" aria-labelledby="cockpit-plan-heading">
            <h2 className={styles.sectionTitle} id="cockpit-plan-heading">
              Plan dnia
            </h2>
            {data.routeStatus === 'loading' ? (
              <p className={styles.muted} data-testid="cockpit-route-loading">
                Aktualizujemy czasy i odległości…
              </p>
            ) : null}
            {data.stops.length === 0 ? (
              <p className={styles.muted}>Brak trasy na ten dzień.</p>
            ) : (
              <ol className={styles.planList} data-testid="cockpit-plan-list">
                {data.stops.map((stop, index) => {
                  const showOutgoing =
                    index < data.stops.length - 1 &&
                    data.stops[index + 1]?.incomingLeg != null
                  const nextStop = data.stops[index + 1]
                  const outgoing = nextStop?.incomingLeg ?? null
                  const L = showOutgoing
                    ? legLabel(outgoing, data.routeStatus)
                    : null
                  return (
                    <li key={stop.key} className={styles.planItem}>
                      <div
                        className={styles.planStop}
                        data-completed={stop.completed ? 'true' : 'false'}
                        data-hero={
                          stop.key === data.heroStopKey ? 'true' : 'false'
                        }
                        data-stop-key={stop.key}
                        data-testid={`cockpit-stop-${stop.key}`}
                      >
                        <div className={styles.planTimeCol}>
                          <span
                            className={
                              stop.time
                                ? styles.planTime
                                : styles.planTimeEmpty
                            }
                          >
                            {stop.time || ''}
                          </span>
                          {stop.completed ? (
                            <span
                              className={styles.completedMark}
                              aria-label="Zrealizowane"
                            >
                              <Check size={14} strokeWidth={2.25} aria-hidden />
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.planBody}>
                          <p className={styles.planTitle}>{stop.title}</p>
                          {stop.placeName ? (
                            <p className={styles.planPlace}>{stop.placeName}</p>
                          ) : null}
                          {stop.address ? (
                            <p className={styles.planAddress}>{stop.address}</p>
                          ) : null}
                          {stop.kind === 'wedding_place' ? (
                            <>
                              <StopNavActions stop={stop} />
                              <div className={styles.planActions}>
                                <button
                                  type="button"
                                  className={styles.completeBtn}
                                  disabled={completionMutation.isPending}
                                  data-testid={`cockpit-toggle-${stop.key}`}
                                  onClick={() =>
                                    completionMutation.mutate({
                                      stopKey: stop.key,
                                      complete: !stop.completed,
                                    })
                                  }
                                >
                                  {stop.completed
                                    ? 'Cofnij'
                                    : 'Oznacz jako zrealizowane'}
                                </button>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                      {showOutgoing && L && nextStop ? (
                        <p
                          className={`${styles.planLeg} ${L.muted ? styles.planLegMuted : ''}`}
                          data-testid={`cockpit-leg-${nextStop.key}`}
                          data-leg-status={outgoing?.status}
                        >
                          <span aria-hidden>↓</span> {L.text}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>

        <div className={styles.secondaryCol}>
          {hasCritical ? (
            <section
              id="cockpit-wazne"
              className={styles.criticalSection}
              aria-labelledby="cockpit-critical-heading"
            >
              <h2
                className={styles.criticalHeading}
                id="cockpit-critical-heading"
              >
                Nie przegap
              </h2>
              <ul className={styles.criticalList} data-testid="cockpit-critical">
                {data.criticalNotes.map((note, i) => (
                  <li key={`${note.label}-${i}`} className={styles.criticalItem}>
                    <p className={styles.criticalLabel}>{note.label}</p>
                    <p className={styles.criticalContent}>{note.content}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div id="cockpit-wazne" hidden aria-hidden />
          )}

          <section id="cockpit-kontakt" aria-labelledby="cockpit-contacts-heading">
            <h2 className={styles.sectionTitle} id="cockpit-contacts-heading">
              Kontakty
            </h2>
            {phoneContacts.length === 0 ? (
              <p className={styles.muted}>Brak numerów telefonu.</p>
            ) : (
              <ul className={styles.contactList} data-testid="cockpit-contacts">
                {phoneContacts.map((c, i) => (
                  <li key={`${c.role}-${i}`} className={styles.contactRow}>
                    <div className={styles.contactMeta}>
                      <p className={styles.contactName}>{c.name || c.role}</p>
                      <p className={styles.contactSub}>
                        {c.role}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </p>
                    </div>
                    <ContactActions phone={c.phone} id={`${i}`} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.settlement ? (
            <section aria-labelledby="cockpit-settle-heading">
              <h2 className={styles.sectionTitle} id="cockpit-settle-heading">
                Rozliczenie
              </h2>
              <div
                className={styles.settlementRows}
                data-testid="cockpit-settlement"
              >
                <div className={styles.settleRow}>
                  <span className={styles.settleLabel}>Wartość umowy</span>
                  <span className={styles.settleValue}>
                    {formatCurrency(data.settlement.contractValue)}
                  </span>
                </div>
                {data.settlement.travelFeeLabel ? (
                  <div className={styles.settleRow}>
                    <span className={styles.settleLabel}>Dojazd</span>
                    <span className={styles.settleValue}>
                      {data.settlement.travelFeeLabel === 'W cenie'
                        ? 'W cenie'
                        : data.settlement.travelFeeLabel}
                    </span>
                  </div>
                ) : null}
                <div className={styles.settleRow}>
                  <span className={styles.settleLabel}>Wpłacono</span>
                  <span className={styles.settleValue}>
                    {formatCurrency(data.settlement.totalPaid)}
                  </span>
                </div>
                {!data.settlement.settled ? (
                  <div
                    className={`${styles.settleRow} ${styles.settleRemaining}`}
                  >
                    <span className={styles.settleLabel}>Pozostało</span>
                    <span className={styles.settleValue}>
                      {formatCurrency(data.settlement.remainingToPay)}
                    </span>
                  </div>
                ) : (
                  <p className={styles.settledBadge}>Rozliczono</p>
                )}
              </div>
            </section>
          ) : null}

          <section
            className={styles.briefBlock}
            aria-labelledby="cockpit-brief-heading"
          >
            <h2 className={styles.sectionTitle} id="cockpit-brief-heading">
              Wedding Brief
            </h2>
            <p className={styles.muted}>
              Offline’owy PDF na telefon — generowany dopiero po kliknięciu.
            </p>
            <div className={styles.planActions}>
              <Button
                type="button"
                variant="secondary"
                disabled={briefBusy}
                data-testid="cockpit-brief-download"
                onClick={() => void handleBrief()}
              >
                {briefBusy ? 'Przygotowywanie…' : 'Pobierz Wedding Brief'}
              </Button>
            </div>
            {briefError ? (
              <p className={styles.briefError} role="alert">
                {briefError}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      <CockpitMobileNav />
    </div>
  )
}
