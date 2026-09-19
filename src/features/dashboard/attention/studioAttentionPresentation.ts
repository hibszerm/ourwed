/**
 * Studio Attention V1.1 — selection families, operational copy, relative context.
 * Pure in-memory. Zero network / DB. Does not change domain truth.
 */

import type {
  StudioAttentionItem,
  StudioAttentionKind,
} from '@/features/dashboard/attention/studioAttentionTypes'
import { formatCurrency } from '@/lib/utils/currency'
import { formatShortDate } from '@/lib/utils/dates'
import {
  localCalendarDateKey,
  toLocalCalendarDateKey,
} from '@/lib/utils/localCalendarDate'

/** Presentation-only families for diversity selection (not persisted). */
export type StudioAttentionFamily =
  | 'OVERDUE_FINANCE'
  | 'OVERDUE_DELIVERY'
  | 'COMMERCIAL_BLOCKER'
  | 'PREPARATION'

/**
 * Visual domain for Attention type markers.
 * Five domains — icon answers "what domain?", copy answers "what action?".
 */
export type StudioAttentionIconDomain =
  | 'finance'
  | 'travel'
  | 'document'
  | 'questionnaire'
  | 'delivery'

export function studioAttentionFamilyOf(
  kind: StudioAttentionKind,
): StudioAttentionFamily {
  if (kind === 'overdue_payment') return 'OVERDUE_FINANCE'
  if (kind === 'overdue_delivery') return 'OVERDUE_DELIVERY'
  if (kind === 'send_prewedding') return 'PREPARATION'
  return 'COMMERCIAL_BLOCKER'
}

/** Explicit kind → marker domain. Every known kind must resolve. */
export function studioAttentionIconDomain(
  kind: StudioAttentionKind,
): StudioAttentionIconDomain {
  switch (kind) {
    case 'overdue_payment':
    case 'record_deposit':
      return 'finance'
    case 'resolve_travel_fee':
      return 'travel'
    case 'complete_contract_data_manually':
    case 'generate_contract':
    case 'mark_contract_sent':
    case 'mark_contract_signed':
      return 'document'
    case 'send_prewedding':
      return 'questionnaire'
    case 'overdue_delivery':
      return 'delivery'
    default: {
      const _exhaustive: never = kind
      void _exhaustive
      return 'document'
    }
  }
}

/** Local calendar day delta: toKey − fromKey (civil dates, no UTC shift). */
export function attentionDaysBetween(
  fromKey: string,
  toKey: string,
): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = new Date(fy!, fm! - 1, fd!)
  const to = new Date(ty!, tm! - 1, td!)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Relative right-side context for Attention rows.
 * Returns null when there is no meaningful timing signal.
 */
export function formatAttentionRelativeContext(input: {
  kind: StudioAttentionKind
  dueAt: string | null
  weddingDate: string | null
  todayKey?: string
}): string | null {
  const today = input.todayKey ?? localCalendarDateKey()

  if (input.kind === 'overdue_payment' || input.kind === 'overdue_delivery') {
    const due = toLocalCalendarDateKey(input.dueAt)
    if (!due) return 'po terminie'
    if (due === today) return 'dzisiaj'
    if (due < today) {
      const n = attentionDaysBetween(due, today)
      if (n <= 0) return 'po terminie'
      if (n === 1) return '1 dzień po terminie'
      return `${n} dni po terminie`
    }
    // Should not happen for overdue kinds; fall through to future labels.
    const ahead = attentionDaysBetween(today, due)
    if (ahead === 1) return 'jutro'
    return `za ${ahead} dni`
  }

  if (input.kind === 'send_prewedding') {
    const wedding = toLocalCalendarDateKey(input.weddingDate)
    if (!wedding) return null
    if (wedding === today) return 'ślub dzisiaj'
    if (wedding < today) return null
    const n = attentionDaysBetween(today, wedding)
    if (n === 1) return 'ślub jutro'
    return `ślub za ${n} dni`
  }

  // Commercial blockers: do not invent a date column.
  return null
}

export function attentionItemCountLabel(count: number): string {
  const n = Math.max(0, Math.floor(count))
  const abs = n % 100
  const last = abs % 10
  if (n === 1) return '1 pozycja'
  if (last >= 2 && last <= 4 && !(abs >= 12 && abs <= 14)) {
    return `${n} pozycje`
  }
  return `${n} pozycji`
}

/**
 * UI-only issue eyebrow. Presentation mapping — not a domain category.
 * Kept for tests / aria; compact list uses secondary issue line instead.
 */
