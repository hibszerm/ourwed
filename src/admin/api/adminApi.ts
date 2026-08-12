import { supabase } from '@/lib/supabase'
import type {
  AdminActivationFunnel,
  AdminApiError,
  AdminAttentionPayload,
  AdminAuditListResult,
  AdminEmailMetrics,
  AdminIntegrationHealth,
  AdminMetricRange,
  AdminOverviewMetrics,
  AdminProductUsage,
  AdminRegistrationSeries,
  AdminSubscriptionFilter,
  AdminSubscriptionListResult,
  AdminSubscriptionMetrics,
  AdminSubscriptionMutationResult,
  AdminSystemHealth,
  AdminUserListResult,
  AdminUserStatus,
  AdminUserSubscriptionDetail,
  AdminUserSummary,
} from '@/admin/api/types'

export class AdminApiRequestError extends Error {
  readonly code: string
  readonly correlationId: string
  readonly operation?: string
  readonly category?: string
  readonly httpStatus?: number
  readonly databaseCode?: string

  constructor(error: AdminApiError & {
    operation?: string
    category?: string
    httpStatus?: number
    databaseCode?: string
  }) {
    super(error.message)
    this.name = 'AdminApiRequestError'
    this.code = error.code
    this.correlationId = error.correlationId
    this.operation = error.operation
    this.category = error.category
    this.httpStatus = error.httpStatus
    this.databaseCode = error.databaseCode
  }
}

type RpcLikeError = {
  message?: string
  code?: string
  details?: string
  hint?: string
  status?: number
} | null

function correlationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `admin-${Date.now()}`
}

function isDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV)
  } catch {
    return false
  }
}

function extractDatabaseCode(err: RpcLikeError): string | undefined {
  if (!err) return undefined
  const blob = `${err.code ?? ''} ${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`
  const match = blob.match(/\b(42883|42P01|PGRST202|PGRST204|42501|P0002)\b/i)
  return match?.[1]?.toUpperCase()
}

function extractRelationName(err: RpcLikeError): string | undefined {
  if (!err) return undefined
  const blob = `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`
  const m =
    blob.match(/relation\s+"([^"]+)"\s+does not exist/i) ||
    blob.match(/relation\s+([a-zA-Z0-9_.]+)\s+does not exist/i)
  return m?.[1]
}

function mapRpcError(operation: string, err: RpcLikeError): never {
  const raw = `${err?.message ?? ''} ${err?.details ?? ''} ${err?.hint ?? ''} ${err?.code ?? ''}`.toLowerCase()
  const id = correlationId()
  const databaseCode = extractDatabaseCode(err)
  const relation = extractRelationName(err)
  const httpStatus =
    typeof err?.status === 'number'
      ? err.status
      : databaseCode === '42883' ||
          databaseCode === 'PGRST202' ||
          databaseCode === '42P01'
        ? 404
        : undefined

  if (
    (databaseCode === '42P01' || raw.includes('relation')) &&
    raw.includes('does not exist')
  ) {
    if (isDev()) {
      console.warn('[ADM-RPC-RELATION]', {
        operation,
        category: 'ADM-RPC-RELATION',
        relation: relation ?? null,
        HTTP: httpStatus ?? 404,
        databaseCode: '42P01',
        correlationId: id,
      })
    }
    throw new AdminApiRequestError({
      code: 'admin_rpc_relation',
      message: 'Nie udało się pobrać danych. Kod błędu: ADM-RPC-RELATION',
      correlationId: id,
      operation,
      category: 'ADM-RPC-RELATION',
      httpStatus: httpStatus ?? 404,
      databaseCode: '42P01',
    })
  }

  if (
    databaseCode === '42883' ||
    databaseCode === 'PGRST202' ||
    raw.includes('could not find the function') ||
    (raw.includes('function public.admin_') && raw.includes('does not exist'))
  ) {
    if (isDev()) {
      console.warn('[ADM-RPC-SIGNATURE]', {
        operation,
        category: 'ADM-RPC-SIGNATURE',
        HTTP: httpStatus ?? 404,
        databaseCode: databaseCode ?? '42883',
        correlationId: id,
      })
    }
    throw new AdminApiRequestError({
      code: 'admin_rpc_signature',
      message: 'Nie udało się pobrać danych',
      correlationId: id,
      operation,
      category: 'ADM-RPC-SIGNATURE',
      httpStatus: httpStatus ?? 404,
      databaseCode: databaseCode ?? '42883',
    })
  }

  if (raw.includes('admin_aal2_required') || (raw.includes('aal2') && raw.includes('admin_'))) {
    throw new AdminApiRequestError({
      code: 'admin_aal2_required',
      message: 'Brak uprawnień',
      correlationId: id,
      operation,
      category: 'ADM-AUTH',
      databaseCode,
    })
  }
  if (raw.includes('admin_forbidden') || databaseCode === '42501') {
    throw new AdminApiRequestError({
      code: 'admin_forbidden',
      message: 'Brak uprawnień',
      correlationId: id,
      operation,
      category: 'ADM-AUTH',
      databaseCode,
    })
  }
  if (raw.includes('admin_user_not_found') || databaseCode === 'P0002') {
    throw new AdminApiRequestError({
      code: 'admin_user_not_found',
      message: 'Nie znaleziono konta',
      correlationId: id,
      operation,
      category: 'ADM-NOT-FOUND',
      databaseCode,
    })
  }

  if (isDev()) {
    console.warn('[ADM-RPC-FAILED]', {
      operation,
      category: 'ADM-RPC-FAILED',
      databaseCode: databaseCode ?? null,
      correlationId: id,
    })
  }

  throw new AdminApiRequestError({
    code: 'admin_fetch_failed',
    message: 'Nie udało się pobrać danych',
    correlationId: id,
    operation,
    category: 'ADM-RPC-FAILED',
    databaseCode,
    httpStatus,
  })
}

