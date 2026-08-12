import { supabase } from '@/lib/supabase'
import type { SubscriptionSummary } from '@/lib/billing/entitlement'

export async function fetchMySubscriptionSummary(): Promise<SubscriptionSummary> {
  const { data, error } = await supabase.rpc('get_my_subscription_summary')
  if (error) {
    throw new Error(error.message || 'subscription_fetch_failed')
  }
  return data as SubscriptionSummary
}