export function studioAttentionIssueLabel(
  kind: StudioAttentionKind,
): string {
  switch (kind) {
    case 'overdue_payment':
      return 'Płatność po terminie'
    case 'overdue_delivery':
      return 'Termin oddania'
    case 'complete_contract_data_manually':
      return 'Dane do umowy'
    case 'resolve_travel_fee':
      return 'Koszt dojazdu'
    case 'generate_contract':
    case 'mark_contract_sent':
    case 'mark_contract_signed':
      return 'Umowa'
    case 'record_deposit':
      return 'Zadatek'
    case 'send_prewedding':
      return 'Ankieta przedślubna'
    default: {
      const _exhaustive: never = kind
      void _exhaustive
      return 'Uwaga'
    }
  }
}

/**
 * Compact right-side context for list rows.
 * Shortens overdue phrases; preserves prep proximity labels.
 * Does not change relative-time calculation semantics.
 */
export function formatAttentionListContext(
  contextLabel: string | null | undefined,
): string | null {
  const raw = contextLabel?.trim() || null
  if (!raw) return null
  if (raw === '1 dzień po terminie') return '1 dzień'
  const days = /^(\d+) dni po terminie$/.exec(raw)
  if (days) return `${days[1]} dni`
  return raw
}

/** Optional micro calendar line (exact due) — only when useful. */
export function attentionMicroDateLabel(
  kind: StudioAttentionKind,
  dueAt: string | null,
): string | null {
  if (kind !== 'overdue_payment' && kind !== 'overdue_delivery') return null
  const due = toLocalCalendarDateKey(dueAt)
  if (!due) return null
  return formatShortDate(due)
}

/** Compact secondary issue line for list rows. */
export function overduePaymentDescription(
  remainingToPay: number,
  _dueKey: string | null,
): string {
  void _dueKey
  return `Płatność po terminie · ${formatCurrency(remainingToPay)}`
}

export function studioAttentionCopyForKind(
  kind: StudioAttentionKind,
  extras?: { remainingToPay?: number; dueKey?: string | null },
): { description: string; ctaLabel: string } {
  switch (kind) {
    case 'overdue_payment':
      return {
        description: overduePaymentDescription(
          extras?.remainingToPay ?? 0,
          extras?.dueKey ?? null,
        ),
        ctaLabel: 'Przejdź do płatności',
      }
    case 'overdue_delivery':
      return {
        description: 'Termin oddania minął',
        ctaLabel: 'Zobacz termin',
      }
    case 'complete_contract_data_manually':
      return {
        description: 'Uzupełnij dane do umowy',
        ctaLabel: 'Uzupełnij dane',
      }
    case 'resolve_travel_fee':
      return {
        description: 'Koszt dojazdu wymaga decyzji',
        ctaLabel: 'Ustal koszt dojazdu',
      }
    case 'generate_contract':
      return {
        description: 'Umowa gotowa do wygenerowania',
        ctaLabel: 'Przejdź do umowy',
      }
    case 'mark_contract_sent':
      return {
        description: 'Umowa czeka na wysłanie',
        ctaLabel: 'Oznacz jako wysłaną',
      }
    case 'mark_contract_signed':
      return {
        description: 'Umowa czeka na oznaczenie podpisu',
        ctaLabel: 'Oznacz jako podpisaną',
      }
    case 'record_deposit':
      return {
        description: 'Zadatek czeka na rozliczenie',
        ctaLabel: 'Zarejestruj zadatek',
      }
    case 'send_prewedding':
      return {
        description: 'Wyślij ankietę przedślubną',
        ctaLabel: 'Przejdź do ankiety',
      }
    default: {
      const _exhaustive: never = kind
      void _exhaustive
      return { description: '', ctaLabel: 'Otwórz' }
    }
  }
}

/**
 * Diversity selection AFTER global ranking.
 *
 * 1. Walk ranked list; take first item of each represented family
 *    (order = first appearance in global rank).
 * 2. Fill remaining slots from leftover ranked candidates.
 * 3. Cap at limit.
 *
 * Does not reserve empty family slots. Payment-only → top N payments.
 */
export function selectStudioAttentionWithDiversity(
  ranked: StudioAttentionItem[],
  limit: number,
): StudioAttentionItem[] {
  if (ranked.length <= limit) return ranked

  const selected: StudioAttentionItem[] = []
  const selectedIds = new Set<string>()
  const seenFamilies = new Set<StudioAttentionFamily>()

  for (const item of ranked) {
    const family = studioAttentionFamilyOf(item.kind)
    if (seenFamilies.has(family)) continue
    selected.push(item)
    selectedIds.add(item.id)
    seenFamilies.add(family)
    if (selected.length >= limit) return selected
  }

  for (const item of ranked) {
    if (selectedIds.has(item.id)) continue
    selected.push(item)
    selectedIds.add(item.id)
    if (selected.length >= limit) break
  }

  return selected
}
