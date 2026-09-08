/**
 * 3G.3 post-lock continuity — superseded by 3H.
 * Sticky 2026 peek and post-lock transform theater removed.
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

console.log('\n=== landing mobile post-lock continuity 3G.3 (retired → 3H) ===\n')

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  const reveal = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.tsx')
  assertIncludes(mobile, 'native-exit', '3H native')
  assertNotIncludes(reveal, 'yearsPeek', '2026 peek removed')
  assertNotIncludes(hist, 'data-studio-years-peek', 'no peek in History flow')
  assertIncludes(hist, 'data-compact-security-section', 'Security document section')
  assertIncludes(read('src/features/auth/components/RegisterForm.tsx'), 'const REGISTRATION_ENABLED = false', 'reg')
  console.log('PASS  1. 3G.3 post-lock + peek retired')
}

console.log('\nPASS  landing mobile post-lock continuity 3G.3 (retired)\n')
