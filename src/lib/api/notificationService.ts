import { resolveStudioUserId } from '@/lib/api/studioUser'
import { supabase } from '@/lib/supabase'
import { throwOnError, toDateString } from '@/lib/supabase/helpers'
import type { Notification } from '@/types/wedding'

type NotificationType = Notification['type']

interface NotificationRow {
  id: string
  user_id: string
  type: string
  title: string
  content: string
  entity_type: string | null
  entity_id: string | null
  link: string | null
  read: boolean
  created_at: string
}


function mapNotificationType(value: string): NotificationType {
  if (value === 'info' || value === 'warning' || value === 'success') {
    return value
  }
  // DB allows 'error'; app model does not — map to warning.
  return 'warning'
}

/** Map `public.notifications` → app `Notification`. */
export function mapNotificationRowToModel(row: NotificationRow): Notification {
  return {
    id: row.id,
    title: row.title,
    message: row.content,
    createdAt: toDateString(row.created_at) || row.created_at,
    read: row.read,
    type: mapNotificationType(row.type),
  }
}

export interface CreateNotificationInput {
  title: string
  message: string
  type?: NotificationType
  entityType?: string
  entityId?: string
  link?: string
}

/**
 * Notifications data layer — `public.notifications` only.
 */
export const notificationService = {
  async list(): Promise<Notification[]> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    throwOnError(error)

    return ((data ?? []) as NotificationRow[]).map(mapNotificationRowToModel)
  },

  async unread(): Promise<Notification[]> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false })

    throwOnError(error)

    return ((data ?? []) as NotificationRow[]).map(mapNotificationRowToModel)
  },

  async create(input: CreateNotificationInput): Promise<Notification> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: input.type ?? 'info',
        title: input.title,
        content: input.message,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        link: input.link ?? null,
        read: false,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się utworzyć powiadomienia.')
    }

    return mapNotificationRowToModel(data as NotificationRow)
  },

  async markRead(id: string): Promise<Notification> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się oznaczyć powiadomienia jako przeczytane.')
    }

    return mapNotificationRowToModel(data as NotificationRow)
  },
}
