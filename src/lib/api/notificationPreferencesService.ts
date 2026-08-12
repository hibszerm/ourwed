import { resolveStudioUserId } from '@/lib/api/studioUser'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import {
  NOTIFICATION_CATALOG,
  defaultEmailEnabled,
  type NotificationEventType,
} from '@/lib/notifications/catalog'

export type EmailPreferenceMap = Record<NotificationEventType, boolean>

/**
 * Customer notification preferences — email channel only for V1.
 * Missing rows mean catalog defaults (email ON for questionnaire events).
 */
export const notificationPreferencesService = {
  async getEmailPreferences(): Promise<EmailPreferenceMap> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('event_type, enabled')
      .eq('user_id', userId)
      .eq('channel', 'email')

    throwOnError(error)

    const map = {} as EmailPreferenceMap
    for (const entry of NOTIFICATION_CATALOG) {
      map[entry.eventType] = entry.channels.email.defaultEnabled
    }
    for (const row of data ?? []) {
      const type = row.event_type as NotificationEventType
      if (type in map) {
        map[type] = Boolean(row.enabled)
      }
    }
    return map
  },

  async setEmailPreference(
    eventType: NotificationEventType,
    enabled: boolean,
  ): Promise<void> {
    const userId = await resolveStudioUserId()
    const { error } = await supabase.from('notification_preferences').upsert(
      {
        user_id: userId,
        event_type: eventType,
        channel: 'email',
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,event_type,channel' },
    )
    throwOnError(error)
  },

  resolveDefault(eventType: string): boolean {
    return defaultEmailEnabled(eventType)
  },
}
