/**
 * Lightweight Finance Center season loader.
 * Parallel: light weddings + light sessions + wedding payments batch + session payments batch.
 * NEVER hydrates full weddings/sessions.
 */

import { resolveStudioUserId } from '@/lib/api/studioUser'
import { paymentService } from '@/lib/api/paymentService'
import { sessionPaymentService } from '@/lib/api/sessionPaymentService'
import { supabase } from '@/lib/supabase'
import { throwOnError, toDateString } from '@/lib/supabase/helpers'
import {
  FINANCE_INCLUDED_STATUSES,
  buildFinanceSeasonModel,
  seasonDateRange,
  type FinanceSessionScalarRow,
  type FinanceWeddingScalarRow,
} from '@/lib/finance/financeSeasonAggregate'
import type { FinanceSeasonModel } from '@/lib/finance/financeSeasonTypes'

/** Exact select list — architectural tests pin this string. */
export const FINANCE_SEASON_WEDDING_SELECT =
  'id, user_id, wedding_date, status, bride_name, groom_name, display_name, contract_value, deposit_amount, currency'

export const FINANCE_SEASON_SESSION_SELECT =
  'id, user_id, session_date, session_type, custom_name, primary_first_name, primary_last_name, secondary_first_name, secondary_last_name, custom_session_type, total_price, deposit_amount, linked_wedding_id'

interface FinanceWeddingDbRow {
  id: string
  user_id: string
  wedding_date: string | null
  status: string
  bride_name: string
  groom_name: string
  display_name: string | null
  contract_value: number | string | null
  deposit_amount: number | string | null
  currency: string | null
}

interface FinanceSessionDbRow {
  id: string
  user_id: string
  session_date: string | null
  session_type: string
  custom_name: string | null
  primary_first_name: string | null
  primary_last_name: string | null
  secondary_first_name: string | null
  secondary_last_name: string | null
  custom_session_type: string | null
  total_price: number | string | null
  deposit_amount: number | string | null
  linked_wedding_id: string | null
}

function mapWeddingRow(
  row: FinanceWeddingDbRow,
): FinanceWeddingScalarRow | null {
  const weddingDate = toDateString(row.wedding_date)
  if (!weddingDate) return null
  if (row.status !== 'active' && row.status !== 'archived') return null
  return {
    id: row.id,
    wedding_date: weddingDate,
    status: row.status,
    bride_name: row.bride_name ?? '',
    groom_name: row.groom_name ?? '',
    display_name: row.display_name,
    contract_value: row.contract_value,
    deposit_amount: row.deposit_amount,
    currency: row.currency,
  }
}

function mapSessionRow(row: FinanceSessionDbRow): FinanceSessionScalarRow | null {
  const sessionDate = toDateString(row.session_date)
  if (!sessionDate) return null
  return {
    id: row.id,
    session_date: sessionDate,
    session_type: row.session_type,
    custom_name: row.custom_name,
    primary_first_name: row.primary_first_name,
    primary_last_name: row.primary_last_name,
    secondary_first_name: row.secondary_first_name,
    secondary_last_name: row.secondary_last_name,
    custom_session_type: row.custom_session_type,
    total_price: row.total_price,
    deposit_amount: row.deposit_amount,
    linked_wedding_id: row.linked_wedding_id,
  }
}

export const financeSeasonService = {
  /**
   * Load one season: light weddings + light sessions + two payment batches.
   */
  async loadSeason(seasonYear: number): Promise<FinanceSeasonModel> {
    const userId = await resolveStudioUserId()
    const { from, to } = seasonDateRange(seasonYear)

    const [weddingsRes, sessionsRes] = await Promise.all([
      supabase
        .from('weddings')
        .select(FINANCE_SEASON_WEDDING_SELECT)
        .eq('user_id', userId)
        .in('status', [...FINANCE_INCLUDED_STATUSES])
        .gte('wedding_date', from)
        .lte('wedding_date', to)
        .not('wedding_date', 'is', null)
        .order('wedding_date', { ascending: true }),
      supabase
        .from('sessions')
        .select(FINANCE_SEASON_SESSION_SELECT)
        .eq('user_id', userId)
        .gte('session_date', from)
        .lte('session_date', to)
        .not('session_date', 'is', null)
        .order('session_date', { ascending: true }),
    ])

    throwOnError(weddingsRes.error)
    throwOnError(sessionsRes.error)

    const weddingRows: FinanceWeddingScalarRow[] = []
    for (const raw of (weddingsRes.data ?? []) as FinanceWeddingDbRow[]) {
      const mapped = mapWeddingRow(raw)
      if (mapped) weddingRows.push(mapped)
    }

    const sessionRows: FinanceSessionScalarRow[] = []
    for (const raw of (sessionsRes.data ?? []) as FinanceSessionDbRow[]) {
      const mapped = mapSessionRow(raw)
      if (mapped) sessionRows.push(mapped)
    }

    const weddingIds = weddingRows.map((r) => r.id)
    const sessionIds = sessionRows.map((r) => r.id)

    const [paymentsByWeddingId, paymentsBySessionId] = await Promise.all([
      paymentService.listByWeddingIds(weddingIds),
      sessionPaymentService.listBySessionIds(sessionIds),
    ])

    return buildFinanceSeasonModel(
      seasonYear,
      weddingRows,
      paymentsByWeddingId,
      sessionRows,
      paymentsBySessionId,
    )
  },

  /**
   * Distinct calendar years with at least one included wedding or session.
   */
  async listAvailableSeasonYears(): Promise<number[]> {
    const userId = await resolveStudioUserId()

    const [weddingsRes, sessionsRes] = await Promise.all([
      supabase
        .from('weddings')
        .select('wedding_date')
        .eq('user_id', userId)
        .in('status', [...FINANCE_INCLUDED_STATUSES])
        .not('wedding_date', 'is', null),
      supabase
        .from('sessions')
        .select('session_date')
        .eq('user_id', userId)
        .not('session_date', 'is', null),
    ])

    throwOnError(weddingsRes.error)
    throwOnError(sessionsRes.error)

    const years = new Set<number>()
    for (const row of (weddingsRes.data ?? []) as {
      wedding_date: string | null
    }[]) {
      const d = toDateString(row.wedding_date)
      if (!d) continue
      const y = Number(d.slice(0, 4))
      if (Number.isInteger(y) && y >= 2000 && y <= 2100) years.add(y)
    }
    for (const row of (sessionsRes.data ?? []) as {
      session_date: string | null
    }[]) {
      const d = toDateString(row.session_date)
      if (!d) continue
      const y = Number(d.slice(0, 4))
      if (Number.isInteger(y) && y >= 2000 && y <= 2100) years.add(y)
    }
    return [...years].sort((a, b) => a - b)
  },
}
