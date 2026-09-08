/**
 * 3G.1 reveal-under-phone — REJECTED then superseded by 3H native flow.
 * Guards: reveal architecture remains absent; compact uses native exit.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, label: string) {
  assert(src.includes(needle), `missing ${label}: ${needle}`)
}

function assertNotIncludes(src: string, needle: string, label: string) {
  assert(!src.includes(needle), `unexpected ${label}: ${needle}`)
}

console.log('\n=== landing mobile security story 3G.1 (retired → 3H) ===\n')

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertNotIncludes(mobile, 'securityRevealLock', 'no pre-mounted lock')
  assertNotIncludes(mobile, 'compactPhoneExitScaleAt', 'no phone-exit reveal')
  assertNotIncludes(mobile, 'geometryMorph={!isCompactViewport}', 'no geometryMorph flag path')
  assertIncludes(mobile, 'native-exit', '3H native exit')
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  1. 3G.1 reveal absent; 3H native')
}

console.log('\nPASS  landing mobile security story 3G.1 (retired)\n')
