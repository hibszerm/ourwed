/**
 * Resolve which AddressAutocompleteProvider to use.
 * Active application uses Google Places only.
 *
 * Deprecated env values (geoapify / google_with_geoapify_fallback) map to Google
 * and will be removed after live verification cleanup.
 */

import type { AddressAutocompleteProvider } from '@/services/addressAutocompleteProvider'
import { createGooglePlacesAddressProvider } from '@/services/googlePlacesAddressProvider'

export type AddressProviderId = 'google'

/** @deprecated Geoapify modes removed from active runtime — always resolves to google. */
export type DeprecatedAddressProviderId =
  | 'geoapify'
  | 'google_with_geoapify_fallback'
  | 'current'

export const ADDRESS_PROVIDER_ENV_KEY = 'VITE_ADDRESS_PROVIDER'

export function readAddressProviderId(
  env: Record<string, string | undefined> = (
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env as Record<string, string | undefined>)
      : {}
  ),
): AddressProviderId {
  const raw = (env.VITE_ADDRESS_PROVIDER || env.ADDRESS_PROVIDER || 'google')
    .trim()
    .toLowerCase()
  // Deprecated rollback flags — ignore and use Google.
  if (
    raw === 'geoapify' ||
    raw === 'current' ||
    raw === 'google_with_geoapify_fallback' ||
    raw === 'google+geoapify'
  ) {
    return 'google'
  }
  return 'google'
}

export function resolveAddressAutocompleteProvider(
  _providerId: AddressProviderId = 'google',
): AddressAutocompleteProvider {
  void _providerId
  return createGooglePlacesAddressProvider()
}

/** One provider instance per AddressField / LocationSearchField mount. */
export function createDefaultAddressAutocompleteProvider(): AddressAutocompleteProvider {
  return resolveAddressAutocompleteProvider()
}
