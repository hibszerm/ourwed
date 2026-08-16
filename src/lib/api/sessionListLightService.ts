/**
 * Lightweight Sessions list (/sesje) first-paint reads.
 * Scalar column pin + one batched payments query — never N+1.
 */

import { resolveStudioUserId } from '@/lib/api/studioUser'
import {
  mapSessionRowToModel,
  type SessionRow,
} from '@/lib/api/sessionService'
import { sessionPaymentService } from '@/lib/api/sessionPaymentService'
import { withDevPerf } from '@/lib/performance/devPerf'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { Session } from '@/types/session'
import type { SessionPayment } from '@/types/sessionPayment'

/**
 * Pinned columns for SessionCard / SessionList.
 * Location name/address enough for list summary; no notes required for UI.
 */
export const SESSION_LIST_LIGHT_SELECT =
  'id, user_id, custom_name, primary_first_name, primary_last_name, secondary_first_name, secondary_last_name, session_type, custom_session_type, session_date, start_time, end_time, location_name, location_address, formatted_address, place_id, latitude, longitude, location_source, total_price, deposit_amount, notes, linked_wedding_id, created_at, updated_at'

async function withPayments(sessions: Session[]): Promise<Session[]> {
  if (sessions.length === 0) return sessions
  const map = await sessionPaymentService.listBySessionIds(
    sessions.map((s) => s.id),
  )
  return sessions.map((s) => ({
    ...s,
    payments: map.get(s.id) ?? ([] as SessionPayment[]),
  }))
}

export const sessionListLightService = {
  /**
   * Light list for /sesje. Empty account → [] with ZERO inserts.
   */
  async listSessionsForList(): Promise<Session[]> {
    return withDevPerf('sessionService.listForList', async () => {
      const userId = await resolveStudioUserId()
      const { data, error } = await supabase
        .from('sessions')
        .select(SESSION_LIST_LIGHT_SELECT)
        .eq('user_id', userId)
        .order('session_date', { ascending: true, nullsFirst: false })

      throwOnError(error)
      const light = ((data ?? []) as SessionRow[]).map(mapSessionRowToModel)
      return withPayments(light)
    })
  },
}
