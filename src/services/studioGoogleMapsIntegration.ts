/**
 * Future: studio-scoped Google Maps integration (Ustawienia → Integracje).
 *
 * Keys must never be stored as plaintext in public tables or returned to the browser.
 * Use Supabase Vault / encrypted secret_reference only.
 */

export type GoogleMapsIntegrationProvider = 'google_maps'

export interface StudioGoogleMapsIntegrationStatus {
  configured: boolean
  enabled: boolean
  maskedSuffix: string | null
  lastTestedAt: string | null
  lastTestStatus: 'ok' | 'failed' | 'never' | null
}

export interface StudioGoogleMapsIntegrationRecord {
  /** Owning studio user (auth.users / studio_details.user_id). */
  studioUserId: string
  provider: GoogleMapsIntegrationProvider
  enabled: boolean
  /** Opaque reference to Vault / secret store — never the raw key. */
  secretReference: string | null
  maskedKeySuffix: string | null
  createdAt: string
  updatedAt: string
  lastTestedAt: string | null
  lastTestStatus: 'ok' | 'failed' | 'never' | null
}

/**
 * Service boundary for future settings UI.
 * Implementations must run server-side (Edge Function) so decrypted keys never reach the browser.
 */
export interface StudioGoogleMapsIntegrationService {
  getGoogleMapsIntegrationStatus(
    studioUserId: string,
  ): Promise<StudioGoogleMapsIntegrationStatus>
  saveGoogleMapsKey(
    studioUserId: string,
    apiKey: string,
  ): Promise<StudioGoogleMapsIntegrationStatus>
  testGoogleMapsConnection(
    studioUserId: string,
  ): Promise<StudioGoogleMapsIntegrationStatus>
  removeGoogleMapsKey(
    studioUserId: string,
  ): Promise<StudioGoogleMapsIntegrationStatus>
}

/** Placeholder until Integracje settings ship. */
export const unsupportedStudioGoogleMapsIntegrationService: StudioGoogleMapsIntegrationService =
  {
    async getGoogleMapsIntegrationStatus() {
      return {
        configured: false,
        enabled: false,
        maskedSuffix: null,
        lastTestedAt: null,
        lastTestStatus: 'never',
      }
    },
    async saveGoogleMapsKey() {
      throw new Error(
        'Studio Google Maps keys are not available yet. Use the application GOOGLE_MAPS_API_KEY secret.',
      )
    },
    async testGoogleMapsConnection() {
      throw new Error('Studio Google Maps connection test is not available yet.')
    },
    async removeGoogleMapsKey() {
      throw new Error('Studio Google Maps key removal is not available yet.')
    },
  }
