import { coupleName, getDaysUntil } from '@/lib/utils/dates'
import type { Wedding } from '@/types/wedding'

export type AttentionType = 'survey' | 'hours' | 'teaser' | 'payment' | 'other'

export interface AttentionItem {
  id: string
  weddingId: string
  coupleName: string
  label: string
  type: AttentionType
  urgent: boolean
}

const TYPE_ICON: Record<AttentionType, string> = {
  survey: '📋',
  hours: '⏱',
  teaser: '🎬',
  payment: '💳',
  other: '⚠️',
}

export function getAttentionIcon(type: AttentionType): string {
  return TYPE_ICON[type]
}

export function getAttentionItems(weddings: Wedding[]): AttentionItem[] {
  const items: AttentionItem[] = []

  for (const wedding of weddings) {
    const name = coupleName(wedding.couple.partner1, wedding.couple.partner2)
    const days = getDaysUntil(wedding.date)

    for (const payment of wedding.payments) {
      if (!payment.paid) {
        const dueSoon = payment.dueDate ? getDaysUntil(payment.dueDate) <= 14 : false
        items.push({
          id: `pay-${wedding.id}-${payment.id}`,
          weddingId: wedding.id,
          coupleName: name,
          label: `Brak płatności – ${payment.label}`,
          type: 'payment',
          urgent: dueSoon,
        })
      }
    }

    for (const item of wedding.checklist) {
      if (item.completed) continue

      if (item.label.toLowerCase().includes('timeline')) {
        items.push({
          id: `hours-${wedding.id}-${item.id}`,
          weddingId: wedding.id,
          coupleName: name,
          label: 'Brak potwierdzonych godzin',
          type: 'hours',
          urgent: days <= 30,
        })
      }

      if (
        item.label.toLowerCase().includes('ankieta') ||
        item.label.toLowerCase().includes('lista ujęć')
      ) {
        items.push({
          id: `survey-${wedding.id}-${item.id}`,
          weddingId: wedding.id,
          coupleName: name,
          label: 'Brak ankiety od pary',
          type: 'survey',
          urgent: days <= 60,
        })
      }
    }

    const timelineDone = wedding.checklist.some(
      (c) => c.label.toLowerCase().includes('timeline') && c.completed,
    )
    if (!timelineDone && days <= 45 && days > 0) {
      items.push({
        id: `teaser-${wedding.id}`,
        weddingId: wedding.id,
        coupleName: name,
        label: 'Teaser do oddania',
        type: 'teaser',
        urgent: days <= 35,
      })
    }
  }

  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent))
}
