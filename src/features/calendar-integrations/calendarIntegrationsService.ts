import { supabase } from '@/lib/supabase'
import { resolveStudioUserId } from '@/lib/api/studioUser'
import type {
  AppleIntegrationView,
  CalendarIntegrationRow,
  CalendarIntegrationsSnapshot,
  EntityCalendarStatusView,
  GoogleIntegrationView,
  GoogleSyncNowResult,
  WritableGoogleCalendar,
} from '@/features/calendar-integrations/types'
import { devInfoArgs } from '@/lib/debug/devConsole'

function mapGoogle(row: CalendarIntegrationRow | null): GoogleIntegrationView {
  if (!row || row.provider !== 'google') {
    return {
      provider: 'google',
      connected: false,
      enabled: false,
      accountEmail: null,
      calendarId: null,
      calendarName: null,
      syncWeddings: true,
      syncSessions: true,
      backfillMode: 'future',
      connectedAt: null,
      revokedAt: null,
      lastSyncAt: null,
      lastErrorCode: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      needsReconnect: false,
      needsCalendarAttention: false,
    }
  }

  const needsReconnect =
    Boolean(row.google_revoked_at) ||
    row.last_error_code === 'google_revoked' ||
    row.last_error_code === 'google_auth_expired'

  const needsCalendarAttention =
    row.last_error_code === 'calendar_unavailable' ||
    row.last_error_code === 'calendar_not_writable'

  return {
    provider: 'google',
    connected: Boolean(row.google_connected_at) && !needsReconnect,
    enabled: row.enabled,
    accountEmail: row.google_account_email,
    calendarId: row.google_calendar_id,
    calendarName: row.google_calendar_name,
    syncWeddings: row.sync_weddings,
    syncSessions: row.sync_sessions,
    backfillMode: row.backfill_mode,
    connectedAt: row.google_connected_at,
    revokedAt: row.google_revoked_at,
    lastSyncAt: row.last_sync_at,
    lastErrorCode: row.last_error_code,
    lastErrorAt: row.last_error_at,
    lastErrorMessage: row.last_error_message,
    needsReconnect,
    needsCalendarAttention,
  }
}

function maskSubscriptionUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url.replace(/^webcal:/i, 'https:'))
    const parts = parsed.pathname.split('/').filter(Boolean)
    const tokenIdx = parts.findIndex((p) => p.length > 20)
    if (tokenIdx >= 0) {
      const token = parts[tokenIdx]
      const masked =
        token.slice(0, 4) + '…' + token.slice(Math.max(4, token.length - 4))
      parts[tokenIdx] = masked
      parsed.pathname = '/' + parts.join('/')
    }
    return parsed.toString().replace(/^https:/i, 'webcal:')
  } catch {
    return 'webcal://••••/ourwed.ics'
  }
}

function mapApple(
  row: CalendarIntegrationRow | null,
  subscriptionUrl: string | null = null,
): AppleIntegrationView {
  if (!row || row.provider !== 'apple') {
    return {
      provider: 'apple',
      active: false,
      enabled: false,
      syncWeddings: true,
      syncSessions: true,
      backfillMode: 'future',
      subscriptionUrl: null,
      maskedUrl: null,
      tokenCreatedAt: null,
      tokenRotatedAt: null,
      feedEtag: null,
      lastSyncAt: null,
    }
  }

  const active = row.enabled && Boolean(row.apple_token_hash)
  return {
    provider: 'apple',
    active,
    enabled: row.enabled,
    syncWeddings: row.sync_weddings,
    syncSessions: row.sync_sessions,
    backfillMode: row.backfill_mode,
    subscriptionUrl,
    maskedUrl: maskSubscriptionUrl(subscriptionUrl),
    tokenCreatedAt: row.apple_token_created_at,
    tokenRotatedAt: row.apple_token_rotated_at,
    feedEtag: row.apple_feed_etag,
    lastSyncAt: row.last_sync_at,
  }
}

async function invokeCalendarApi<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  })
  if (error) {
    let message = error.message
    try {
      const ctx = error as { context?: Response }
      if (ctx.context && typeof ctx.context.json === 'function') {
        const payload = (await ctx.context.json()) as {
          error?: { message?: string }
        }
        if (payload?.error?.message) message = payload.error.message
      }
    } catch {
      // keep default
    }
    throw new Error(message)
  }
  if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
    const err = data as { error?: { message?: string } }
    throw new Error(err.error?.message ?? 'Operacja kalendarza nie powiodła się.')
  }
  return data as T
}

