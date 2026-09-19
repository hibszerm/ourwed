import { isActiveStudioTask } from '@/features/tasks/groupStudioTasks'
import {
  V6_LIST_RELATED_HARD_CAP,
  type RelationKey,
} from '../registry'
import { legObservation } from './logisticsAuthority'
import type { WeddingReadContext } from './WeddingReadContext'
import type { RelatedListItem, RelatedListResult } from './types'

export type RelationAdapter = (
  ctx: WeddingReadContext,
  limit: number,
) => Promise<RelatedListResult>

function boundedLimit(limit: number): number {
  if (!Number.isFinite(limit)) return V6_LIST_RELATED_HARD_CAP
  return Math.max(0, Math.min(Math.floor(limit), V6_LIST_RELATED_HARD_CAP))
}

function result(
  relationKey: RelationKey,
  allItems: RelatedListItem[],
  limit: number,
): RelatedListResult {
  const take = boundedLimit(limit)
  return {
    items: allItems.slice(0, take),
    totalCount: allItems.length,
    truncated: allItems.length > take,
    relationKey,
  }
}

function money(amount: number, currency = 'PLN'): string {
  return `${amount.toLocaleString('pl-PL')} ${currency}`
}

function sessionTitle(session: {
  customName?: string
  customSessionType?: string
  sessionType: string
}): string {
  return (
    session.customName?.trim() ||
    session.customSessionType?.trim() ||
    session.sessionType
  )
}

export const relationAdapters: Record<RelationKey, RelationAdapter> = {
  TASKS_OPEN: async (ctx, limit) => {
    const items = (await ctx.getTasks())
      .filter(isActiveStudioTask)
      .map((task) => ({
        title: task.title,
        subtitle: task.dueDate || null,
        meta: task.status,
      }))
    return result('TASKS_OPEN', items, limit)
  },

  PAYMENTS: async (ctx, limit) => {
    const wedding = await ctx.getWedding()
    const currency = wedding?.currency?.trim() || 'PLN'
    const items = (await ctx.getPayments()).map((payment) => ({
      title: payment.label || payment.type,
      subtitle: money(payment.amount, currency),
      meta: `${payment.paid ? 'opłacona' : 'nieopłacona'}${
        payment.paidAt ? ` · ${payment.paidAt}` : ''
      }`,
    }))
    return result('PAYMENTS', items, limit)
  },

  SESSIONS: async (ctx, limit) => {
    const items = (await ctx.getSessions()).map((session) => ({
      title: sessionTitle(session),
      subtitle: session.date || null,
      meta:
        session.location?.name ||
        session.location?.formattedAddress ||
        session.location?.address ||
        null,
    }))
    return result('SESSIONS', items, limit)
  },

  EXTRAS: async (ctx, limit) => {
    const wedding = await ctx.getWedding()
    const currency = wedding?.currency?.trim() || 'PLN'
    const items = (await ctx.getExtras()).map((extra) => ({
      title: extra.name?.trim() || extra.nameSnapshot?.trim() || 'Dodatek',
      subtitle: money(extra.priceSnapshot * extra.quantity, currency),
      meta: extra.quantity > 1 ? `${extra.quantity} szt.` : null,
    }))
    return result('EXTRAS', items, limit)
  },

  PACKAGE_ITEMS: async (ctx, limit) => {
    const wedding = await ctx.getWedding()
    const items = (wedding?.packageItems ?? [])
      .filter((item) => item.enabled !== false)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        title: item.title,
        subtitle: item.description?.trim() || null,
        meta:
          item.quantity != null
            ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
            : null,
      }))
    return result('PACKAGE_ITEMS', items, limit)
  },

  EXTRA_CONTACTS: async (ctx, limit) => {
    const items = (await ctx.getContacts()).map((contact) => ({
      title: contact.name,
      subtitle: contact.role?.trim() || null,
      meta:
        [contact.phone?.trim(), contact.email?.trim()]
          .filter(Boolean)
          .join(' · ') || null,
    }))
    return result('EXTRA_CONTACTS', items, limit)
  },

  DAY_PLAN_STOPS: async (ctx, limit) => {
    const items = (await ctx.getOperationalStops())
      .filter((stop) => stop.kind === 'wedding_place')
      .map((stop) => ({
        title: stop.title,
        subtitle: stop.time,
        meta:
          [stop.placeName?.trim(), stop.address?.trim()]
            .filter(Boolean)
            .join(' · ') || null,
      }))
    return result('DAY_PLAN_STOPS', items, limit)
  },

  ROUTE_LEGS: async (ctx, limit) => {
    const { flow } = await ctx.getLogistics()
    const items = flow.routeLegs.map((leg) => {
      const obs = legObservation(leg)
      return {
        title: `${obs.from_title} → ${obs.to_title}`,
        subtitle: obs.ok
          ? [obs.distance_text, obs.duration_text].filter(Boolean).join(' · ') ||
            null
          : 'brak wyliczenia',
        meta: [obs.from_role, obs.to_role].filter(Boolean).join(' → ') || null,
      }
    })
    return result('ROUTE_LEGS', items, limit)
  },

  ROUTE_STOPS: async (ctx, limit) => {
    const { flow } = await ctx.getLogistics()
    const items = flow.stops.map((stop, index) => ({
      title: stop.title,
      subtitle: stop.address || null,
      meta: [String(index + 1), stop.role].filter(Boolean).join(' · '),
    }))
    return result('ROUTE_STOPS', items, limit)
  },

  /** Session-rooted only — wedding context returns empty. */
  LINKED_WEDDING: async (_ctx, limit) => result('LINKED_WEDDING', [], limit),
}

export async function listRelation(
  ctx: WeddingReadContext,
  relationKey: RelationKey,
  limit: number,
): Promise<RelatedListResult> {
  return relationAdapters[relationKey](ctx, limit)
}
