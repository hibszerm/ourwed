/**
 * Season year navigation — no scroll-to-top jump on year chip click.
 * Shared by /sluby and /sesje via SeasonGroupedList.
 * Run: npm run test:season-year-nav
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

const ui = read('src/features/shared/components/SeasonGroupedList.tsx')
const weddingsPage = read('src/pages/WeddingsPage.tsx')
const sessionsPage = read('src/pages/SessionsPage.tsx')

console.log('\nSeason year navigation\n')

{
  assertIncludes(ui, 'type="button"', 'chips/headers are buttons')
  assertNotIncludes(ui, 'href="#"', 'no hash anchors')
  assertNotIncludes(ui, "href={'#'}", 'no hash anchors 2')
  assertNotIncludes(ui, 'window.scrollTo', 'no window.scrollTo')
  assertNotIncludes(ui, 'scrollTo(0', 'no scrollTo(0,*)')
  console.log('PASS  button semantics / no top-anchor')
}

{
  assertIncludes(ui, 'function focusSeason', 'year focus handler')
  assertIncludes(ui, 'function scrollToSeason', 'season scroll helper')
  assertIncludes(ui, 'root.scrollTo', 'scroll via scroll root')
  assertIncludes(ui, 'stickyHeight', 'accounts for sticky chip bar')
  console.log('PASS  scroll uses AppLayout scroll root')
}

{
  // Chip strip may adjust horizontal scrollLeft — never vertical scrollIntoView on chips.
  const chipEffect =
    ui.includes('strip.scrollLeft') || ui.includes('scrollLeft')
  assert(chipEffect, 'horizontal chip strip scroll only')
  assertNotIncludes(
    ui,
    'btn?.scrollIntoView',
    'no chip scrollIntoView (causes top jump)',
  )
  assertNotIncludes(
    ui,
    'btn.scrollIntoView',
    'no chip scrollIntoView variant',
  )
  console.log('PASS  sticky chip does not scrollIntoView')
}

{
  assertIncludes(ui, 'expandSeasonKeepingOthers', 'year expands without collapsing peers')
  assertIncludes(ui, 'getDefaultExpandedSeasons', 'default year preserved')
  assertIncludes(ui, 'setActiveYear(season)', 'selection updates')
  console.log('PASS  selection / default expansion')
}

{
  assertIncludes(weddingsPage, 'SeasonGroupedList', 'weddings share season UI')
  assertIncludes(sessionsPage, 'SeasonGroupedList', 'sessions share season UI')
  console.log('PASS  both list pages share SeasonGroupedList')
}

{
  const css = read('src/features/shared/components/SeasonGroupedList.module.css')
  assertIncludes(css, 'overflow-x: auto', 'mobile chip strip scroll')
  assertIncludes(css, 'position: sticky', 'sticky year bar')
  console.log('PASS  mobile chip strip CSS')
}

console.log('\nseason-year-nav: done\n')
