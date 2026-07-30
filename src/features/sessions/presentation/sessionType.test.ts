/**
 * Run: npm run test:session-type
 */
import {
  formatSessionType,
  normalizeSessionTypeFields,
  SESSION_TYPE_LABELS,
} from '@/features/sessions/presentation/sessionType'
import type { SessionType } from '@/types/session'

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

for (const [type, label] of Object.entries(SESSION_TYPE_LABELS) as [
  SessionType,
  string,
][]) {
  if (type === 'other') continue
  assertEq(formatSessionType({ sessionType: type }), label, type)
}

assertEq(
  formatSessionType({ sessionType: 'other', customSessionType: 'Produktowa' }),
  'Produktowa',
  'other custom',
)

assertEq(
  formatSessionType({ sessionType: 'other' }),
  'Inna',
  'other fallback label',
)

const cleared = normalizeSessionTypeFields('engagement', 'Produktowa')
assertEq(cleared.customSessionType, undefined, 'clears custom when not other')
assertEq(cleared.sessionType, 'engagement', 'keeps type')

const other = normalizeSessionTypeFields('other', '  Chrzest  ')
assertEq(other.customSessionType, 'Chrzest', 'trims custom')

console.log('PASS  session type')
