export const FINANCE_MONTH_LABELS_SHORT = [
  'Sty',
  'Lut',
  'Mar',
  'Kwi',
  'Maj',
  'Cze',
  'Lip',
  'Sie',
  'Wrz',
  'Paź',
  'Lis',
  'Gru',
] as const

export const FINANCE_MONTH_LABELS_FULL = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
] as const

/** Season overview preview — full list lives on Zlecenia. */
export const FINANCE_SEASON_PREVIEW_LIMIT = 5

function polishCount(n: number, one: string, few: string, many: string): string {
  const abs = Math.max(0, Math.round(n))
  const mod100 = abs % 100
  const last = mod100 % 10
  let word = many
  if (abs === 1) word = one
  else if (last >= 2 && last <= 4 && (mod100 < 10 || mod100 >= 20)) word = few
  return `${abs} ${word}`
}

export function formatFinanceAssignmentCount(count: number): string {
  return polishCount(count, 'zlecenie', 'zlecenia', 'zleceń')
}

export function formatFinanceWeddingCount(count: number): string {
  return polishCount(count, 'ślub', 'śluby', 'ślubów')
}

export function formatFinanceSessionCount(count: number): string {
  return polishCount(count, 'sesja', 'sesje', 'sesji')
}

export type FinanceSecondarySummaryParts = {
  /** Count metrics (zlecenia / śluby / sesje) — may wrap between items. */
  metrics: string[]
  /** Indivisible average metric, or null when absent. */
  average: string | null
}

/** Structured secondary KPI summary — keeps average as one wrap unit. */
export function getFinanceSecondarySummaryParts(opts: {
  kindFilter: 'all' | 'wedding' | 'session'
  assignmentCount: number
  weddingCount: number
  sessionCount: number
  averageContractValue: number | null
  formatMoney: (n: number) => string
}): FinanceSecondarySummaryParts {
  const metrics: string[] = []
  if (opts.kindFilter === 'all') {
    metrics.push(formatFinanceAssignmentCount(opts.assignmentCount))
    metrics.push(formatFinanceWeddingCount(opts.weddingCount))
    metrics.push(formatFinanceSessionCount(opts.sessionCount))
  } else if (opts.kindFilter === 'wedding') {
    metrics.push(formatFinanceWeddingCount(opts.weddingCount))
  } else {
    metrics.push(formatFinanceSessionCount(opts.sessionCount))
  }
  const average =
    opts.averageContractValue != null
      ? `Średnia wartość ${opts.formatMoney(opts.averageContractValue)}`
      : null
  return { metrics, average }
}

export function formatFinanceSecondarySummary(opts: {
  kindFilter: 'all' | 'wedding' | 'session'
  assignmentCount: number
  weddingCount: number
  sessionCount: number
  averageContractValue: number | null
  formatMoney: (n: number) => string
}): string {
  const { metrics, average } = getFinanceSecondarySummaryParts(opts)
  return [...metrics, ...(average ? [average] : [])].join(' · ')
}

export function financePaymentStatusLabel(
  status: 'paid' | 'partial' | 'unpaid' | 'value_unset',
  opts?: { compact?: boolean },
): string {
  switch (status) {
    case 'paid':
      return 'Opłacone'
    case 'partial':
      return opts?.compact ? 'Częściowo' : 'Częściowo opłacone'
    case 'unpaid':
      return 'Bez wpłat'
    case 'value_unset':
      return 'Brak wartości'
  }
}

export function financeWeddingDetailHref(weddingId: string): string {
  return `/sluby/${weddingId}?tab=contract_finance`
}

export function financeSessionDetailHref(sessionId: string): string {
  return `/sesje/${sessionId}`
}

export function financeAssignmentKindLabel(
  kind: 'wedding' | 'session',
): string {
  return kind === 'wedding' ? 'Ślub' : 'Sesja'
}
