/**
 * Unit: PRO access error classification.
 */
import {
  isProAccessRequiredError,
  PRO_ACCESS_REQUIRED,
  toProAccessUserMessage,
} from '@/features/billing/proAccessError'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL proAccessError — ${msg}`)
}

assert(isProAccessRequiredError(new Error('PRO_ACCESS_REQUIRED')), 'exact code')
assert(isProAccessRequiredError(new Error('pro_required')), 'legacy message')
assert(
  isProAccessRequiredError({ message: 'x', code: 'P0001', hint: 'Active PRO entitlement' }),
  'hint+code',
)
assert(!isProAccessRequiredError(new Error('not_owner')), 'ownership not mapped')
assert(
  !isProAccessRequiredError({ message: 'permission denied', code: '42501' }),
  'bare 42501 not mapped',
)
assert(toProAccessUserMessage().includes('PRO'), 'user message')
assert(PRO_ACCESS_REQUIRED === 'PRO_ACCESS_REQUIRED', 'constant')

console.log('PASS  proAccessError')
