/** Privacy-safe admin API contracts — Phase 2. No private customer fields. */

export type AdminMetricRange = 'today' | '7d' | '30d'

export type AdminUserStatus = 'active' | 'unconfirmed' | 'banned' | 'inactive'

export type AdminOverviewMetrics = {
  range: AdminMetricRange | string
  rangeStart: string
  rangeEnd: string
  timezone: 'Europe/Warsaw' | string
  updatedAt: string
  accounts: {
    total: number
    createdInRange: number
    confirmed: number
  }
  activeUsers: {
    count: number
    definition: string
    confirmedDenominator: number
  }
  weddings: {
    total: number
    upcoming: number
    createdInRange: number
  }
  sessions: {
    total: number
    upcoming: number
    createdInRange: number
  }
}

export type AdminRegistrationSeries = {
  timezone: string
  days: number
  points: Array<{ date: string; count: number }>
  updatedAt: string
}

export type AdminProductUsage = {
  updatedAt: string
  formQuestionnairesIssued: number
  formQuestionnairesSubmitted: number
  preweddingSent: number
  preweddingSubmitted: number
  documentsGenerated: number
  documentsSigned: number
  paymentsRecorded: number
  briefsDownloaded: number | null
  briefsDownloadedStatus?: 'unavailable'
  googleCalendarActive: number
  appleCalendarActive: number
}

export type AdminActivationStep = {
  id: string
  label: string
  count: number
  definition: string
}

export type AdminActivationFunnel = {
  updatedAt: string
  note: string
  steps: AdminActivationStep[]
}

export type AdminAttentionItem = {
  id: string
  title: string
  count: number
  href: string
  updatedAt: string
}

export type AdminAttentionPayload = {
  items: AdminAttentionItem[]
  updatedAt: string
}

export type AdminProfileSource = 'profile' | 'auth_metadata' | 'none'

export type AdminUserListItem = {
  userId: string
  email: string | null
  firstName: string | null
  lastName: string | null
  displayName: string | null
  profileSource: AdminProfileSource
  shortId: string
  status: AdminUserStatus
  createdAt: string
  lastSignInAt: string | null
  weddings: number
  sessions: number
  documents: number
  integrations: number
}

export type AdminUserListResult = {
  total: number
  limit: number
  offset: number
  rows: AdminUserListItem[]
  updatedAt: string
}

export type AdminUserSummary = {
  userId: string
  email: string | null
  firstName: string | null
  lastName: string | null
  displayName: string | null
  profileSource: AdminProfileSource
  shortId: string
  createdAt: string
  emailConfirmed: boolean
  emailConfirmedAt: string | null
  lastSignInAt: string | null
  bannedUntil: string | null
  mfaFactors: number
  usage: {
    weddings: number
    sessions: number
    documents: number
    questionnaires: number
    payments: number
    calendarIntegrations: number
  }
  integrations: Array<{
    provider: string
    enabled: boolean
    lastSyncAt: string | null
    lastErrorCode: string | null
    lastErrorAt: string | null
    googleConnected?: boolean
  }>
  lookedUpAt: string
}

export type AdminEmailMetrics =
  | {
      status: 'not_collecting'
      message: string
      smtpConfigured: 'unknown' | boolean
      webhookConnected: boolean
      updatedAt: string
    }
  | {
      status: 'ok'
      sent: number
      delivered: number
      bounced: number
      failed: number
      complained: number
      suppressed: number
      deliveryDelayed: number
      lastEventAt: string | null
      updatedAt: string
    }

export type AdminIntegrationHealth = {
  updatedAt: string
  google: {
    connected: number
    enabled: number
    withError: number
    lastSuccessfulSyncAt: string | null
  }
  apple: {
    enabled: number
    withError: number
    lastSuccessfulSyncAt: string | null
  }
  resend: {
    smtpConfigured: 'unknown' | boolean
    webhookConnected: boolean
    lastWebhookEventAt: string | null
    status: string
  }
  supabase: {
    database: string
    adminRpc: string
  }
}

export type AdminSystemCheckStatus =
  | 'ok'
  | 'error'
  | 'unknown'
  | 'not_connected'

export type AdminSystemHealth = {
  checkedAt: string
  checks: Array<{
    id: string
    label: string
    status: AdminSystemCheckStatus | string
    durationMs?: number | null
    note?: string
  }>
}

export type AdminAuditEntry = {
  id: string
  createdAt: string
  adminMaskedEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  result: 'ok' | 'error' | string
}

export type AdminAuditListResult = {
  total: number
  limit: number
  offset: number
  rows: AdminAuditEntry[]
  updatedAt: string
}

export type AdminApiError = {
  code: string
  message: string
  correlationId: string
}
