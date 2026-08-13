import { supabase } from '@/lib/supabase'
import { nowIso, throwOnError } from '@/lib/supabase/helpers'
import { normalizeOperationalClock } from '@/features/wedding-day/operationalDayPlan'
import type { OperationalTimeMap } from '@/features/wedding-day/operationalDayPlan'

interface OperationalTimeRow {
  wedding_id: string
  stop_key: string
  operational_time: string
}

export const weddingOperationalTimesService = {
  async listByWeddingId(weddingId: string): Promise<OperationalTimeMap> {
    const { data, error } = await supabase
      .from('wedding_operational_times')
      .select('wedding_id, stop_key, operational_time')
      .eq('wedding_id', weddingId)
    throwOnError(error)
    const map: OperationalTimeMap = {}
    for (const row of (data ?? []) as OperationalTimeRow[]) {
      const time = normalizeOperationalClock(row.operational_time)
      if (time) map[row.stop_key] = time
    }
    return map
  },

  /** Persist a studio override. Does not touch questionnaire answers. */
  async setTime(
    weddingId: string,
    stopKey: string,
    rawTime: string,
  ): Promise<string> {
    const time = normalizeOperationalClock(rawTime)
    if (!time) throw new Error('Nieprawidłowa godzina.')
    const { error } = await supabase.from('wedding_operational_times').upsert(
      {
        wedding_id: weddingId,
        stop_key: stopKey,
        operational_time: time,
        updated_at: nowIso(),
      },
      { onConflict: 'wedding_id,stop_key' },
    )
    throwOnError(error)
    return time
  },

  /** Remove override so questionnaire seed can show again. */
  async clearTime(weddingId: string, stopKey: string): Promise<void> {
    const { error } = await supabase
      .from('wedding_operational_times')
      .delete()
      .eq('wedding_id', weddingId)
      .eq('stop_key', stopKey)
    throwOnError(error)
  },
}
