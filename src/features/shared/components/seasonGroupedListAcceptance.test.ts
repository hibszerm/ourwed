/**
 * Shared season list UI wiring for Weddings + Sessions.
 * Run: npm run test:season-list-ui
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const ui = src('src/features/shared/components/SeasonGroupedList.tsx')
const css = src('src/features/shared/components/SeasonGroupedList.module.css')
const helper = src(
  'src/features/shared/presentation/groupAssignmentsBySeason.ts',
)
const nav = src('src/features/shared/presentation/seasonNavigation.ts')
const weddingsPage = src('src/pages/WeddingsPage.tsx')
const sessionsPage = src('src/pages/SessionsPage.tsx')

assert(ui.includes('groupAssignmentsBySeason'), 'uses shared helper')
assert(ui.includes('getDefaultExpandedSeasons'), 'default expansion')
assert(ui.includes('aria-expanded'), 'a11y expanded')
assert(ui.includes('Wszystkie'), 'all chip')
assert(ui.includes('season-chips'), 'chips test id')
assert(ui.includes('season-sticky-nav'), 'sticky nav')
assert(ui.includes('type="search"'), 'global search')
assert(ui.includes('filterItem'), 'filters before grouping hook')
assert(ui.includes('IntersectionObserver'), 'active year observer')
assert(ui.includes('resolveSeasonChipSelection'), 'chip semantics')
assert(ui.includes('expandSeasonKeepingOthers'), 'year keeps others open')
assert(ui.includes('preSearchManual'), 'search restores expansion')
assert(ui.includes('aria-current'), 'active year semantic')
assert(ui.includes('aria-pressed'), 'Wszystkie pressed state')
assert(ui.includes('IconChevronDown'), 'single chevron')
assert(!ui.includes('IconChevronRight'), 'no dual chevron swap')
assert(ui.includes('prefersReducedMotion'), 'reduced motion')
assert(ui.includes('scroll-margin') || css.includes('scroll-margin-top'), 'scroll offset')

assert(css.includes('position: sticky'), 'sticky chips')
assert(css.includes('prefers-reduced-motion'), 'css reduced motion')
assert(css.includes('data-expanded'), 'chevron state')
assert(css.includes('overflow-x: auto'), 'mobile chip scroll')

assert(nav.includes('areAllSeasonsExpanded'), 'all-expanded helper')
assert(!/\b20\d{2}\b/.test(helper.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')), 'helper has no hardcoded year literals')

assert(weddingsPage.includes('SeasonGroupedList'), 'weddings share UI')
assert(sessionsPage.includes('SeasonGroupedList'), 'sessions share UI')

// Mock IntersectionObserver availability for unit-style sanity
{
  class MockIO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const prev = globalThis.IntersectionObserver
  // @ts-expect-error test mock
  globalThis.IntersectionObserver = MockIO
  assert(typeof globalThis.IntersectionObserver === 'function', 'IO mockable')
  globalThis.IntersectionObserver = prev
}

console.log('PASS  season list UI')
