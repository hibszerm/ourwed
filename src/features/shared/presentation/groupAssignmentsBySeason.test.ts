/**
 * Run: npm run test:season-grouping
 */
import {
  compareSeasonsForDisplay,
  formatSessionSeasonCount,
  formatWeddingSeasonCount,
  getDefaultExpandedSeasons,
  getEventSeasonYear,
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

function assertArrEq(a: unknown[], b: unknown[], m: string) {
  assertEq(JSON.stringify(a), JSON.stringify(b), m)
}

// Year extraction
assertEq(getEventSeasonYear('2020-05-01'), 2020, 'manual year 2020')
assertEq(getEventSeasonYear('2026-07-31'), 2026, '2026')
assertEq(getEventSeasonYear('2026-07-31T12:00:00Z'), 2026, 'iso with time')
assertEq(getEventSeasonYear(''), null, 'empty')
assertEq(getEventSeasonYear(null), null, 'null')

// Dynamic grouping — no hardcoded years; 2020 appears when present
{
  const items = [
    { id: 'a', date: '2027-01-01' },
    { id: 'b', date: '2020-06-15' },
    { id: 'c', date: '2026-08-01' },
    { id: 'd', date: '2025-03-01' },
    { id: 'e', date: '2028-09-01' },
    { id: 'f', date: '2026-12-01' },
  ]
  const groups = groupAssignmentsBySeason(items, (i) => i.date, {
    referenceYear: 2026,
  })
  assertArrEq(
    groups.map((g) => g.season),
    [2026, 2027, 2028, 2025, 2020],
    'order: current → future asc → past desc',
  )
  assertEq(groups[0]?.items.length, 2, '2026 has two')
  assert(groups.some((g) => g.season === 2020), 'manual 2020 season created')
  assertEq(
    groups.find((g) => g.season === 2020)?.items[0]?.id,
    'b',
    '2020 item',
  )
}

// Preserve within-season order
{
  const items = [
    { id: '1', date: '2026-01-01' },
    { id: '2', date: '2026-06-01' },
    { id: '3', date: '2026-12-01' },
  ]
  const groups = groupAssignmentsBySeason(items, (i) => i.date, {
    referenceYear: 2026,
  })
  assertArrEq(
    groups[0]!.items.map((i) => i.id),
    ['1', '2', '3'],
    'within-season order preserved',
  )
}

// compareSeasonsForDisplay unit
assert(compareSeasonsForDisplay(2026, 2027, 2026) < 0, 'current before future')
assert(compareSeasonsForDisplay(2027, 2028, 2026) < 0, 'future asc')
assert(compareSeasonsForDisplay(2025, 2024, 2026) < 0, 'past desc')
assert(compareSeasonsForDisplay(2027, 2025, 2026) < 0, 'future before past')

// Default expansion
{
  const groups = groupAssignmentsBySeason(
    [
      { date: '2027-01-01' },
      { date: '2026-01-01' },
      { date: '2025-01-01' },
    ],
    (i) => i.date,
    { referenceYear: 2026 },
  )
  const expanded = getDefaultExpandedSeasons(groups, 2026)
  assert(expanded.has(2026), 'current expanded')
  assertEq(expanded.size, 1, 'only one default')
}

{
  const groups = groupAssignmentsBySeason(
    [{ date: '2027-01-01' }, { date: '2028-01-01' }],
    (i) => i.date,
    { referenceYear: 2026 },
  )
  const expanded = getDefaultExpandedSeasons(groups, 2026)
  assertEq([...expanded][0], 2027, 'first group when current missing')
}

// Counts
assertEq(formatWeddingSeasonCount(1), '1 ślub', '1 wedding')
assertEq(formatWeddingSeasonCount(2), '2 śluby', '2 weddings')
assertEq(formatWeddingSeasonCount(5), '5 ślubów', '5 weddings')
assertEq(formatWeddingSeasonCount(12), '12 ślubów', '12 weddings')
assertEq(formatWeddingSeasonCount(22), '22 śluby', '22 weddings')
assertEq(formatSessionSeasonCount(1), '1 sesja', '1 session')
assertEq(formatSessionSeasonCount(3), '3 sesje', '3 sessions')
assertEq(formatSessionSeasonCount(5), '5 sesji', '5 sessions')
assertEq(formatSessionSeasonCount(18), '18 sesji', '18 sessions')

// Filter-before-grouping simulation
{
  const all = [
    { id: 'j', date: '2026-07-01', name: 'Joanna' },
    { id: 'a', date: '2027-07-01', name: 'Anna' },
    { id: 'j2', date: '2025-07-01', name: 'Joanna' },
  ]
  const filtered = all.filter((i) =>
    i.name.toLowerCase().includes('joanna'),
  )
  const groups = groupAssignmentsBySeason(filtered, (i) => i.date, {
    referenceYear: 2026,
  })
  assertArrEq(
    groups.map((g) => g.season),
    [2026, 2025],
    'search then group — only matching seasons',
  )
  assert(!groups.some((g) => g.season === 2027), 'non-match season gone')
}

console.log('PASS  season grouping')