async function callRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) mapRpcError(name, error as RpcLikeError)
  return data as T
}

export async function fetchOverviewMetrics(
  range: AdminMetricRange,
): Promise<AdminOverviewMetrics> {
  return callRpc('admin_get_overview_metrics', { p_range: range })
}

export async function fetchRegistrationSeries(
  days = 30,
): Promise<AdminRegistrationSeries> {
  return callRpc('admin_get_registration_series', { p_days: days })
}

export async function fetchProductUsage(): Promise<AdminProductUsage> {
  return callRpc('admin_get_product_usage')
}

export async function fetchActivationFunnel(): Promise<AdminActivationFunnel> {
  return callRpc('admin_get_activation_funnel')
}

export async function fetchAttentionItems(): Promise<AdminAttentionPayload> {
  return callRpc('admin_get_attention_items')
}

export async function fetchUserList(input: {
  limit?: number
  offset?: number
  search?: string | null
  status?: AdminUserStatus | null
  subscriptionFilter?: AdminSubscriptionFilter | null
}): Promise<AdminUserListResult> {
  return callRpc('admin_list_users', {
    p_limit: input.limit ?? 25,
    p_offset: input.offset ?? 0,
    p_search: input.search ?? null,
    p_status: input.status ?? null,
    p_subscription_filter: input.subscriptionFilter ?? null,
  })
}

export async function fetchSubscriptionMetrics(): Promise<AdminSubscriptionMetrics> {
  return callRpc('admin_get_subscription_metrics')
}

export async function fetchSubscriptionList(input: {
  limit?: number
  offset?: number
  filter?: AdminSubscriptionFilter | null
}): Promise<AdminSubscriptionListResult> {
  return callRpc('admin_list_subscriptions', {
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
    p_filter: input.filter ?? null,
  })
}

export async function fetchUserSubscription(
  userId: string,
): Promise<AdminUserSubscriptionDetail> {
  return callRpc('admin_get_user_subscription', { p_user_id: userId })
}

export async function extendTrialAdmin(input: {
  userId: string
  days?: number | null
  until?: string | null
  reason?: string | null
}): Promise<AdminSubscriptionMutationResult> {
  return callRpc('admin_extend_trial', {
    p_user_id: input.userId,
    p_days: input.days ?? null,
    p_until: input.until ?? null,
    p_reason: input.reason ?? null,
  })
}

export async function grantManualProAdmin(input: {
  userId: string
  until?: string | null
  indefinite?: boolean
  reason?: string | null
}): Promise<AdminSubscriptionMutationResult> {
  return callRpc('admin_grant_manual_pro', {
    p_user_id: input.userId,
    p_until: input.until ?? null,
    p_indefinite: input.indefinite ?? false,
    p_reason: input.reason ?? null,
  })
}

export async function revokeManualAccessAdmin(input: {
  userId: string
  reason?: string | null
}): Promise<AdminSubscriptionMutationResult> {
  return callRpc('admin_revoke_manual_access', {
    p_user_id: input.userId,
    p_reason: input.reason ?? null,
  })
}

export async function fetchUserSummary(userId: string): Promise<AdminUserSummary> {
  return callRpc('admin_get_user_summary', { p_user_id: userId })
}

export async function fetchEmailMetrics(): Promise<AdminEmailMetrics> {
  return callRpc('admin_get_email_metrics')
}

export async function fetchIntegrationHealth(): Promise<AdminIntegrationHealth> {
  return callRpc('admin_get_integration_health')
}

export async function fetchSystemHealth(): Promise<AdminSystemHealth> {
  return callRpc('admin_get_system_health')
}

export async function fetchAuditList(input: {
  limit?: number
  offset?: number
  action?: string | null
}): Promise<AdminAuditListResult> {
  return callRpc('admin_list_audit', {
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
    p_action: input.action ?? null,
  })
}
