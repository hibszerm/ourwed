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

export type NotificationListFilter = 'all' | 'unread'

export interface NotificationListCursor {
  createdAt: string
  id: string
}

export interface NotificationListPage {
  items: Notification[]
  nextCursor: NotificationListCursor | null
}

export const NOTIFICATION_PAGE_SIZE = 30
export const NOTIFICATION_DASHBOARD_LATEST = 4

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
    createdAtIso: row.created_at,
    read: row.read,
    type: mapNotificationType(row.type),
    link: row.link,
  }
}

export function notificationCursorFromItem(
  item: Pick<Notification, 'id' | 'createdAtIso'>,
): NotificationListCursor {
  return { createdAt: item.createdAtIso, id: item.id }
}

export interface CreateNotificationInput {
  title: string
  message: string
  type?: NotificationType
  entityType?: string
  entityId?: string
  link?: string
}

export interface ListNotificationsInput {
  limit?: number
  cursor?: NotificationListCursor | null
  unreadOnly?: boolean
}

/**
 * Notifications data layer — `public.notifications` only.
 * Owner filters applied in addition to RLS.
 */
export const notificationService = {
  /**
   * Paginated newest-first list. Cursor = (created_at, id) of last row.
   */
  async listPage(
    input: ListNotificationsInput = {},
  ): Promise<NotificationListPage> {
    const userId = await resolveStudioUserId()
    const limit = Math.max(1, Math.min(input.limit ?? NOTIFICATION_PAGE_SIZE, 100))

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)

    if (input.unreadOnly) {
      query = query.eq('read', false)
    }

    if (input.cursor) {
      const { createdAt, id } = input.cursor
      // Older than cursor: created_at < c OR (created_at = c AND id < c.id)
      query = query.or(
        `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
      )
    }

    const { data, error } = await query
    throwOnError(error)

    const rows = ((data ?? []) as NotificationRow[]).map(mapNotificationRowToModel)
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const last = items[items.length - 1]
    return {
      items,
      nextCursor: hasMore && last ? notificationCursorFromItem(last) : null,
    }
  },

  /** Dashboard preview — newest N only. */
  async listLatest(
    limit: number = NOTIFICATION_DASHBOARD_LATEST,
  ): Promise<Notification[]> {
    const page = await this.listPage({ limit, unreadOnly: false })
    return page.items
  },

  /**
   * @deprecated Prefer listPage / listLatest. Full history load is not for UI.
   */
  async list(): Promise<Notification[]> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    throwOnError(error)

    return ((data ?? []) as NotificationRow[]).map(mapNotificationRowToModel)
  },

  async unread(): Promise<Notification[]> {
    const page = await this.listPage({
      limit: NOTIFICATION_PAGE_SIZE,
      unreadOnly: true,
    })
    return page.items
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

  /** One UPDATE — all unread rows for the current owner. */
  async markAllRead(): Promise<number> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
      .select('id')

    throwOnError(error)
    return (data ?? []).length
  },

  async unreadCount(): Promise<number> {
    const userId = await resolveStudioUserId()
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    throwOnError(error)
    return count ?? 0
  },
}
