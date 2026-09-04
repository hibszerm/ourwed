import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { calendarIntegrationsService } from '@/features/calendar-integrations/calendarIntegrationsService'
import { calendarIntegrationQueryKeys } from '@/features/calendar-integrations/queryKeys'
import { getContactSections } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import {
  composeCalendarsRows,
  composeCorrespondenceOverview,
  composeFilledPlaces,
  composeModernWeddingAttention,
  composeModernWeddingCommercialHealth,
  composeModernWeddingCurrentStory,
  composePackageOverviewMeta,
  type AttentionItem,
  type CurrentStoryActionId,
  type CurrentStoryView,
} from '@/features/weddings/modern-detail/modernWeddingDetailModel'
import { buildGoogleMapsNavigationUrl } from '@/services/googleMapsLinks'
import type { WeddingNextAction } from '@/lib/workflow/resolveWeddingNextAction'
import type { QuestionnaireStatus, Wedding } from '@/types/wedding'
import type { WeddingPlace } from '@/types/travel'
import styles from './ModernWeddingOverview.module.css'

const COMMERCIAL_OWNED_IDS = new Set([
  'overdue_payment',
  'unresolved_travel',
  'overdue_delivery',
])

const CALM_STORY_KINDS = new Set([
  'ready',
  'past',
  'delivered',
  'waiting_contract',
  'waiting_prewedding',
])

interface OverviewProps {
  wedding: Wedding
  places: WeddingPlace[]
  action: WeddingNextAction | null
  applyCount: number
  preStatus?: QuestionnaireStatus | null
  missingTemplate: boolean
  onStoryAction: (id: CurrentStoryActionId) => void
  onEditLocations: () => void
  onEditContacts?: () => void
  onEditPackage?: () => void
  onShowPackageDetails: () => void
}

export function ModernWeddingOverview({
  wedding,
  places,
  action,
  applyCount,
  preStatus,
  missingTemplate,
  onStoryAction,
  onEditLocations,
  onEditContacts,
  onEditPackage,
  onShowPackageDetails,
}: OverviewProps) {
  const story = composeModernWeddingCurrentStory({
    wedding,
    action,
    applyCount,
    preweddingStatus: preStatus,
    missingTemplate,
  })
  const commercial = composeModernWeddingCommercialHealth(wedding)
  const attention = composeModernWeddingAttention({
    wedding,
    places,
    applyCount,
    missingTemplate,
    story,
  })
  const extras = attention.items
    .filter((item) => item.id !== 'apply' && !COMMERCIAL_OWNED_IDS.has(item.id))
    .slice(0, 3)
  const travelNote = attention.items.find((item) => item.id === 'unresolved_travel')

  return (
    <div className={styles.grid} data-testid="modern-wedding-overview">
      <CurrentState
        story={story}
        commercial={commercial}
        onAction={onStoryAction}
      />
      <CommercialRecord
        view={commercial}
        travel={travelNote}
        onOpenFinance={() => onStoryAction('open_finance')}
        onOpenDelivery={() => onStoryAction('open_delivery')}
        onTravelAction={
          travelNote?.action
            ? () => onStoryAction(travelNote.action!.id)
            : undefined
        }
      />
      <div className={styles.stackLeft}>
        <Places wedding={wedding} places={places} onEdit={onEditLocations} />
        <PackageSection
          wedding={wedding}
          onEdit={onEditPackage}
          onShow={onShowPackageDetails}
        />
      </div>
      <div className={styles.stackRight}>
        <Couple wedding={wedding} onEdit={onEditContacts} />
        <CalendarsSection weddingId={wedding.id} />
      </div>
      {extras.length > 0 ? (
        <Readiness extras={extras} onAction={onStoryAction} />
      ) : null}
    </div>
  )
}

function currentStorySupport(
  story: CurrentStoryView,
  commercial: ReturnType<typeof composeModernWeddingCommercialHealth>,
): string | null {
  if (story.support) return story.support
  if (story.kind === 'overdue' && commercial.dueLabel) {
    return `Termin płatności minął ${commercial.dueLabel}.`
  }
  return null
}

