/**
 * Finance entrance lifecycle — one FINAL RHYTHM per Finance route visit.
 * Run: npm run test:finance-entrance-lifecycle
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

const hook = read('src/features/finance/useFinanceEntranceReveal.ts')
const page = read('src/pages/FinancePage.tsx')
const animated = read('src/features/finance/AnimatedCurrencyValue.tsx')
const motion = read('src/features/finance/financeMotion.ts')
const css = read('src/features/finance/FinanceCenter.module.css')

{
  assertIncludes(
    hook,
    'once per FinancePage mount',
    'A: documents one entrance per route visit',
  )
  assertIncludes(hook, 'entranceConsumed', 'visit consumed flag')
  assertIncludes(hook, 'cancelled', 'F: abort/retry for Strict Mode')
  assertIncludes(
    hook,
    'Do not set entranceConsumed here',
    'F: cleanup must not permanently consume aborted start',
  )
  assertIncludes(
    hook,
    'warm React Query cache on route re-entry',
    'G: warm cache still gets prep→play',
  )
  assertIncludes(hook, "phase: 'prep'", 'G: first-ready is prep not done')
  assertIncludes(
    hook,
    'if (cancelled) return\n        entranceConsumed.current = true',
    'consume only after play rAF fires',
  )
  console.log('PASS  A/F/G  route visit entrance ownership')
}

{
  assertIncludes(page, 'selectMonth', 'B: month helper')
  assertIncludes(page, 'completeEntrance()', 'B: month may complete in-flight')
  assertIncludes(page, 'setKindFilter', 'C: kind filter')
  assertNotIncludes(
    page.slice(page.indexOf('FinanceKindChips'), page.indexOf('FinanceKindChips') + 200),
    'completeEntrance',
    'C: kind filter does not restart entrance',
  )
  assertIncludes(page, 'setPaymentFilter', 'D: health filter')
  assertIncludes(page, 'selectTab', 'E: Sezon/Zlecenia')
  assertIncludes(
    page,
    "next === 'weddings' && (reveal === 'prep' || reveal === 'play')",
    'E: tab only completes in-flight, does not replay when done',
  )
  console.log('PASS  B/C/D/E  internal interactions do not own new entrance')
}

{
  assertIncludes(animated, 'countedRef', 'KPI once-per-mount count lock')
  assertIncludes(
    animated,
    'Count-up runs once on page entrance',
    'KPI remounts with FinancePage on new visit',
  )
  assertIncludes(css, "data-finance-reveal='play'] .chartBarStack", 'chart rises on play')
  assertIncludes(
    css,
    "data-finance-reveal='done'] .chartBarStack",
    'E: done kills Sezon remount bar replay',
  )
  console.log('PASS  KPI/chart lifecycle ownership')
}

{
  assertIncludes(motion, 'FINANCE_ENTRANCE_DONE_MS = 1360', 'FINAL RHYTHM done')
  assertIncludes(motion, 'FINANCE_COUNT_MS = 900', 'FINAL RHYTHM count')
  assertIncludes(css, '--finance-motion-bars-delay-base: 220ms', 'chart delay')
  assertIncludes(css, '--finance-motion-bars: 940ms', 'chart duration')
  assertIncludes(css, '--finance-motion-health-delay: 620ms', 'health')
  assertIncludes(css, '--finance-motion-preview-delay: 760ms', 'preview')
  assertIncludes(css, 'cubic-bezier(0.3, 0, 0.18, 1)', 'chart easing')
  assertNotIncludes(page, 'Ładowanie finansów sezonu', 'loading copy stays removed')
  assertIncludes(hook, 'prefers-reduced-motion', 'H: reduced motion')
  assertIncludes(hook, "phase: 'done'", 'H: reduced → done')
  console.log('PASS  FINAL RHYTHM + loading copy + reduced motion frozen')
}

{
  assertNotIncludes(hook, 'sessionStorage', 'no sessionStorage replay gate')
  assertNotIncludes(hook, 'localStorage', 'no localStorage replay gate')
  assertNotIncludes(hook, 'Date.now()', 'no timestamp replay gate')
  assertNotIncludes(page, 'key={Date.now()', 'no unstable animation keys')
  console.log('PASS  no global/persistent replay hacks')
}

console.log('\nAll finance entrance lifecycle acceptance checks passed.')
