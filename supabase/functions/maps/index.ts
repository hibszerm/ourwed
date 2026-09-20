/**
 * Supabase Edge Function: maps
 *
 * Proxies Google Places (New), Geocoding, and Routes APIs.
 * Secret: GOOGLE_MAPS_API_KEY (never expose via VITE_*).
 *
 * Deploy: supabase functions deploy maps --no-verify-jwt (or with JWT)
 * Invoke: POST /functions/v1/maps  { action, ... }
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Action = 'autocomplete' | 'placeDetails' | 'geocode' | 'route'

interface LatLng {
  latitude: number
  longitude: number
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`
}

function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h} godz. ${m} min` : `${h} godz.`
}

function parseDurationSeconds(duration: string | undefined): number {
  if (!duration) return 0
  // Routes API returns e.g. "1234s"
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration)
  if (match) return Math.round(Number(match[1]))
  return 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!apiKey) {
    return json(
      { error: 'GOOGLE_MAPS_API_KEY is not configured on the Edge Function.' },
      500,
    )
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const action = body.action as Action

    if (action === 'autocomplete') {
      const input = String(body.input ?? '').trim()
      if (!input) return json({ suggestions: [] })

      const res = await fetch(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
          },
          body: JSON.stringify({
            input,
            languageCode: 'pl',
            includedRegionCodes: ['pl'],
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        return json(
          { error: data?.error?.message ?? 'Places autocomplete failed.' },
          res.status,
        )
      }

      const suggestions = (data.suggestions ?? [])
        .map((s: {
          placePrediction?: {
            placeId?: string
            structuredFormat?: {
              mainText?: { text?: string }
              secondaryText?: { text?: string }
            }
            text?: { text?: string }
          }
        }) => {
          const p = s.placePrediction
          if (!p?.placeId) return null
          return {
            placeId: p.placeId,
            primaryText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
            secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
            fullText: p.text?.text ?? '',
          }
        })
        .filter(Boolean)

      return json({ suggestions })
    }

    if (action === 'placeDetails') {
      const placeId = String(body.placeId ?? '').trim()
      if (!placeId) return json({ error: 'placeId is required.' }, 400)

      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'id,formattedAddress,location,displayName',
          },
        },
      )
      const data = await res.json()
      if (!res.ok) {
        return json(
          { error: data?.error?.message ?? 'Place details failed.' },
          res.status,
        )
      }

      return json({
        place: {
          placeId: data.id ?? placeId,
          formattedAddress: data.formattedAddress ?? '',
          latitude: data.location?.latitude ?? null,
          longitude: data.location?.longitude ?? null,
          label: data.displayName?.text ?? null,
        },
      })
    }

    if (action === 'geocode') {
      const address = String(body.address ?? '').trim()
      if (!address) return json({ error: 'address is required.' }, 400)

      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
      url.searchParams.set('address', address)
      url.searchParams.set('language', 'pl')
      url.searchParams.set('region', 'pl')
      url.searchParams.set('key', apiKey)

      const res = await fetch(url)
      const data = await res.json()
      if (data.status !== 'OK' || !data.results?.[0]) {
        return json(
          {
            error:
              data.error_message ||
              data.status ||
              'Geocoding returned no results.',
          },
          400,
        )
      }

      const result = data.results[0]
      return json({
        place: {
          placeId: result.place_id ?? null,
          formattedAddress: result.formatted_address ?? address,
          latitude: result.geometry?.location?.lat ?? null,
          longitude: result.geometry?.location?.lng ?? null,
          label: null,
        },
      })
    }

    if (action === 'route') {
      const origin = body.origin as LatLng | undefined
      const destination = body.destination as LatLng | undefined
      const travelMode = String(body.travelMode ?? 'DRIVE')

      if (
        !origin ||
        !destination ||
        typeof origin.latitude !== 'number' ||
        typeof origin.longitude !== 'number' ||
        typeof destination.latitude !== 'number' ||
        typeof destination.longitude !== 'number'
      ) {
        return json({ error: 'origin and destination lat/lng are required.' }, 400)
      }

      const res = await fetch(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters',
          },
          body: JSON.stringify({
            origin: {
              location: {
                latLng: {
                  latitude: origin.latitude,
                  longitude: origin.longitude,
                },
              },
            },
            destination: {
              location: {
                latLng: {
                  latitude: destination.latitude,
                  longitude: destination.longitude,
                },
              },
            },
            travelMode,
            languageCode: 'pl',
            units: 'METRIC',
          }),
        },
      )

      const data = await res.json()
      if (!res.ok) {
        return json(
          { error: data?.error?.message ?? 'Routes API failed.' },
          res.status,
        )
      }

      const route = data.routes?.[0]
      if (!route) {
        return json({ error: 'No route found.' }, 404)
      }

      const distanceMeters = Number(route.distanceMeters ?? 0)
      const durationSeconds = parseDurationSeconds(route.duration)

      return json({
        leg: {
          distanceMeters,
          distanceText: formatDistance(distanceMeters),
          durationSeconds,
          durationText: formatDuration(durationSeconds),
          travelMode,
        },
      })
    }

    return json({ error: `Unknown action: ${String(action)}` }, 400)
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : 'Maps proxy failed.',
      },
      500,
    )
  }
})
