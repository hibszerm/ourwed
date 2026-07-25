import { Button } from '@/components/ui/Button'
import { IconMail, IconPhone } from '@/components/icons'
import {
  getContactSections,
  getPackageSummary,
  getReceptionPlace,
} from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import { buildGoogleMapsNavigationUrl } from '@/services/googleMapsLinks'
import { formatCurrency } from '@/lib/utils/currency'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingContextSidebarProps {
  wedding: Wedding
  places: WeddingPlace[]
  contacts?: { id: string; name: string; role?: string }[]
  onEditLocations: () => void
  onShowPackageDetails: () => void
}

export function WeddingContextSidebar({
  wedding,
  places,
  contacts = [],
  onEditLocations,
  onShowPackageDetails,
}: WeddingContextSidebarProps) {
  const reception = getReceptionPlace(wedding, places)
  const partners = getContactSections(wedding.couple)
  const pkg = getPackageSummary(wedding)
  const paidPct =
    pkg.contractValue > 0
      ? Math.min(100, Math.round((pkg.totalPaid / pkg.contractValue) * 100))
      : 0
  const navUrl = !reception.empty
    ? buildGoogleMapsNavigationUrl({
        placeId: reception.placeId,
        latitude: reception.latitude,
        longitude: reception.longitude,
        formattedAddress: reception.address,
      })
    : null

  return (
    <aside
      className={styles.contextSidebar}
      aria-label="Kontekst zlecenia"
      data-testid="wedding-context-sidebar"
    >
      <div className={styles.contextPanel}>
        <section className={styles.contextBlock}>
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

        <section className={styles.contextBlock}>
          <h3 className={styles.contextHeading}>Kontakt</h3>
          {partners.map((p) => (
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
                {p.email ? (
                  <a href={`mailto:${p.email}`}>
                    <IconMail width={12} height={12} aria-hidden />
                    {p.email}
                  </a>
                ) : null}
              </div>
            </div>
          ))}
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

        <section className={styles.contextBlock}>
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
        </section>

        <section className={styles.contextBlock}>
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
      </div>
    </aside>
  )
}