function CurrentState({
  story,
  commercial,
  onAction,
}: {
  story: CurrentStoryView
  commercial: ReturnType<typeof composeModernWeddingCommercialHealth>
  onAction: (id: CurrentStoryActionId) => void
}) {
  const actionable = Boolean(story.primaryAction || story.quietLink)
  const calm = CALM_STORY_KINDS.has(story.kind) && !actionable
  const support = currentStorySupport(story, commercial)
  return (
    <section
      className={`${styles.box} ${styles.statusBox}`}
      aria-labelledby="modern-current-story-title"
      data-testid="modern-wedding-current-story"
      data-kind={story.kind}
      data-calm={calm ? 'true' : 'false'}
    >
      <div className={styles.statusRow}>
        <div className={styles.statusCopy}>
          <p className={styles.eyebrow}>{story.eyebrow}</p>
          <h2 id="modern-current-story-title" className={styles.statusTitle}>
            {story.title}
          </h2>
          {support ? <p className={styles.statusSupport}>{support}</p> : null}
        </div>
        {story.primaryAction ? (
          <div className={styles.statusCta}>
            <Button
              type="button"
              variant="primary"
              className={styles.statusCtaButton}
              data-testid="modern-current-story-cta"
              onClick={() => onAction(story.primaryAction!.id)}
            >
              {story.primaryAction.label}
            </Button>
          </div>
        ) : null}
        {story.quietLink ? (
          <button
            type="button"
            className={styles.quietLink}
            data-testid="modern-current-story-quiet-link"
            onClick={() => onAction(story.quietLink!.id)}
          >
            {story.quietLink.label}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function CommercialRecord({
  view,
  travel,
  onOpenFinance,
  onOpenDelivery,
  onTravelAction,
}: {
  view: ReturnType<typeof composeModernWeddingCommercialHealth>
  travel: AttentionItem | undefined
  onOpenFinance: () => void
  onOpenDelivery: () => void
  onTravelAction?: () => void
}) {
  const paid = view.paymentKind === 'paid'
  const none = view.paymentKind === 'none'

  return (
    <section
      className={`${styles.box} ${styles.financeBox}`}
      data-testid="modern-wedding-commercial"
      data-payment={view.paymentKind}
      aria-labelledby="modern-commercial-title"
    >
      <h2 id="modern-commercial-title" className={styles.sectionTitle}>
        Rozliczenie
      </h2>
      <div className={styles.financeFacts} data-paid={paid ? 'true' : 'false'}>
        <div className={styles.fact}>
          <p className={styles.factLabel}>Wartość umowy</p>
          <p
            className={styles.financeTotal}
            data-testid="modern-commercial-value"
          >
            {view.contractValueLabel}
          </p>
        </div>
        <div className={styles.fact}>
          <p className={styles.factLabel}>{paid ? 'Status' : none ? 'Wpłaty' : 'Wpłacono'}</p>
          <p
            className={styles.financeValue}
            data-tone={none ? 'none' : paid ? 'paid' : undefined}
            data-testid="modern-commercial-payments"
          >
            {none ? 'Brak wpłat' : paid ? 'Opłacone' : view.paidLabel}
          </p>
        </div>
        {!paid && view.remainingLabel ? (
          <div className={styles.fact}>
            <p className={styles.factLabel}>Pozostało</p>
            <p
              className={styles.financeValue}
              data-tone={view.paymentTone === 'overdue' ? 'overdue' : undefined}
              data-testid="modern-commercial-remaining"
            >
              {view.remainingLabel}
            </p>
          </div>
        ) : null}
        {view.dueLabel ? (
          <button
            type="button"
            className={styles.timeFact}
            data-tone={view.dueTone}
            onClick={onOpenFinance}
          >
            <span className={styles.factLabel}>Termin płatności</span>
            <strong className={styles.factPrimary}>{view.dueLabel}</strong>
          </button>
        ) : null}
        {view.delivery ? (
          <button
            type="button"
            className={styles.timeFact}
            data-tone={view.delivery.tone}
            data-testid="modern-commercial-delivery"
            onClick={onOpenDelivery}
          >
            <span className={styles.factLabel}>{view.delivery.label}</span>
            <strong className={styles.factPrimary}>{view.delivery.value}</strong>
            {view.delivery.tone === 'today' ? (
              <span className={styles.factSupport}>dziś</span>
            ) : null}
          </button>
        ) : null}
      </div>
      {travel ? (
        <p className={styles.travelLine} data-testid="modern-commercial-travel">
          <span>
            Dojazd · <strong>Nieustalony</strong>
          </span>
          {travel.action && onTravelAction ? (
            <button
              type="button"
              className={styles.quietLink}
              onClick={onTravelAction}
            >
              {travel.action.label}
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}

function Places({
  wedding,
  places,
  onEdit,
}: {
  wedding: Wedding
  places: WeddingPlace[]
  onEdit: () => void
}) {
  const filled = composeFilledPlaces(wedding, places)
  return (
    <section
      className={`${styles.box} ${styles.places}`}
      aria-labelledby="modern-places-title"
      data-testid="modern-wedding-places"
      data-empty={filled.length === 0 ? 'true' : 'false'}
    >
      <div className={styles.sectionHead}>
        <h2 id="modern-places-title" className={styles.sectionTitle}>
          Miejsca
        </h2>
        <button type="button" className={styles.quietLink} onClick={onEdit}>
          {filled.length === 0 ? 'Uzupełnij' : 'Edytuj'}
        </button>
      </div>
      {filled.length === 0 ? (
        <p className={styles.muted}>Brak uzupełnionych miejsc</p>
      ) : (
        <ul className={styles.placeList}>
          {filled.map((item) => {
            const hasVerified = Boolean(
              item.placeId || (item.latitude != null && item.longitude != null),
            )
            const navUrl =
              hasVerified
                ? buildGoogleMapsNavigationUrl({
                    formattedAddress: item.address,
                    label: item.placeName,
                    placeId: item.placeId,
                    latitude: item.latitude,
                    longitude: item.longitude,
                  })
                : null
            return (
              <li key={item.role} className={styles.placeItem}>
                <p className={styles.placeRole}>{item.label}</p>
                <p className={styles.placeName}>
                  {item.placeName || item.address}
                </p>
                {item.placeName && item.address ? (
                  <p className={styles.placeAddress}>{item.address}</p>
                ) : null}
                {navUrl ? (
                  <a
                    className={styles.navLink}
                    href={navUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Nawiguj
                  </a>
                ) : (
                  <span className={styles.navSlot} aria-hidden="true" />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Couple({
  wedding,
  onEdit,
}: {
  wedding: Wedding
  onEdit?: () => void
}) {
  const partners = getContactSections(wedding.couple)
  const channels = composeCorrespondenceOverview(wedding)
  return (
    <section
      className={`${styles.box} ${styles.couple}`}
      aria-labelledby="modern-couple-title"
      data-testid="modern-wedding-couple"
    >
      <div className={styles.sectionHead}>
        <h2 id="modern-couple-title" className={styles.sectionTitle}>
          Para
        </h2>
        {onEdit ? (
          <button type="button" className={styles.quietLink} onClick={onEdit}>
            Edytuj
          </button>
        ) : null}
      </div>
      <div className={styles.coupleGrid}>
        {partners.map((p) => (
          <div key={p.title} className={styles.partner}>
            <p className={styles.placeRole}>{p.title}</p>
            <p className={styles.partnerName}>{p.name}</p>
            {p.phone ? (
              <p className={styles.contactLine}>
                <a className={styles.contactLink} href={`tel:${p.phone}`}>
                  {p.phone}
                </a>
              </p>
            ) : (
              <p className={styles.muted}>Brak telefonu</p>
            )}
            {p.email ? (
              <p className={styles.contactLine}>
                <a className={styles.contactLink} href={`mailto:${p.email}`}>
                  {p.email}
                </a>
              </p>
            ) : (
              <p className={styles.contactSlot} aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
      {channels.length > 0 ? (
        <div
          className={styles.channelBlock}
          data-testid="modern-wedding-correspondence"
        >
          <p className={styles.factLabel}>Kanały kontaktu</p>
          <ul className={styles.channelList}>
            {channels.map((row) => (
              <li key={row.id}>
                <span className={styles.channelName}>{row.channelLabel}</span>
                {row.display.kind === 'mailto' ||
                row.display.kind === 'external' ? (
                  <a
                    className={styles.contactLink}
                    href={row.display.href}
                    {...(row.display.kind === 'external'
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {row.display.label}
                  </a>
                ) : (
                  <span className={styles.channelValue}>{row.display.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function PackageSection({
  wedding,
  onEdit,
  onShow,
}: {
  wedding: Wedding
  onEdit?: () => void
  onShow: () => void
}) {
  const [open, setOpen] = useState(false)
  const pkg = composePackageOverviewMeta(wedding)
  return (
    <section
      className={`${styles.box} ${styles.packageBox}`}
      aria-labelledby="modern-package-title"
      data-testid="modern-wedding-package"
    >
      <div className={styles.sectionHead}>
        <h2 id="modern-package-title" className={styles.sectionTitle}>
          Pakiet
        </h2>
        {onEdit ? (
          <button type="button" className={styles.quietLink} onClick={onEdit}>
            Edytuj pakiet
          </button>
        ) : null}
      </div>
      <p className={styles.packageName}>{pkg.name}</p>
      {pkg.coverage ? (
        <p className={styles.packageCoverage}>{pkg.coverage}</p>
      ) : null}
      {pkg.delivery ? (
        <p className={styles.packageDelivery}>{pkg.delivery}</p>
      ) : null}
      {pkg.items.length > 0 ? (
        <button
          type="button"
          className={`${styles.quietLink} ${styles.packageReveal}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Ukryj zawartość' : 'Pokaż zawartość'}
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.quietLink} ${styles.packageReveal}`}
          onClick={onShow}
        >
          Pokaż zawartość
        </button>
      )}
      {open ? (
        <ul className={styles.packageItems}>
          {pkg.items.map((item) => (
            <li key={`${item.sortOrder}-${item.title}`}>{item.title}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function CalendarsSection({ weddingId }: { weddingId: string }) {
  const userId = useStudioAuthId()
  const { data } = useQuery({
    queryKey: calendarIntegrationQueryKeys.entityStatus(
      userId,
      'wedding',
      weddingId,
    ),
    queryFn: () =>
      calendarIntegrationsService.getEntityStatus('wedding', weddingId),
    enabled: Boolean(userId && weddingId),
  })
  const rows = composeCalendarsRows({
    googleState: data?.google.state,
    appleState: data?.apple.state,
  })
  return (
    <section
      className={`${styles.box} ${styles.calendars}`}
      aria-labelledby="modern-calendars-title"
      data-testid="modern-wedding-calendars"
    >
      <div className={styles.sectionHead}>
        <h2 id="modern-calendars-title" className={styles.sectionTitle}>
          Kalendarze
        </h2>
        <Link to="/ustawienia/integracje" className={styles.quietLink}>
          Zarządzaj
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className={styles.calendarsEmpty}>—</p>
      ) : (
        <ul className={styles.calendarList}>
          {rows.map((row) => (
            <li key={row.name}>
              <span className={styles.calendarName}>{row.name}</span>
              <span
                className={styles.calendarStatus}
                data-tone={row.tone}
              >
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Readiness({
  extras,
  onAction,
}: {
  extras: AttentionItem[]
  onAction: (id: CurrentStoryActionId) => void
}) {
  return (
    <section
      className={`${styles.box} ${styles.boxQuiet} ${styles.readiness}`}
      aria-label="Do uzupełnienia"
    >
      <h2 className={styles.sectionTitle}>Do uzupełnienia</h2>
      <ul
        className={styles.readinessList}
        data-testid="modern-wedding-attention"
        data-count={String(extras.length)}
      >
        {extras.map((item) => (
          <li key={item.id}>
            <span>{item.label}</span>
            {item.action ? (
              <button
                type="button"
                className={styles.quietLink}
                onClick={() => onAction(item.action!.id)}
              >
                {item.action.label}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
