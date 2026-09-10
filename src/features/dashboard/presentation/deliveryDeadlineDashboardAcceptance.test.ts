/**
 * Dashboard delivery deadline D3.3 presentation + D3.1 query acceptance.
 * Run: npm run test:dashboard-delivery-deadline
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDeliveryDeadlineBand } from '@/lib/utils/weddingDeliveryDeadline'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

type DeadlineCandidate = {
  id: string
  weddingDate?: string | null
  deliveryDueDate?: string | null
  deliveryCompletedAt?: string | null
  createdAt?: string
}

function pickNearestActiveDeliveryDeadlines(
  weddings: DeadlineCandidate[],
): DeadlineCandidate[] {
  return weddings
    .filter((w) => w.deliveryDueDate && !w.deliveryCompletedAt)
    .sort((a, b) => {
      const dueCmp = (a.deliveryDueDate ?? '').localeCompare(b.deliveryDueDate ?? '')
      if (dueCmp !== 0) return dueCmp
      const weddingCmp = (a.weddingDate ?? '').localeCompare(b.weddingDate ?? '')
      if (weddingCmp !== 0) return weddingCmp
      const createdCmp = (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
      if (createdCmp !== 0) return createdCmp
      return a.id.localeCompare(b.id)
    })
    .slice(0, 3)
}

{
  const picked = pickNearestActiveDeliveryDeadlines([
    { id: 'a', deliveryDueDate: '2026-08-20' },
    { id: 'b', deliveryDueDate: '2026-08-25' },
  ])
  assertEq(picked[0]?.id, 'a', 'A. earliest active wins')
}

{
  const picked = pickNearestActiveDeliveryDeadlines([
    {
      id: 'a',
      deliveryDueDate: '2026-08-20',
      deliveryCompletedAt: '2026-08-19T09:00:00.000Z',
    },
    { id: 'b', deliveryDueDate: '2026-08-25' },
  ])
  assertEq(picked[0]?.id, 'b', 'B. completed ignored')
}

{
  const picked = pickNearestActiveDeliveryDeadlines([
    { id: 'a', deliveryDueDate: '2026-08-10' },
    { id: 'b', deliveryDueDate: '2026-08-18' },
    { id: 'c', deliveryDueDate: '2026-08-20' },
  ])
  assertEq(picked[0]?.id, 'a', 'C. oldest overdue wins')
}

{
  const picked = pickNearestActiveDeliveryDeadlines([
    { id: 'a', deliveryDueDate: null },
    { id: 'b', deliveryDueDate: '2026-08-25', deliveryCompletedAt: '2026-08-20T12:00:00.000Z' },
  ])
  assertEq(picked.length, 0, 'D/E. null due and completed ignored')
}

{
  const picked = pickNearestActiveDeliveryDeadlines([
    { id: 'a', deliveryDueDate: '2026-08-22' },
    { id: 'b', deliveryDueDate: '2026-08-21' },
    { id: 'c', deliveryDueDate: '2026-08-23' },
    { id: 'd', deliveryDueDate: '2026-08-24' },
  ])
  assertEq(picked.length, 3, 'max 3 rows')
  assertEq(picked[0]?.id, 'b', 'manual override ordering relies on persisted due')
}

{
  const picked = pickNearestActiveDeliveryDeadlines([
    { id: 'a', weddingDate: '2027-01-01', deliveryDueDate: '2026-08-25' },
    { id: 'b', weddingDate: '2026-01-01', deliveryDueDate: '2026-08-25' },
  ])
  assertEq(picked[0]?.id, 'b', 'tie breaker wedding_date')
}

{
  const upcoming = getDeliveryDeadlineBand({
    deliveryDueDate: '2027-01-18',
    deliveryCompletedAt: null,
    todayKey: '2026-08-18',
  })
  assertEq(upcoming.state, 'upcoming', 'upcoming state')
  assert(upcoming.contextLabel?.startsWith('za ') === true, 'upcoming copy')

  const today = getDeliveryDeadlineBand({
    deliveryDueDate: '2026-08-18',
    deliveryCompletedAt: null,
    todayKey: '2026-08-18',
  })
  assertEq(today.contextLabel, 'dzisiaj', 'today copy')

  const overdue = getDeliveryDeadlineBand({
    deliveryDueDate: '2026-08-10',
    deliveryCompletedAt: null,
    todayKey: '2026-08-18',
  })
  assertEq(overdue.contextLabel, '8 dni po terminie', 'overdue copy')
}

{
  const service = read('src/lib/api/dashboardService.ts')
  const nearestFn = service.slice(
    service.indexOf('async getNearestDeliveryDeadlines'),
    service.indexOf('},', service.indexOf('async getNearestDeliveryDeadlines')),
  )
  assert(service.includes('getNearestDeliveryDeadlines'), 'service plural method exists')
  assert(service.includes('DASHBOARD_DELIVERY_DEADLINE_SELECT'), 'dedicated select')
  assert(nearestFn.includes(".not('delivery_due_date', 'is', null)"), 'requires due date')
  assert(nearestFn.includes(".is('delivery_completed_at', null)"), 'completed excluded')
  assert(nearestFn.includes("order('delivery_due_date'"), 'delivery sort')
  assert(nearestFn.includes(".limit(3)"), 'limit 3')
  assert(!nearestFn.includes('resolveDeliveryDueDate('), 'no deadline recompute')
  assert(!nearestFn.includes('weddingService.getById'), 'no getById')
  assert(!nearestFn.includes('listByWeddingIds('), 'no contract/place hydrate in deadline query')
}

{
  const hook = read('src/features/dashboard/hooks/useNearestDeliveryDeadline.ts')
  assert(hook.includes('useNearestDeliveryDeadlines'), 'plural hook')
  assert(hook.includes("['dashboard', 'delivery-deadlines', userId]"), 'query key')

  const card = read('src/features/dashboard/components/NearestDeliveryDeadlineCard.tsx')
  assert(card.includes('Terminy oddania'), 'panel label')
  assert(card.includes('const primary = deadlines[0]'), 'exactly one primary deadline')
  assert(card.includes('const secondary = deadlines.slice(1)'), 'secondary group from remaining')
  assert(card.includes('Kolejne'), 'secondary group label')
  assert(card.includes('secondary.length > 0'), 'Kolejne hidden when only one deadline')
  assert(card.includes('function PrimaryDeadline'), 'primary hierarchy component')
  assert(card.includes('function SecondaryDeadline'), 'secondary hierarchy component')
  assert(card.includes('className={styles.primary}'), 'primary block is Link')
  assert(card.includes('className={styles.secondaryRow}'), 'secondary rows are Links')
  assert(card.includes('deadlineEmptyCopy'), 'honest empty via shared copy')
  assert(card.includes('hasWeddingHistory'), 'zero-history vs established predicate')

  const emptyCopy = read('src/features/dashboard/presentation/dashboardEmptyCopy.ts')
  assert(emptyCopy.includes('DEADLINE_EMPTY_ZERO_HISTORY'), 'zero-history empty constant')
  assert(emptyCopy.includes('DEADLINE_EMPTY_ESTABLISHED'), 'established empty constant')
  assert(
    emptyCopy.includes("title: 'Brak aktywnych terminów'"),
    'established empty title is factual (no false completion)',
  )
  assert(!emptyCopy.includes('Wszystko oddane'), 'false “Wszystko oddane” removed from empty state')
  assert(
    emptyCopy.includes('Brak aktywnych terminów oddania'),
    'established empty body stays deadline-scoped',
  )
  assert(card.includes('getDeliveryDeadlineBand'), 'shared state helper')
  assert(card.includes('deadline.href'), 'detail href')
  assert(card.includes('aria-label={deadlineAriaLabel'), 'row-level navigation label')
  assert(!card.includes('<Button'), 'no repeated open buttons')
  assert(!card.includes('IconChevronRight'), 'no settings-list chevrons')
  assert(!card.includes('deliveryMonths'), 'no months/days recompute')
  assert(!card.includes('workflowStage'), 'no workflow stage')
  assert(!card.includes('<button'), 'no nested interactive elements')
}

{
  const page = read('src/pages/DashboardPage.tsx')
  const primaryIdx = page.indexOf('<div className={styles.primary}>')
  const todoIdx = page.indexOf('<TodoTodayCard weddings={weddings} />')
  const panelIdx = page.indexOf('<NearestDeliveryDeadlineCard')
  const secondaryIdx = page.indexOf('<div className={styles.secondary}>')
  const notificationsIdx = page.indexOf('<NotificationsCard />')
  assert(primaryIdx >= 0 && secondaryIdx > primaryIdx, 'grid columns present')
  assert(todoIdx > primaryIdx, 'todo in left column')
  assert(panelIdx > todoIdx && panelIdx < secondaryIdx, 'panel below Dzisiaj in left')
  assert(notificationsIdx > secondaryIdx, 'notifications in right column')

  const css = read(
    'src/features/dashboard/components/NearestDeliveryDeadlineCard.module.css',
  )
  assert(css.includes('.primaryName'), 'primary name hierarchy')
  assert(css.includes('.primaryDate'), 'primary date is the stronger secondary element')
  assert(css.includes('.primaryRelative'), 'primary urgency grouped under date')
  assert(css.includes('.secondaryGroup'), 'secondary group container')
  assert(css.includes('.secondaryLabel'), 'Kolejne label style')
  assert(css.includes('.secondaryName'), 'secondary quieter typography')
  assert(
    css.includes('min-height: 88px') && css.includes('min-height: 52px'),
    'touch targets primary + secondary',
  )
  assert(css.includes('.primary:focus-visible'), 'keyboard focus visible')
  assert(css.includes('@media (max-width: 767px)'), 'mobile rules')
  assert(!css.includes('.chevron'), 'chevrons removed from styles')
}

console.log('PASS  dashboard delivery deadline D3.3')
