import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'

interface CompletionRow {
  stop_key: string
  completed_at: string
}

/** Set of completed operational stop keys for a wedding. */
export type OperationalCompletionMap = Record<string, string>

export const weddingOperationalCompletionsService = {
  async listByWeddingId(weddingId: string): Promise<OperationalCompletionMap> {
    const { data, error } = await supabase
      .from('wedding_operational_completions')
      .select('stop_key, completed_at')
      .eq('wedding_id', weddingId)
    throwOnError(error)
    const out: OperationalCompletionMap = {}
    for (const row of (data ?? []) as CompletionRow[]) {
      out[row.stop_key] = row.completed_at
    }
    return out
  },

  async markComplete(weddingId: string, stopKey: string): Promise<void> {
    const key = stopKey.trim()
    if (!key) return
    const { error } = await supabase.from('wedding_operational_completions').upsert(
      {
        wedding_id: weddingId,
        stop_key: key,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'wedding_id,stop_key' },
    )
    throwOnError(error)
  },

  async clearComplete(weddingId: string, stopKey: string): Promise<void> {
    const key = stopKey.trim()
    if (!key) return
    const { error } = await supabase
      .from('wedding_operational_completions')
      .delete()
      .eq('wedding_id', weddingId)
      .eq('stop_key', key)
    throwOnError(error)
  },
}
