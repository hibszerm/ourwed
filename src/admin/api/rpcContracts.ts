/**
 * Canonical Phase 2 admin RPC contracts.
 * Frontend argument keys MUST match PostgreSQL parameter names exactly (PostgREST).
 */
export type AdminRpcArgContract = {
  name: string
  /** PostgreSQL type as declared in migrations */
  pgType: string
  required: boolean
}

export type AdminRpcContract = {
  name: string
  args: AdminRpcArgContract[]
  returns: 'jsonb'
}

export const ADMIN_PHASE2_RPC_CONTRACTS: readonly AdminRpcContract[] = [
  {
    name: 'admin_get_overview_metrics',
    args: [{ name: 'p_range', pgType: 'text', required: false }],
    returns: 'jsonb',
  },
  {
    name: 'admin_get_registration_series',
    args: [{ name: 'p_days', pgType: 'integer', required: false }],
    returns: 'jsonb',
  },
  {
    name: 'admin_get_product_usage',
    args: [],
    returns: 'jsonb',
  },
  {
    name: 'admin_get_activation_funnel',
    args: [],
    returns: 'jsonb',
  },
  {
    name: 'admin_get_attention_items',
    args: [],
    returns: 'jsonb',
  },
  {
    name: 'admin_list_users',
    args: [
      { name: 'p_limit', pgType: 'integer', required: false },
      { name: 'p_offset', pgType: 'integer', required: false },
      { name: 'p_search', pgType: 'text', required: false },
      { name: 'p_status', pgType: 'text', required: false },
      { name: 'p_subscription_filter', pgType: 'text', required: false },
    ],
    returns: 'jsonb',
  },
  {
    name: 'admin_get_user_summary',
    args: [{ name: 'p_user_id', pgType: 'uuid', required: true }],
    returns: 'jsonb',
  },
  {
    name: 'admin_get_email_metrics',
    args: [],
    returns: 'jsonb',
  },
  {
    name: 'admin_get_integration_health',
    args: [],
    returns: 'jsonb',
  },
  {
    name: 'admin_get_system_health',
    args: [],
    returns: 'jsonb',
  },
  {
    name: 'admin_list_audit',
    args: [
      { name: 'p_limit', pgType: 'integer', required: false },
      { name: 'p_offset', pgType: 'integer', required: false },
      { name: 'p_action', pgType: 'text', required: false },
    ],
    returns: 'jsonb',
  },
] as const

/** Billing / subscription admin RPCs (subscription foundation migration). */
export const ADMIN_BILLING_RPC_CONTRACTS: readonly AdminRpcContract[] = [
  {
    name: 'admin_get_subscription_metrics',
    args: [],
    returns: 'jsonb',
  },
  {
    name: 'admin_list_subscriptions',
    args: [
      { name: 'p_limit', pgType: 'integer', required: false },
      { name: 'p_offset', pgType: 'integer', required: false },
      { name: 'p_filter', pgType: 'text', required: false },
    ],
    returns: 'jsonb',
  },
  {
    name: 'admin_extend_trial',
    args: [
      { name: 'p_user_id', pgType: 'uuid', required: true },
      { name: 'p_days', pgType: 'integer', required: false },
      { name: 'p_until', pgType: 'timestamptz', required: false },
      { name: 'p_reason', pgType: 'text', required: false },
    ],
    returns: 'jsonb',
  },
  {
    name: 'admin_grant_manual_pro',
    args: [
      { name: 'p_user_id', pgType: 'uuid', required: true },
      { name: 'p_until', pgType: 'timestamptz', required: false },
      { name: 'p_indefinite', pgType: 'boolean', required: false },
      { name: 'p_reason', pgType: 'text', required: false },
    ],
    returns: 'jsonb',
  },
  {
    name: 'admin_revoke_manual_access',
    args: [
      { name: 'p_user_id', pgType: 'uuid', required: true },
      { name: 'p_reason', pgType: 'text', required: false },
    ],
    returns: 'jsonb',
  },
  {
    name: 'admin_get_user_subscription',
    args: [{ name: 'p_user_id', pgType: 'uuid', required: true }],
    returns: 'jsonb',
  },
] as const

export const ADMIN_RPC_NAMES = ADMIN_PHASE2_RPC_CONTRACTS.map((c) => c.name)
