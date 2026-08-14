/**
 * Lightweight Calendar first-paint reads.
 * NEVER calls finalizeWeddingViews / weddingService.getAll / session payments.
 */

import { resolveStudioUserId } from '@/lib/api/studioUser'
import {
  mapWeddingRowToModel,
  type WeddingRow,
} from '@/lib/api/weddings/weddingMappers'
import {
  mapSessionRowToModel,
  type SessionRow,
} from '@/lib/api/sessionService'
import { withDevPerf } from '@/lib/performance/devPerf'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { Session } from '@/types/session'
import type { Wedding } from '@/types/wedding'

/** Exact select — architectural tests pin this string. */
export const CALENDAR_LIGHT_WEDDING_SELECT =
  'id, user_id, bride_name, groom_name, display_name, email, phone, wedding_date, ceremony_time, venue, status, workflow_stage, package_name, package_id, contract_value, deposit_amount, currency, accent_color, bride_preparation_location, groom_preparation_location, created_at, updated_at'

/** Exact select — no payments join. */
export const CALENDAR_LIGHT_SESSION_SELECT =
  'id, user_id, custom_name, primary_first_name, primary_last_name, secondary_first_name, secondary_last_name, session_type, custom_session_type, session_date, start_time, end_time, location_name, location_address, formatted_address, place_id, latitude, longitude, location_source, total_price, deposit_amount, notes, linked_wedding_id, created_at, updated_at'

export const calendarLightService = {
  async listWeddingsForCalendar(): Promise<Wedding[]> {
    return withDevPerf('calendar.light-weddings', async () => {
      const userId = await resolveStudioUserId()
      const { data, error } = await supabase
        .from('weddings')
        .select(CALENDAR_LIGHT_WEDDING_SELECT)
        .eq('user_id', userId)
        .order('wedding_date', { ascending: true, nullsFirst: false })

      throwOnError(error)
      return ((data ?? []) as WeddingRow[]).map(mapWeddingRowToModel)
    })
  },

  async listSessionsForCalendar(): Promise<Session[]> {
    return withDevPerf('calendar.light-sessions', async () => {
      const userId = await resolveStudioUserId()
      const { data, error } = await supabase
        .from('sessions')
        .select(CALENDAR_LIGHT_SESSION_SELECT)
        .eq('user_id', userId)
        .order('session_date', { ascending: true, nullsFirst: false })

      throwOnError(error)
      // Scalar map only — Calendar grid does not need session_payments.
      return ((data ?? []) as SessionRow[]).map(mapSessionRowToModel)
    })
  },
}
