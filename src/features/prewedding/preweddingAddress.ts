/**
 * @deprecated Import from `./preweddingLocation` — GeoPlace is the shared location model.
 */
export {
  addressAnswerToPlainText,
  formatPreWeddingAnswerDisplay,
  googleMapsUrlForAddress,
  isAnswerEmpty,
  isPreWeddingAddressAnswer,
  locationAnswerToPlainText,
  formatLocationAnswerDisplay,
  googleMapsUrlForLocationAnswer,
  isStructuredLocationAnswer,
  isManualLocationAnswer,
  answerToGeoPlace,
  geoPlaceToAnswer,
} from './preweddingLocation'

/** @deprecated Legacy shape — answers now store GeoPlace. Kept for type narrowing of old JSON. */
export type PreWeddingAddressAnswer = {
  formattedAddress: string
  placeId: string | null
  name: string | null
  latitude: number | null
  longitude: number | null
  components?: {
    street?: string
    streetNumber?: string
    city?: string
    postalCode?: string
    country?: string
  }
  source: 'google_places' | 'manual'
}
