import { Link } from 'react-router-dom'
import { IconCheck, IconClock, IconMail, IconMapPin, IconPhone } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import { useQuery } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { calendarIntegrationsService } from '@/features/calendar-integrations/calendarIntegrationsService'
import { calendarIntegrationQueryKeys } from '@/features/calendar-integrations/queryKeys'
import {
  CORRESPONDENCE_CHANNEL_LABELS,
  getCorrespondenceDisplay,
} from '@/features/weddings/correspondence/weddingCorrespondence'
import {
  getContactSections,
  getPackageSummary,
  getWeddingLocationItems,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { buildGoogleMapsNavigationUrl } from '@/services/googleMapsLinks'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface EssentialsProps {
  wedding: Wedding
  places: WeddingPlace[]
  onEditLocations: () => void
  onEditContacts?: () => void
  onEditPackage?: () => void
  onShowPackageDetails: () => void
}

export function WeddingOverviewEssentials({
  wedding,
  places,
  onEditLocations,
  onEditContacts,
  onEditPackage,
  onShowPackageDetails,
}: EssentialsProps) {
  return (
    <div className={styles.essentialsGrid} data-testid="wedding-overview-essentials">
      <LocationsCard
        wedding={wedding}
        places={places}
        onEditLocations={onEditLocations}
      />
      <ContactCard wedding={wedding} onEditContacts={onEditContacts} />
      <PackageCard
        wedding={wedding}
        onEditPackage={onEditPackage}
        onShowPackageDetails={onShowPackageDetails}
      />
      <CalendarCard weddingId={wedding.id} />
    </div>
  )
}

function LocationsCard({
  wedding,
  places,
  onEditLocations,
}: {
  wedding: Wedding
  places: WeddingPlace[]
  onEditLocations: () => void
}) {
  const items = getWeddingLocationItems(wedding, places)

  return (
    <section
      className={styles.essentialCard}
      aria-labelledby="overview-locations-title"
      data-testid="overview-locations-card"
    >
      <div className={styles.overviewStateHeader}>
        <h2 id="overview-locations-title" className={styles.sectionHeading}>
          Lokalizacje
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEditLocations}
        >
          Edytuj lokalizacje
        </Button>
      </div>
      <ul className={styles.locationEssentialsList}>
        {items.map((item) => {
          const hasVerifiedPlace = Boolean(
            item.placeId || (item.latitude != null && item.longitude != null),
          )
          const navUrl =
            !item.empty && hasVerifiedPlace
              ? buildGoogleMapsNavigationUrl({
                  formattedAddress: item.address,
                  label: item.placeName,
                  placeId: item.placeId,
                  latitude: item.latitude,
                  longitude: item.longitude,
                })
              : null

          return (
            <li key={item.role} className={styles.locationEssentialItem}>
              <div className={styles.locationEssentialHead}>
                <IconMapPin width={16} height={16} aria-hidden />
                <span className={styles.locationRoleLabel}>{item.label}</span>
              </div>
              {item.empty ? (
                <p className={styles.contextMuted}>
                  {item.role === 'ceremony'
                    ? 'Miejsce ceremonii nie zostało jeszcze uzupełnione.'
                    : item.role === 'reception'
                      ? 'Miejsce przyjęcia nie zostało jeszcze uzupełnione.'
                      : item.role.includes('preparation')
                        ? 'Miejsca przygotowań zostaną uzupełnione później.'
                        : 'Nie uzupełniono.'}
                </p>
              ) : (
                <>
                  <p className={styles.contextStrong}>
                    {item.placeName || item.address}
                  </p>
                  {item.placeName && item.address ? (
                    <p className={styles.contextMuted}>{item.address}</p>
                  ) : null}
                  {!hasVerifiedPlace && item.address ? (
                    <p className={styles.contextMuted}>
                      Adres tekstowy — bez zweryfikowanej lokalizacji na mapie.
                    </p>
                  ) : null}
                  {navUrl ? (
                    <a
                      className={styles.textAction}
                      href={navUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Nawiguj
                    </a>
                  ) : null}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ContactCard({
  wedding,
  onEditContacts,
}: {
  wedding: Wedding
  onEditContacts?: () => void
}) {
  const partners = getContactSections(wedding.couple)
  const channels = (wedding.correspondence ?? []).filter((e) => e.value?.trim())

  return (
    <section
      className={styles.essentialCard}
      aria-labelledby="overview-contact-title"
      data-testid="overview-contact-card"
    >
      <div className={styles.overviewStateHeader}>
        <h2 id="overview-contact-title" className={styles.sectionHeading}>
          Para i kontakt
        </h2>
        {onEditContacts ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEditContacts}
          >
            Edytuj dane pary
          </Button>
        ) : null}
      </div>
      <div className={styles.contactEssentials}>
        {partners.map((p) => (
          <div key={p.title} className={styles.contactEssentialBlock}>
            <p className={styles.contextMuted}>{p.title}</p>
            <p className={styles.contextStrong}>{p.name}</p>
            {p.phone ? (
              <p className={styles.contactLine}>
                <IconPhone width={14} height={14} aria-hidden />
                <a href={`tel:${p.phone}`}>{p.phone}</a>
              </p>
            ) : (
              <p className={styles.contextMuted}>Brak telefonu</p>
            )}
            {p.email ? (
              <p className={styles.contactLine}>
                <IconMail width={14} height={14} aria-hidden />
                <a href={`mailto:${p.email}`}>{p.email}</a>
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {channels.length > 0 ? (
        <div
          className={styles.contactChannels}
          data-testid="overview-contact-channels"
        >
          <p className={styles.contextMuted}>Kanały kontaktu</p>
          <ul className={styles.contactChannelList}>
            {channels.map((entry) => {
              const display = getCorrespondenceDisplay(entry)
              if (!display) return null
              return (
                <li
                  key={entry.id}
                  className={styles.contactChannelItem}
                  data-channel={entry.channel}
                >
                  <span className={styles.contactChannelLabel}>
                    {CORRESPONDENCE_CHANNEL_LABELS[entry.channel]}
                  </span>
                  {display.kind === 'mailto' || display.kind === 'external' ? (
                    <a
                      className={styles.contactChannelValue}
                      href={display.href}
                      {...(display.kind === 'external'
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
                      {display.label}
                    </a>
                  ) : (
                    <span className={styles.contactChannelValue}>
                      {display.label}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function PackageCard({
  wedding,
  onEditPackage,
  onShowPackageDetails,
}: {
  wedding: Wedding
  onEditPackage?: () => void
  onShowPackageDetails: () => void
}) {
  const pkg = getPackageSummary(wedding)
  const addOns = pkg.items.slice(0, 3)
  const moreCount = pkg.items.length - addOns.length

  return (
    <section
      className={styles.essentialCard}
      aria-labelledby="overview-package-title"
      data-testid="overview-package-card"
    >
      <div className={styles.overviewStateHeader}>
        <h2 id="overview-package-title" className={styles.sectionHeading}>
          Pakiet
        </h2>
        <div className={styles.overviewStateActions}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onShowPackageDetails}
          >
            Pokaż szczegóły
          </Button>
          {onEditPackage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEditPackage}
            >
              Edytuj pakiet
            </Button>
          ) : null}
        </div>
      </div>
      <p className={styles.contextStrong}>{pkg.name}</p>
      <p className={styles.contextMuted}>
        {[
          pkg.coverageShort !== '—' ? pkg.coverageShort : null,
          pkg.deliveryLabel !== '—' ? `oddanie ${pkg.deliveryLabel}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Brak szczegółów pokrycia'}
      </p>
      {addOns.length > 0 ? (
        <ul className={styles.packageEssentialsList}>
          {addOns.map((item) => (
            <li key={`${item.sortOrder}-${item.title}`}>{item.title}</li>
          ))}
          {moreCount > 0 ? (
            <li>
              <button
                type="button"
                className={styles.textAction}
                onClick={onShowPackageDetails}
              >
                +{moreCount} więcej
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}

function calendarGoogleLabel(state: string): string {
  switch (state) {
    case 'synced':
      return 'Zsynchronizowano'
    case 'pending':
    case 'syncing':
      return 'Oczekuje'
    case 'needs_attention':
      return 'Wymaga uwagi'
    case 'category_disabled':
      return 'Wyłączony dla ślubów'
    case 'omitted':
      return 'Pominięto'
    default:
      return 'Niepołączony'
  }
}

function calendarAppleLabel(state: string): string {
  switch (state) {
    case 'available':
      return 'Aktywny'
    case 'category_disabled':
      return 'Wyłączony dla ślubów'
    case 'omitted':
      return 'Pominięto'
    default:
      return 'Nieaktywny'
  }
}

function CalendarToneIcon({ tone }: { tone: 'ok' | 'warn' | 'neutral' }) {
  if (tone === 'ok') {
    return (
      <span className={styles.calendarToneOk} aria-hidden>
        <IconCheck width={14} height={14} />
      </span>
    )
  }
  if (tone === 'warn') {
    return (
      <span className={styles.calendarToneWarn} aria-hidden>
        !
      </span>
    )
  }
  return (
    <span className={styles.calendarToneNeutral} aria-hidden>
      <IconClock width={14} height={14} />
    </span>
  )
}

function CalendarCard({ weddingId }: { weddingId: string }) {
  const userId = useStudioAuthId()
  const { data, isLoading } = useQuery({
    queryKey: calendarIntegrationQueryKeys.entityStatus(
      userId,
      'wedding',
      weddingId,
    ),
    queryFn: () =>
      calendarIntegrationsService.getEntityStatus('wedding', weddingId),
    enabled: Boolean(userId && weddingId),
  })

  const googleState = data?.google.state ?? 'not_configured'
  const appleState = data?.apple.state ?? 'inactive'
  const googleTone: 'ok' | 'warn' | 'neutral' =
    googleState === 'synced'
      ? 'ok'
      : googleState === 'needs_attention'
        ? 'warn'
        : 'neutral'
  const appleTone: 'ok' | 'warn' | 'neutral' =
    appleState === 'available' ? 'ok' : 'neutral'

  return (
    <section
      className={styles.essentialCard}
      aria-labelledby="overview-calendars-title"
      data-testid="overview-calendars-card"
    >
      <div className={styles.overviewStateHeader}>
        <h2 id="overview-calendars-title" className={styles.sectionHeading}>
          Kalendarze
        </h2>
        <Link
          to="/ustawienia/integracje"
          className={styles.textAction}
          data-testid="overview-calendars-manage"
        >
          Zarządzaj integracjami
        </Link>
      </div>
      {isLoading || !data ? (
        <p className={styles.contextMuted}>Ładowanie statusu…</p>
      ) : (
        <ul className={styles.calendarStatusList}>
          <li className={styles.calendarStatusRow} data-state={googleState}>
            <span className={styles.calendarProvider}>Google Calendar</span>
            <span className={styles.calendarStatus}>
              <CalendarToneIcon tone={googleTone} />
              <span>{calendarGoogleLabel(googleState)}</span>
            </span>
          </li>
          <li className={styles.calendarStatusRow} data-state={appleState}>
            <span className={styles.calendarProvider}>Apple Calendar</span>
            <span className={styles.calendarStatus}>
              <CalendarToneIcon tone={appleTone} />
              <span>{calendarAppleLabel(appleState)}</span>
            </span>
          </li>
        </ul>
      )}
    </section>
  )
}
