export const FINANCE_QUERY_ROOT = 'finance' as const

export function financeSeasonQueryKey(
  userId: string | undefined,
  seasonYear: number,
) {
  return [FINANCE_QUERY_ROOT, 'season', userId, seasonYear] as const
}

export function financeSeasonYearsQueryKey(userId: string | undefined) {
  return [FINANCE_QUERY_ROOT, 'season-years', userId] as const
}
