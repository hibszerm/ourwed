export type CalendarProvider = 'google' | 'apple'
export type CalendarEntityType = 'wedding' | 'session'
export type CalendarBackfillMode = 'future' | 'all_active'

export type ExternalCalendarSyncStatus =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'omitted'
  | 'deleted'

export type CalendarIntegrationRow = {
  id: string
  user_id: string
  provider: CalendarProvider
  enabled: boolean
  sync_weddings: boolean
  sync_sessions: boolean
  backfill_mode: CalendarBackfillMode
  google_account_email: string | null
  google_account_id: string | null
  google_calendar_id: string | null
  google_calendar_name: string | null
  google_connected_at: string | null
  google_revoked_at: string | null
  google_scopes: string[] | null
  google_token_expires_at: string | null
  apple_token_hash: string | null
  apple_token_created_at: string | null
  apple_token_rotated_at: string | null
  apple_feed_etag: string | null
  last_sync_at: string | null
  last_error_code: string | null
  last_error_at: string | null
  last_error_message: string | null
  created_at: string
  updated_at: string
}

export type GoogleIntegrationView = {
  provider: 'google'
  connected: boolean
  enabled: boolean
  accountEmail: string | null
  calendarId: string | null
  calendarName: string | null
  syncWeddings: boolean
  syncSessions: boolean
  backfillMode: CalendarBackfillMode
  connectedAt: string | null
  revokedAt: string | null
  lastSyncAt: string | null
  lastErrorCode: string | null
  lastErrorAt: string | null
  lastErrorMessage: string | null
  needsReconnect: boolean
  needsCalendarAttention: boolean
}

export type AppleIntegrationView = {
  provider: 'apple'
  active: boolean
  enabled: boolean
  syncWeddings: boolean
  syncSessions: boolean
  backfillMode: CalendarBackfillMode
  /** Raw token only returned once after activate/rotate — never stored in React Query long-term. */
  subscriptionUrl: string | null
  maskedUrl: string | null
  tokenCreatedAt: string | null
  tokenRotatedAt: string | null
  feedEtag: string | null
  lastSyncAt: string | null
}

export type CalendarIntegrationsSnapshot = {
  google: GoogleIntegrationView
  apple: AppleIntegrationView
}

export type WritableGoogleCalendar = {
  id: string
  summary: string
  primary: boolean
  accessRole: string
}

export type CanonicalExternalCalendarEvent = {
  entityType: CalendarEntityType
  entityId: string
  startDate: string
  endDateExclusive: string
  title: string
  eligible: boolean
  omissionReason?:
    | 'no_date'
    | 'cancelled'
    | 'category_disabled'
    | 'backfill_future'
    | 'not_found'
  fingerprint: string
}

export type EntityCalendarStatusView = {
  google: {
    state:
      | 'not_configured'
      | 'pending'
      | 'syncing'
      | 'synced'
      | 'needs_attention'
      | 'category_disabled'
      | 'omitted'
    externalEventUrl: string | null
    lastSyncedAt: string | null
    lastErrorCode: string | null
  }
  apple: {
    state: 'inactive' | 'available' | 'category_disabled' | 'omitted'
  }
}

export type GoogleSyncNowResult = {
  synced: number
  updated: number
  failed: number
  omitted: number
  deleted: number
}
