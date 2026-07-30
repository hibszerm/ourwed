/**
 * Shared selected-place confirmation card (Wedding / Travel / Questionnaire).
 */

import { MapPin } from 'lucide-react'
import { getWeddingLocationDisplay } from '@/features/travel/weddingLocationModel'
import { googleMapsPlaceUrl } from '@/services/googleMapsLinks'
import type { GeoPlace } from '@/types/travel'
import styles from './SelectedLocationCard.module.css'

export interface SelectedLocationCardProps {
  place: GeoPlace
  /** When true, show “(ręcznie wpisany)”. */
  manual?: boolean
  onChange?: () => void
  changeLabel?: string
  showMapsLink?: boolean
  mapsLinkLabel?: string
  className?: string
}

export function isManualGeoPlace(place: GeoPlace | null | undefined): boolean {
  if (!place) return false
  if (place.placeId?.trim()) return false
  if (place.provider === 'google') return false
  return true
}

export function SelectedLocationCard({
  place,
  manual,
  onChange,
  changeLabel = 'Zmień',
  showMapsLink = false,
  mapsLinkLabel = 'Otwórz w Google Maps',
  className,
}: SelectedLocationCardProps) {
  const display = getWeddingLocationDisplay(place)
  const isManual = manual ?? isManualGeoPlace(place)
  const mapsUrl = showMapsLink ? googleMapsPlaceUrl(place) : null

  return (
    <div
      className={[styles.card, className].filter(Boolean).join(' ')}
      data-testid="selected-location-card"
      data-manual={isManual ? '1' : '0'}
    >
      <div className={styles.body}>
        <span className={styles.pin} aria-hidden="true">
          <MapPin size={16} strokeWidth={1.75} />
        </span>
        <div className={styles.text}>
          <p className={styles.primary}>{display.primary}</p>
          {display.secondary ? (
            <p className={styles.secondary}>{display.secondary}</p>
          ) : null}
          {isManual ? (
            <p className={styles.manualHint}>(ręcznie wpisany)</p>
          ) : null}
        </div>
      </div>
      <div className={styles.actions}>
        {mapsUrl ? (
          <a
            className={styles.mapsLink}
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="location-card-maps-link"
          >
            {mapsLinkLabel}
          </a>
        ) : null}
        {onChange ? (
          <button
            type="button"
            className={styles.changeBtn}
            onClick={onChange}
            data-testid="location-card-change"
          >
            {changeLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
