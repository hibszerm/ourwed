/**
 * Google Routes → provider-independent RouteResult.
 * Keep in sync with supabase/functions/routes-proxy/normalize.ts
 */

export interface RouteResult {
  distanceMeters: number
  durationSeconds: number
  distanceLabel: string
  durationLabel: string
  encodedPolyline?: string
  provider: 'google'
}

export function parseDurationSeconds(raw: string | undefined): number {
  if (!raw) return 0
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw.trim())
  if (!m) return 0
  return Math.max(0, Math.round(Number(m[1])))
}

export function formatDistanceLabelPl(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m'
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  const rounded = Math.round(km * 10) / 10
  if (Number.isInteger(rounded)) return `${rounded} km`
  return `${rounded.toFixed(1).replace('.', ',')} km`
}

export function formatDurationLabelPl(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0 min'
  const totalMin = Math.max(0, Math.round(seconds / 60))
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h} godz. ${m} min` : `${h} godz.`
}

export function mapGoogleRouteToResult(route: {
  distanceMeters?: number
  duration?: string
  polyline?: { encodedPolyline?: string }
}): RouteResult {
  const distanceMeters = Math.max(0, Math.round(route.distanceMeters ?? 0))
  const durationSeconds = parseDurationSeconds(route.duration)
  const encoded = route.polyline?.encodedPolyline?.trim()
  return {
    distanceMeters,
    durationSeconds,
    distanceLabel: formatDistanceLabelPl(distanceMeters),
    durationLabel: formatDurationLabelPl(durationSeconds),
    encodedPolyline: encoded || undefined,
    provider: 'google',
  }
}
