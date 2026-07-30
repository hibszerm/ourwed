/**
 * Run: npm run test:season-navigation
 */
import {
  areAllSeasonsExpanded,
  expandSeasonKeepingOthers,
  resolveSeasonChipSelection,
  toggleSeasonExpanded,
} from '@/features/shared/presentation/seasonNavigation'
import {
  getDefaultExpandedSeasons,
  groupAssignmentsBySeason,
} from '@/features/shared/presentation/groupAssignmentsBySeason'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

{
  const groups = groupAssignmentsBySeason(
    [
      { date: '2026-01-01' },
      { date: '2028-01-01' },
      { date: '2025-01-01' },
    ],
    (i) => i.date,
    { referenceYear: 2026 },
  )
  const expanded = getDefaultExpandedSeasons(groups, 2026)
  assert(expanded.has(2026), 'current initially expanded')
  assert(!expanded.has(2028), 'future initially collapsed')
  assert(!expanded.has(2025), 'past initially collapsed')
  assertEq(expanded.size, 1, 'only one default')
}

{
  const open = new Set([2026])
  const next = expandSeasonKeepingOthers(open, 2028)
  assert(next.has(2026), 'keeps previous')
  assert(next.has(2028), 'adds year')
}

{
  const open = new Set([2026, 2028])
  const next = toggleSeasonExpanded(open, 2028)
  assert(next.has(2026), 'other remains')
  assert(!next.has(2028), 'toggled closed')
}

{
  const seasons = [2026, 2028]
  assert(!areAllSeasonsExpanded(seasons, new Set([2026])), 'not all')
  assert(areAllSeasonsExpanded(seasons, new Set([2026, 2028])), 'all')
}

{
  const seasons = [2026, 2028]
  const partial = resolveSeasonChipSelection({
    seasons,
    expanded: new Set([2026]),
    activeYear: 2026,
  })
  assertEq(partial.allSelected, false, 'Wszystkie off when collapsed exists')
  assertEq(partial.currentYear, 2026, 'year current')

  const all = resolveSeasonChipSelection({
    seasons,
    expanded: new Set([2026, 2028]),
    activeYear: 2028,
  })
  assertEq(all.allSelected, true, 'Wszystkie on when all open')
  assertEq(all.currentYear, 2028, 'scroll year still tracked')

  const afterCollapse = resolveSeasonChipSelection({
    seasons,
    expanded: new Set([2026]),
    activeYear: 2028,
  })
  assertEq(afterCollapse.allSelected, false, 'collapse clears Wszystkie')
}

console.log('PASS  season navigation')
