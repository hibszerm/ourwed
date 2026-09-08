/**
 * 3G.2 recovery morph — superseded by 3H native document flow.
 * Guards: phone→lock compact morph remains absent; 3F.3 phone fidelity retained.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_TOUR_DASH_SCROLL_MS,
  COMPACT_TOUR_DAY_SCROLL_MS,
  COMPACT_TOUR_ROUTE_TRAVEL_MS,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  assert(a === b, `${m}: ${String(a)} !== ${String(b)}`)
}

function assertIncludes(src: string, needle: string, label: string) {
  assert(src.includes(needle), `missing ${label}: ${needle}`)
}

function assertNotIncludes(src: string, needle: string, label: string) {
  assert(!src.includes(needle), `unexpected ${label}: ${needle}`)
}

console.log('\n=== landing mobile security recovery 3G.2 (retired → 3H) ===\n')

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertNotIncludes(mobile, 'securityRevealLock', 'no reveal lock')
  assertNotIncludes(mobile, 'compactSecurityLockLiftVhAt', 'no securityLift')
  assertIncludes(mobile, 'native-exit', '3H')
  assertEq(COMPACT_TOUR_DASH_SCROLL_MS, 3222, 'dash')
  assertEq(COMPACT_TOUR_DAY_SCROLL_MS, 2027, 'day')
  assertEq(COMPACT_TOUR_ROUTE_TRAVEL_MS, 1878, 'route')
  assert(existsSync(join(ROOT, 'src/features/landing-v2/devices/MarketingPhoneLogicalViewport.tsx')))
  assertIncludes(read('src/features/auth/components/RegisterForm.tsx'), 'const REGISTRATION_ENABLED = false', 'reg')
  console.log('PASS  1. 3G.2 morph retired; tour + 3F.3 retained')
}

console.log('\nPASS  landing mobile security recovery 3G.2 (retired)\n')
