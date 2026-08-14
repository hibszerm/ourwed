/**
 * Wedding Detail tabs — horizontal-only scroll ownership.
 * Run: npm run test:wedding-detail-tabs-scroll
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseWorkspaceTab } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

function tabsBarBlock(css: string): string {
  const start = css.indexOf('.tabsBar {')
  assert(start >= 0, '.tabsBar rule exists')
  const end = css.indexOf('\n}', start)
  assert(end > start, '.tabsBar rule closed')
  return css.slice(start, end + 2)
}

{
  const css = read('src/features/weddings/detail/v2/WeddingDetailV2.module.css')
  const tabs = read(
    'src/features/weddings/detail/v2/WeddingWorkspaceTabs.tsx',
  )
  const shell = read('src/features/weddings/detail/v2/WeddingDetailV2.tsx')
  const layout = read('src/layouts/AppLayout.module.css')
  const bar = tabsBarBlock(css)

  assertIncludes(bar, 'overflow-x: auto', '1 — horizontal scroll')
  assertIncludes(bar, 'overflow-y: hidden', '2 — no vertical scrollport')
  assertIncludes(bar, 'flex-wrap: nowrap', '2 — single row')
  assertNotIncludes(bar, 'touch-action: none', '4 — no touch-action none')
  assertNotIncludes(bar, 'touch-action: pan-x', '4 — no pan-x (blocks page Y)')
  assertNotIncludes(bar, 'overflow: auto', '2 — not bidirectional overflow')
  assertNotIncludes(bar, 'overflow: scroll', '2 — not overflow scroll')

  assertNotIncludes(tabs, 'scrollTop', '3 — no scrollTop mutation')
  assertNotIncludes(tabs, 'onTouchMove', '3 — no touchmove handler')
  assertNotIncludes(tabs, 'onPointerMove', '3 — no pointermove handler')
  assertNotIncludes(tabs, 'preventDefault', '4 — no preventDefault')
  assertNotIncludes(tabs, 'addEventListener', '3 — no custom scroll listeners')

  assertIncludes(css, 'white-space: nowrap', '5 — tab labels stay on one line')
  assertIncludes(layout, 'overflow-y: auto', 'page content remains Y owner')

  assertEq(parseWorkspaceTab(null), 'overview', '6 — default Przegląd')
  assertIncludes(shell, "searchParams.get('tab')", '7 — ?tab= honored')
  assertEq(parseWorkspaceTab('wedding_day'), 'wedding_day', '7 — explicit tab')

  console.log('PASS  Wedding Detail tabs scroll ownership')
}
