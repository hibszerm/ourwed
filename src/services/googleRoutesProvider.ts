/**
 * Google Routes client — calls routes-proxy Edge Function.
 * Server secret stays on the Edge Function; never shipped to the browser.
 */

import type { RouteResult } from '@/services/googleRoutesNormalize'

export const ROUTES_PROXY_FUNCTION = 'routes-proxy'

export type RouteTravelMode = 'DRIVE' | 'WALK' | 'BICYCLE' | 'TWO_WHEELER'

export interface RouteEndpointInput {
  latitude?: number
  longitude?: number
  placeId?: string | null
  address?: string | null
}

export class GoogleRoutesProviderError extends Error {
  readonly code: 'provider_error' | 'bad_request' | 'network' | 'aborted'

  constructor(
    message: string,
    code: GoogleRoutesProviderError['code'] = 'provider_error',
  ) {
    super(message)
    this.name = 'GoogleRoutesProviderError'
    this.code = code
  }
}

const USER_HINT =
  'Nie udało się wyliczyć trasy. Spróbuj ponownie lub sprawdź lokalizacje.'

async function invokeRoutes(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase.functions.invoke(ROUTES_PROXY_FUNCTION, {
    body,
    ...(signal ? { signal } : {}),
  })
  if (error) {
    if (signal?.aborted || (error as { name?: string }).name === 'AbortError') {
      throw new GoogleRoutesProviderError('Aborted', 'aborted')
    }
    throw new GoogleRoutesProviderError(USER_HINT, 'provider_error')
  }
  return data
}

export interface ComputeRouteOptions {
  origin: RouteEndpointInput
  destination: RouteEndpointInput
  travelMode?: RouteTravelMode
  waypoints?: RouteEndpointInput[]
  signal?: AbortSignal
  /** Test inject. */
  invoke?: typeof invokeRoutes
}

export async function computeGoogleRoute(
  options: ComputeRouteOptions,
): Promise<RouteResult> {
  const invoke = options.invoke ?? invokeRoutes
  const data = (await invoke(
    {
      operation: 'computeRoute',
      origin: {
        latitude: options.origin.latitude,
        longitude: options.origin.longitude,
        placeId: options.origin.placeId ?? undefined,
        address: options.origin.address ?? undefined,
      },
      destination: {
        latitude: options.destination.latitude,
        longitude: options.destination.longitude,
        placeId: options.destination.placeId ?? undefined,
        address: options.destination.address ?? undefined,
      },
      travelMode: options.travelMode ?? 'DRIVE',
      ...(options.waypoints?.length
        ? {
            waypoints: options.waypoints.map((w) => ({
              latitude: w.latitude,
              longitude: w.longitude,
              placeId: w.placeId ?? undefined,
              address: w.address ?? undefined,
            })),
          }
        : {}),
    },
    options.signal,
  )) as { ok?: boolean; route?: RouteResult }

  if (!data?.ok || !data.route) {
    throw new GoogleRoutesProviderError(USER_HINT, 'provider_error')
  }

  return {
    ...data.route,
    provider: 'google',
  }
}
