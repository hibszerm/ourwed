/**
 * DEV-only performance marks for OurWed hot paths.
 * No-ops in production; never throws.
 */

export type DevPerfLabel =
  | 'weddingService.getAll'
  | 'weddingService.getById'
  | 'listOwnedWeddingIds'
  | 'dashboard.getDashboardData'
  | 'dashboard.getAssignmentLists'
  | 'calendar.syncWeddingDayEvents'
  | 'calendar.listAll'
  | 'calendar.light-weddings'
  | 'calendar.light-sessions'
  | 'calendar.events'
  | 'calendar.project'
  | 'calendar.repair'
  | 'questionnaire.approve'
  | 'questionnaire.approve.package'
  | 'questionnaire.approve.claim'
  | 'questionnaire.approve.create'
  | 'questionnaire.approve.calendar'
  | 'questionnaire.approve.update'
  | 'questionnaire.approve.extras'
  | 'questionnaire.approve.places'
  | 'questionnaire.approve.attach'
  | 'travelService.recalculate'

const callCounts = new Map<string, number>()

function isDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV)
  } catch {
    return false
  }
}

function mark(name: string) {
  try {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name)
    }
  } catch {
    /* ignore */
  }
}

function measureMs(name: string, start: string, end: string): number | null {
  try {
    if (typeof performance !== 'undefined' && performance.measure) {
      performance.measure(name, start, end)
      const entries = performance.getEntriesByName(name)
      const last = entries[entries.length - 1]
      return last?.duration ?? null
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Reset call counters (tests / DEV diagnostics). */
export function resetDevPerfCounts(): void {
  callCounts.clear()
}

export function getDevPerfCount(label: DevPerfLabel): number {
  return callCounts.get(label) ?? 0
}

export function getDevPerfCounts(): Record<string, number> {
  return Object.fromEntries(callCounts.entries())
}

/**
 * Time an async operation in DEV. Always runs `fn`; marks only when DEV.
 */
export async function withDevPerf<T>(
  label: DevPerfLabel,
  fn: () => Promise<T>,
): Promise<T> {
  callCounts.set(label, (callCounts.get(label) ?? 0) + 1)
  if (!isDev()) return fn()

  const start = `${label}:start:${callCounts.get(label)}`
  const end = `${label}:end:${callCounts.get(label)}`
  const measureName = `${label}:${callCounts.get(label)}`
  mark(start)
  try {
    return await fn()
  } finally {
    mark(end)
    const ms = measureMs(measureName, start, end)
    if (ms != null && typeof console !== 'undefined') {
      console.debug(`[perf] ${label} ${Math.round(ms)}ms`)
    }
  }
}
