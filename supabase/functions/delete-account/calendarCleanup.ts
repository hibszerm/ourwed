/**
 * Calendar cleanup for account erasure.
 *
 * Remote Google OAuth revoke: BEST-EFFORT (failures may continue).
 * Local OurWed credential clear: MANDATORY (failures MUST stop pipeline).
 */

export class CalendarLocalCleanupError extends Error {
  readonly code = 'CALENDAR_LOCAL_CLEANUP_FAILED' as const
  constructor(message: string) {
    super(message)
    this.name = 'CalendarLocalCleanupError'
  }
}

export type CalendarSecretRow = {
  refresh_token_enc: string | null
  access_token_enc: string | null
}

export type CalendarIntegrationRow = {
  id: string
  provider: string
}

export interface CalendarCleanupDb {
  findGoogleIntegration(
    userId: string,
  ): Promise<CalendarIntegrationRow | null>
  loadGoogleSecret(
    integrationId: string,
  ): Promise<CalendarSecretRow | null>
  deleteGoogleSecret(integrationId: string): Promise<{ error?: string }>
  clearGoogleIntegration(integrationId: string): Promise<{ error?: string }>
  clearAppleIntegration(userId: string): Promise<{ error?: string }>
  /** Belt-and-suspenders: wipe any remaining secrets for this auth user. */
  deleteAllSecretsForUser(userId: string): Promise<{ error?: string }>
}

export type CalendarCleanupDeps = {
  db: CalendarCleanupDb
  /** Try decrypt candidates in order (dedicated, then legacy). */
  decryptSecretWithKeys: (enc: string, keys: string[]) => Promise<string>
  resolveDecryptKeys: () => string[]
  revokeGoogleToken: (token: string) => Promise<void>
  /** Optional logger — must not log tokens or ciphertext. */
  log?: (event: Record<string, unknown>) => void
}

/**
 * Best-effort remote revoke, then mandatory local credential invalidation.
 * Throws CalendarLocalCleanupError if local DB clear fails.
 */
export async function cleanupCalendarCredentials(
  userId: string,
  deps: CalendarCleanupDeps,
): Promise<{ remoteRevokeAttempted: boolean; remoteRevokeOk: boolean }> {
  let remoteRevokeAttempted = false
  let remoteRevokeOk = false

  const google = await deps.db.findGoogleIntegration(userId)
  if (google?.id) {
    const secret = await deps.db.loadGoogleSecret(google.id)
    if (secret) {
      let token: string | null = null
      try {
        const keys = deps.resolveDecryptKeys()
        if (secret.refresh_token_enc) {
          token = await deps.decryptSecretWithKeys(
            secret.refresh_token_enc,
            keys,
          )
        } else if (secret.access_token_enc) {
          token = await deps.decryptSecretWithKeys(
            secret.access_token_enc,
            keys,
          )
        }
      } catch {
        token = null
      }
      if (token) {
        remoteRevokeAttempted = true
        try {
          await deps.revokeGoogleToken(token)
          remoteRevokeOk = true
        } catch (err) {
          deps.log?.({
            scope: 'delete-account',
            step: 'google_remote_revoke',
            ok: false,
            reason: err instanceof Error ? err.message : 'unknown',
          })
        }
      }
    }

    const delSecret = await deps.db.deleteGoogleSecret(google.id)
    if (delSecret.error) {
      throw new CalendarLocalCleanupError(
        `google_secret_delete_failed:${delSecret.error}`,
      )
    }

    const clearGoogle = await deps.db.clearGoogleIntegration(google.id)
    if (clearGoogle.error) {
      throw new CalendarLocalCleanupError(
        `google_integration_clear_failed:${clearGoogle.error}`,
      )
    }
  }

  const clearApple = await deps.db.clearAppleIntegration(userId)
  if (clearApple.error) {
    throw new CalendarLocalCleanupError(
      `apple_integration_clear_failed:${clearApple.error}`,
    )
  }

  const wipe = await deps.db.deleteAllSecretsForUser(userId)
  if (wipe.error) {
    throw new CalendarLocalCleanupError(
      `secrets_user_wipe_failed:${wipe.error}`,
    )
  }

  return { remoteRevokeAttempted, remoteRevokeOk }
}
