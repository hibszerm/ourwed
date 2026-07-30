/**
 * Run: npm run test:sessions-list-view
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseSessionsViewMode,
  SESSIONS_VIEW_MODE_KEY,
} from '@/features/sessions/presentation/sessionsViewMode'
import { WEDDINGS_VIEW_MODE_KEY } from '@/features/weddings/presentation/weddingsViewMode'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

assertEq(parseSessionsViewMode(null), 'grid', 'default grid')
assertEq(parseSessionsViewMode('list'), 'list', 'list')
assertEq(parseSessionsViewMode('nope'), 'grid', 'invalid')
assertEq(SESSIONS_VIEW_MODE_KEY, 'ourwed:sessions-view-mode', 'key')
assert(
  String(SESSIONS_VIEW_MODE_KEY) !== String(WEDDINGS_VIEW_MODE_KEY),
  'sessions pref isolated from weddings',
)

const list = src('src/features/sessions/components/SessionList.tsx')
const rowStart = list.indexOf('className={styles.row}')
const chunk = list.slice(rowStart, list.indexOf('</Link>', rowStart))
const datePos = chunk.indexOf('styles.date')
const namePos = chunk.indexOf('styles.name')
assert(datePos >= 0 && namePos > datePos, 'date before name in JSX')

assert(list.includes('getSessionDisplayName'), 'display name')
assert(list.includes('getSessionLocationSummary'), 'location')
assert(list.includes('formatCurrency'), 'currency')
assert(list.includes('to={`/sesje/${session.id}`}'), 'nav')

const page = src('src/pages/SessionsPage.tsx')
assert(page.includes('SessionsViewSwitch'), 'switcher')
assert(page.includes('readSessionsViewMode'), 'pref read')
assert(page.includes('SeasonGroupedList'), 'shared season list')
assert(page.includes('formatSessionSeasonCount'), 'session counts')
assert(page.includes("viewMode === 'list'"), 'exclusive render')
assert(page.includes('getSessionDisplayName'), 'search uses display name')

console.log('PASS  sessions list view')
