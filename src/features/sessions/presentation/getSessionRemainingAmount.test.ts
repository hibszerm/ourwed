/**
 * Run: npm run test:session-finance
 */
import { getSessionRemainingAmount } from '@/features/sessions/presentation/getSessionRemainingAmount'

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
}

assertEq(getSessionRemainingAmount(1200, 300), 900, 'normal')
assertEq(getSessionRemainingAmount(1200, 1200), 0, 'fully paid')
assertEq(getSessionRemainingAmount(500, 800), 0, 'no negative')
assertEq(getSessionRemainingAmount(0, 0), 0, 'zeros')

console.log('PASS  session finance')