export const calendarIntegrationsService = {
  async getSnapshot(): Promise<CalendarIntegrationsSnapshot> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error

    const rows = (data ?? []) as CalendarIntegrationRow[]
    const googleRow = rows.find((r) => r.provider === 'google') ?? null
    const appleRow = rows.find((r) => r.provider === 'apple') ?? null

    return {
      google: mapGoogle(googleRow),
      apple: mapApple(appleRow, null),
    }
  },

  async startGoogleOAuth(
    redirectPath = '/ustawienia/integracje',
    backfillMode: 'future' | 'all_active' = 'future',
  ): Promise<{
    url: string
  }> {
    return invokeCalendarApi('google-calendar-oauth', {
      action: 'start',
      redirectPath,
      backfillMode,
    })
  },

  async listWritableGoogleCalendars(): Promise<WritableGoogleCalendar[]> {
    const result = await invokeCalendarApi<{
      calendars: WritableGoogleCalendar[]
    }>('google-calendar-sync', { action: 'list_calendars' })
    return result.calendars ?? []
  },

  async updateGoogleSettings(input: {
    calendarId?: string
    calendarName?: string | null
    syncWeddings?: boolean
    syncSessions?: boolean
    backfillMode?: 'future' | 'all_active'
    enabled?: boolean
  }): Promise<CalendarIntegrationsSnapshot> {
    const result = await invokeCalendarApi<{
      snapshot: CalendarIntegrationsSnapshot
    }>('google-calendar-sync', {
      action: 'update_settings',
      ...input,
    })
    return result.snapshot
  },

  async syncGoogleNow(): Promise<GoogleSyncNowResult> {
    const result = await invokeCalendarApi<{ result: GoogleSyncNowResult }>(
      'google-calendar-sync',
      { action: 'sync_now' },
    )
    return result.result
  },

  async disconnectGoogle(options: {
    removeEvents: boolean
  }): Promise<CalendarIntegrationsSnapshot> {
    const result = await invokeCalendarApi<{
      snapshot: CalendarIntegrationsSnapshot
    }>('google-calendar-sync', {
      action: 'disconnect',
      removeEvents: options.removeEvents,
    })
    return result.snapshot
  },

  async activateApple(input?: {
    syncWeddings?: boolean
    syncSessions?: boolean
    backfillMode?: 'future' | 'all_active'
  }): Promise<AppleIntegrationView> {
    const result = await invokeCalendarApi<{
      apple: AppleIntegrationView
    }>('google-calendar-sync', {
      action: 'apple_activate',
      ...input,
    })
    return result.apple
  },

  async updateAppleSettings(input: {
    syncWeddings?: boolean
    syncSessions?: boolean
    backfillMode?: 'future' | 'all_active'
  }): Promise<AppleIntegrationView> {
    const result = await invokeCalendarApi<{
      apple: AppleIntegrationView
    }>('google-calendar-sync', {
      action: 'apple_update_settings',
      ...input,
    })
    return result.apple
  },

  async rotateAppleToken(): Promise<AppleIntegrationView> {
    const result = await invokeCalendarApi<{
      apple: AppleIntegrationView
    }>('google-calendar-sync', { action: 'apple_rotate' })
    return result.apple
  },

  async disableApple(): Promise<AppleIntegrationView> {
    const result = await invokeCalendarApi<{
      apple: AppleIntegrationView
    }>('google-calendar-sync', { action: 'apple_disable' })
    return result.apple
  },

  async refreshAppleFeedMeta(): Promise<AppleIntegrationView> {
    const result = await invokeCalendarApi<{
      apple: AppleIntegrationView
    }>('google-calendar-sync', { action: 'apple_refresh_meta' })
    return result.apple
  },

  async getEntityStatus(
    entityType: 'wedding' | 'session',
    entityId: string,
  ): Promise<EntityCalendarStatusView> {
    const result = await invokeCalendarApi<{
      status: EntityCalendarStatusView
    }>('google-calendar-sync', {
      action: 'entity_status',
      entityType,
      entityId,
    })
    return result.status
  },

  async retryEntitySync(
    entityType: 'wedding' | 'session',
    entityId: string,
  ): Promise<void> {
    await invokeCalendarApi('google-calendar-sync', {
      action: 'enqueue_entity',
      entityType,
      entityId,
      operation: 'upsert',
    })
  },

  async reconcileGoogleDuplicates(): Promise<{
    summary: {
      entities: number
      ownedEventsFound: number
      titleDateMatches?: number
      duplicatesDeleted: number
      kept: number
      needsManualDeletion?: string[]
    }
  }> {
    return invokeCalendarApi('google-calendar-sync', {
      action: 'reconcile_duplicates',
    })
  },
}

/**
 * Fire-and-forget after local entity persistence.
 * Never throws to the caller — Google failure must not roll back OurWed.
 */
export async function enqueueExternalCalendarSync(input: {
  entityType: 'wedding' | 'session'
  entityId: string
  operation: 'upsert' | 'delete'
}): Promise<void> {
  try {
    const userId = await resolveStudioUserId()
    const { data: integrations, error } = await supabase
      .from('calendar_integrations')
      .select('provider, enabled')
      .eq('user_id', userId)
      .eq('enabled', true)
    if (error) {
      devInfoArgs('[calendar-sync] skip enqueue', { reason: 'query_failed' })
      return
    }
    if (!integrations?.length) return

    const hasGoogle = integrations.some((i) => i.provider === 'google')
    const hasApple = integrations.some((i) => i.provider === 'apple')

    if (hasGoogle) {
      // Coalesce: cancel pending jobs for the same entity.
      await supabase
        .from('calendar_sync_jobs')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('provider', 'google')
        .eq('entity_type', input.entityType)
        .eq('entity_id', input.entityId)
        .eq('status', 'pending')

      await supabase.from('calendar_sync_jobs').insert({
        user_id: userId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        provider: 'google',
        operation: input.operation,
        status: 'pending',
        payload_json: {},
      })

      void supabase.functions
        .invoke('google-calendar-sync', { body: { action: 'process_jobs' } })
        .then(({ error: invokeError }) => {
          if (invokeError) {
            devInfoArgs('[calendar-sync] process_jobs deferred', {
              provider: 'google',
              entityType: input.entityType,
            })
          }
        })
    }

    if (hasApple) {
      const etag = `W/"${Date.now().toString(36)}"`
      await supabase
        .from('calendar_integrations')
        .update({
          apple_feed_etag: etag,
          last_sync_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('provider', 'apple')
        .eq('enabled', true)
    }
  } catch {
    devInfoArgs('[calendar-sync] enqueue swallowed', {
      provider: 'google|apple',
      entityType: input.entityType,
    })
  }
}
