import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { LocationSearchField } from '@/features/travel/LocationSearchField'
import {
  adaptLegacyWeddingLocationFields,
  didWeddingLocationRouteChange,
  weddingPlaceToGeoPlace,
} from '@/features/travel/weddingLocationModel'
import type { GeoPlace, WeddingPlace } from '@/types/travel'
import styles from '@/features/weddings/detail/editing/WeddingEditorFields.module.css'

export interface WeddingLocationEditorProps {
  /** Role / section title (e.g. Przyjęcie weselne). */
  roleLabel: string
  saved: WeddingPlace | null
  disabled?: boolean
  onSave: (place: GeoPlace | null) => void | Promise<void>
}

/**
 * Shared name + address editor for all Wedding location roles.
 * Name and address are independent; Places selection must not discard a venue name.
 */
export function WeddingLocationEditor({
  roleLabel,
  saved,
  disabled = false,
  onSave,
}: WeddingLocationEditorProps) {
  const adapted = adaptLegacyWeddingLocationFields({
    label: saved?.label,
    formattedAddress: saved?.formattedAddress,
  })
  const [name, setName] = useState(adapted.name ?? '')
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)
  const [place, setPlace] = useState<GeoPlace | null>(() =>
    weddingPlaceToGeoPlace(saved),
  )
  const [addressDraft, setAddressDraft] = useState(
    adapted.formattedAddress ?? '',
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const next = adaptLegacyWeddingLocationFields({
      label: saved?.label,
      formattedAddress: saved?.formattedAddress,
    })
    setName(next.name ?? '')
    setNameManuallyEdited(false)
    setPlace(weddingPlaceToGeoPlace(saved))
    setAddressDraft(next.formattedAddress ?? '')
    setError(null)
  }, [saved?.id, saved?.label, saved?.formattedAddress, saved?.placeId, saved?.latitude, saved?.longitude])

  async function persist(next: {
    name: string
    place: GeoPlace | null
    addressText: string
  }) {
    const trimmedName = next.name.trim()
    const address =
      next.place?.formattedAddress?.trim() || next.addressText.trim() || ''

    if (!trimmedName && !address && !next.place?.placeId) {
      setError(null)
      await onSave(null)
      return
    }

    if (!trimmedName && !address) {
      setError('Podaj nazwę miejsca lub adres.')
      return
    }

    const geo: GeoPlace = {
      placeId: next.place?.placeId ?? null,
      formattedAddress: address,
      latitude: next.place?.latitude ?? null,
      longitude: next.place?.longitude ?? null,
      label: trimmedName || null,
      provider: next.place?.provider ?? null,
    }

    setError(null)
    await onSave(geo)
  }

  return (
    <div
      className={styles.locationEditor}
      data-testid="wedding-location-editor"
      aria-label={roleLabel}
    >
      <p className={styles.sectionTitle}>{roleLabel}</p>
      <div className={styles.fieldGrid}>
        <Input
          label="Nazwa miejsca"
          value={name}
          disabled={disabled}
          placeholder="np. Villa Love"
          onChange={(e) => {
            setNameManuallyEdited(true)
            setName(e.target.value)
          }}
          onBlur={() => {
            void persist({
              name,
              place,
              addressText: addressDraft,
            })
          }}
        />
        <LocationSearchField
          label="Adres"
          value={addressDraft}
          place={place}
          disabled={disabled}
          compactDisplay={false}
          preserveName={name}
          nameManuallyEdited={nameManuallyEdited}
          commitTypedOnBlur
          placeholder="Zacznij wpisywać adres lub nazwę miejsca…"
          onChangeText={(text) => {
            setAddressDraft(text)
            // Manual address edit clears geocoding until a suggestion is picked.
            if (
              place &&
              text.trim() !== (place.formattedAddress || '').trim()
            ) {
              setPlace({
                ...place,
                placeId: null,
                latitude: null,
                longitude: null,
                formattedAddress: text,
                label: name.trim() || place.label,
              })
            }
          }}
          onSelectPlace={async (selected) => {
            if (!selected) {
              setPlace(null)
              setAddressDraft('')
              await persist({
                name,
                place: null,
                addressText: '',
              })
              return
            }

            const nextName = nameManuallyEdited
              ? name
              : selected.label?.trim() || name
            if (!nameManuallyEdited && selected.label?.trim()) {
              setName(selected.label.trim())
            }
            const nextPlace: GeoPlace = {
              ...selected,
              label: nextName.trim() || selected.label || null,
            }
            setPlace(nextPlace)
            setAddressDraft(selected.formattedAddress)
            await persist({
              name: nextName,
              place: nextPlace,
              addressText: selected.formattedAddress,
            })
          }}
        />
      </div>
      {place &&
      addressDraft.trim() &&
      (place.latitude == null || place.longitude == null) ? (
        <p className={styles.muted}>
          Adres wymaga weryfikacji, zanim będzie można obliczyć trasę.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {/* Expose route-change helper for save callers via data attribute tests */}
      <span
        hidden
        data-route-changed={
          didWeddingLocationRouteChange(saved, place) ? '1' : '0'
        }
      />
    </div>
  )
}
