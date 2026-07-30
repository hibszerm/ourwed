import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { IconMail, IconPhone } from '@/components/icons'
import {
  getContactSections,
  getPackageSummary,
  getReceptionPlace,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { WeddingCorrespondenceBlock } from '@/features/weddings/detail/v2/WeddingCorrespondenceBlock'
import { EntityCalendarStatus } from '@/features/calendar-integrations'
import { useAuth } from '@/features/auth/AuthProvider'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { formatSessionType } from '@/features/sessions/presentation/sessionType'
import { sessionService } from '@/lib/api/sessionService'
import { buildGoogleMapsNavigationUrl } from '@/services/googleMapsLinks'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingContextSidebarProps {
  wedding: Wedding
  places: WeddingPlace[]
  contacts?: { id: string; name: string; role?: string }[]
  onEditLocations: () => void
  onEditContacts?: () => void
  onEditPackage?: () => void
  onShowPackageDetails: () => void
}

export function WeddingContextSidebar({
  wedding,
  places,
  contacts = [],
  onEditLocations,
  onEditContacts,
  onEditPackage,
  onShowPackageDetails,
}: WeddingContextSidebarProps) {
  const { user } = useAuth()
  const { data: linkedSessions = [] } = useQuery({
    queryKey: ['sessions', user?.id, 'by-wedding', wedding.id],
    queryFn: () => sessionService.listByWeddingId(wedding.id),
    enabled: Boolean(user?.id && wedding.id),
  })
  const reception = getReceptionPlace(wedding, places)
  const partners = getContactSections(wedding.couple)
  const pkg = getPackageSummary(wedding)
  const correspondenceEmails = new Set(
    (wedding.correspondence ?? [])
      .filter((e) => e.channel === 'email')
      .map((e) => e.value.trim().toLowerCase())
      .filter(Boolean),
  )
  const paidPct =
    pkg.contractValue > 0
      ? Math.min(100, Math.round((pkg.totalPaid / pkg.contractValue) * 100))
      : 0
  const navUrl = !reception.empty
    ? buildGoogleMapsNavigationUrl({
        formattedAddress: reception.address,
        label: reception.placeName,
        placeId: reception.placeId,
        latitude: reception.latitude,
        longitude: reception.longitude,
      })
    : null

  return (
    <aside
      className={styles.contextSidebar}
      aria-label="Kontekst zlecenia"
      data-testid="wedding-context-sidebar"
    >
      <div className={styles.contextPanel}>
        <section
          className={styles.contextBlock}
          data-testid="sidebar-location"
        >
          <h3 className={styles.contextHeading}>Przyjęcie weselne</h3>
          <p className={styles.contextStrong}>
            {reception.placeName ||
              reception.address ||
              'Miejsce przyjęcia nieuzupełnione'}
          </p>
          {reception.placeName && reception.address ? (
            <p className={styles.contextMuted}>{reception.address}</p>
          ) : null}
          <div className={styles.contextActions}>
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
            <button
              type="button"
              className={styles.textAction}
              onClick={onEditLocations}
            >
              Edytuj
            </button>
          </div>
        </section>

        <section className={styles.contextBlock} data-testid="sidebar-couple">
          <h3 className={styles.contextHeading}>Para</h3>
          {partners.map((p) => {
            const partnerEmail = p.email?.trim().toLowerCase() || null
            const hideEmail = Boolean(
              partnerEmail && correspondenceEmails.has(partnerEmail),
            )
            return (
              <div key={p.title} className={styles.contextPartner}>
                <p className={styles.contextRole}>{p.title}</p>
                <p className={styles.contextStrong}>{p.name}</p>
                <div className={styles.contextLinks}>
                  {p.phone ? (
                    <a href={`tel:${p.phone}`}>
                      <IconPhone width={12} height={12} aria-hidden />
                      {p.phone}
                    </a>
                  ) : null}
                  {p.email && !hideEmail ? (
                    <a href={`mailto:${p.email}`}>
                      <IconMail width={12} height={12} aria-hidden />
                      {p.email}
                    </a>
                  ) : null}
                </div>
                {p.address ? (
                  <p
                    className={styles.contextMuted}
                    data-testid="sidebar-contract-address"
                  >
                    {p.address}
                  </p>
                ) : null}
              </div>
            )
          })}
          <WeddingCorrespondenceBlock
            correspondence={wedding.correspondence}
            onEdit={onEditContacts}
          />
          {onEditContacts ? (
            <button
              type="button"
              className={styles.textAction}
              onClick={onEditContacts}
            >
              Edytuj dane pary
            </button>
          ) : null}
          {contacts.filter((c) => c.name?.trim()).length > 0 ? (
            <div className={styles.contextPartner}>
              <p className={styles.contextRole}>Dodatkowe</p>
              {contacts
                .filter((c) => c.name?.trim())
                .map((c) => (
                  <p key={c.id} className={styles.contextMuted}>
                    {c.name}
                    {c.role ? ` · ${c.role}` : ''}
                  </p>
                ))}
            </div>
          ) : null}
        </section>

        <section className={styles.contextBlock} data-testid="sidebar-finance">
          <h3 className={styles.contextHeading}>Finanse</h3>
          <p className={styles.contextMuted}>
            {formatCurrency(pkg.totalPaid)} z {pkg.contractValueLabel} wpłacone
          </p>
          <div
            className={styles.miniProgress}
            role="progressbar"
            aria-valuenow={paidPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={styles.miniProgressFill}
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <p className={styles.contextStrong}>
            Pozostało: {formatCurrency(pkg.remainingToPay)}
          </p>
        </section>

        <section className={styles.contextBlock} data-testid="sidebar-package">
          <h3 className={styles.contextHeading}>Pakiet</h3>
          <p className={styles.contextStrong}>{pkg.name}</p>
          <p className={styles.contextValue}>{pkg.contractValueLabel}</p>
          <p className={styles.contextMuted}>
            {pkg.coverageShort} · {pkg.overtimeLabel} / nadgodzina · oddanie:{' '}
            {pkg.deliveryLabel}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onShowPackageDetails}
          >
            Pokaż szczegóły
          </Button>
          {onEditPackage ? (
            <button
              type="button"
              className={styles.textAction}
              onClick={onEditPackage}
            >
              Edytuj pakiet
            </button>
          ) : null}
        </section>

        {linkedSessions.length > 0 ? (
          <section
            className={styles.contextBlock}
            data-testid="sidebar-sessions"
          >
            <h3 className={styles.contextHeading}>Powiązane sesje</h3>
            <ul className={styles.linkedSessionList}>
              {linkedSessions.map((session) => (
                <li key={session.id}>
                  <Link
                    to={`/sesje/${session.id}`}
                    className={styles.linkedSessionLink}
                  >
                    <span className={styles.contextStrong}>
                      {getSessionDisplayName(session)}
                    </span>
                    <span className={styles.contextMuted}>
                      {formatSessionType(session)} ·{' '}
                      {formatDate(session.date, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <EntityCalendarStatus entityType="wedding" entityId={wedding.id} />
      </div>
    </aside>
  )
}
