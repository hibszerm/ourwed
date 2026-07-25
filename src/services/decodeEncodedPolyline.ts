/**
 * Decode Google Encoded Polyline Algorithm Format → lat/lng pairs.
 * UI-only — do not persist decoded arrays.
 *
 * Spec: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */

export interface LatLngLiteral {
  lat: number
  lng: number
}

export function decodeEncodedPolyline(encoded: string): LatLngLiteral[] {
  if (!encoded.trim()) return []

  const coordinates: LatLngLiteral[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1
    lat += deltaLat

    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1
    lng += deltaLng

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }

  return coordinates
}
