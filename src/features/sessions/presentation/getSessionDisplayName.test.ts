/**
 * Run: npm run test:session-display-name
 */
import {
  getSessionDisplayName,
  SESSION_DISPLAY_NAME_FALLBACK,
} from '@/features/sessions/presentation/getSessionDisplayName'

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

assertEq(
  getSessionDisplayName({
    customName: 'Sesja wizerunkowa dla restauracji',
    primaryPerson: { firstName: 'Anna', lastName: 'Nowak' },
    secondaryPerson: { firstName: 'Michał', lastName: 'Kowalski' },
  }),
  'Sesja wizerunkowa dla restauracji',
  'custom wins',
)

assertEq(
  getSessionDisplayName({
    primaryPerson: { firstName: 'Anna' },
    secondaryPerson: { firstName: 'Michał' },
  }),
  'Anna i Michał',
  'two people',
)

assertEq(
  getSessionDisplayName({
    primaryPerson: { firstName: 'Katarzyna', lastName: 'Kowalska' },
  }),
  'Katarzyna Kowalska',
  'one full name',
)

assertEq(
  getSessionDisplayName({
    primaryPerson: { firstName: 'Kasia' },
  }),
  'Kasia',
  'partial first',
)

assertEq(
  getSessionDisplayName({
    primaryPerson: { lastName: 'Nowak' },
  }),
  'Nowak',
  'partial last',
)

assertEq(
  getSessionDisplayName({ primaryPerson: {} }),
  SESSION_DISPLAY_NAME_FALLBACK,
  'fallback',
)

console.log('PASS  session display name')
