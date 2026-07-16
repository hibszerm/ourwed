import { LocationSearchField } from '@/features/travel/LocationSearchField'
import type { GeoPlace } from '@/types/travel'

interface PlacePickerProps {
  label: string
  value: string
  place?: GeoPlace | null
  disabled?: boolean
  placeholder?: string
  onChangeText: (text: string) => void
  onSelectPlace: (place: GeoPlace | null) => void
}

/** Studio / form wrapper around LocationSearchField. */
export function PlacePicker({
  label,
  value,
  place,
  disabled,
  placeholder,
  onChangeText,
  onSelectPlace,
}: PlacePickerProps) {
  return (
    <LocationSearchField
      label={label}
      value={value}
      place={place}
      disabled={disabled}
      placeholder={placeholder}
      onChangeText={onChangeText}
      onSelectPlace={onSelectPlace}
    />
  )
}
