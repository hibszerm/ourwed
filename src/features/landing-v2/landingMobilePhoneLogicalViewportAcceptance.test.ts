/**
 * Landing V2 — Iteration 3F.3 canonical logical phone viewport.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANONICAL_APP_VIEWPORT_WIDTH_PX,
  COMPACT_PHONE_OUTER_VW,
  estimatePhysicalScreenContentWidth,
  presentationScaleForPhysicalWidth,
  logicalViewportHeightFromPhysical,
} from '@/features/landing-v2/devices/phoneLogicalViewportCanon'
import {
  COMPACT_PHONE_TOUR_DURATION_S,
  COMPACT_PHONE_TOUR_SEGMENTS,
  COMPACT_TOUR_3F2_DASH_SCROLL_MS,
  COMPACT_TOUR_3F2_DAY_SCROLL_MS,
  COMPACT_TOUR_3F2_ROUTE_TRAVEL_MS,
  COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DASH,
  COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DAY,
  COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_ROUTE,
  COMPACT_TOUR_DASH_SCROLL_MS,
  COMPACT_TOUR_DAY_SCROLL_MS,
  COMPACT_TOUR_ROUTE_TRAVEL_MS,
  compactTourSegmentById,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'

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

console.log('\n=== landing mobile phone logical viewport (3F.3) ===\n')

{
  assert(CANONICAL_APP_VIEWPORT_WIDTH_PX === 390, 'canonical 390')
  assert(COMPACT_PHONE_OUTER_VW === 76.5, 'phone outer freeze 76.5vw')
  const phys = estimatePhysicalScreenContentWidth(402 * 0.765)
  const scale = presentationScaleForPhysicalWidth(phys)
  assert(phys > 250 && phys < 320, `physical screen ~280 (got ${phys.toFixed(1)})`)
  assert(scale > 0.65 && scale < 0.85, `presentation scale (got ${scale.toFixed(3)})`)
  const logicalH = logicalViewportHeightFromPhysical(650, scale)
  assert(logicalH > 750 && logicalH < 1100, `logical H derived (got ${logicalH.toFixed(0)})`)
  console.log(
    `PASS  1. canonical=${CANONICAL_APP_VIEWPORT_WIDTH_PX} phys≈${phys.toFixed(0)} scale≈${scale.toFixed(3)}`,
  )
}

{
  const tour = read('src/features/landing-v2/devices/CompactPhoneProductTour.tsx')
  const lv = read('src/features/landing-v2/devices/MarketingPhoneLogicalViewport.tsx')
  const lvCss = read('src/features/landing-v2/devices/MarketingPhoneLogicalViewport.module.css')
  assertIncludes(tour, 'MarketingPhoneLogicalViewport', 'tour wraps logical viewport')
  assertIncludes(tour, 'data-phone-logical-viewport="canonical"', 'canonical marker')
  assertIncludes(lv, 'CANONICAL_APP_VIEWPORT_WIDTH_PX', 'canonical width')
  assertIncludes(lv, "transformOrigin: 'top left'", 'origin top-left')
  assertIncludes(lv, 'data-transform-owner="logicalScale"', 'static scale owner')
  assertIncludes(lvCss, 'overflow: hidden', 'physical clip')
  assertIncludes(lvCss, 'transform-origin: top left', 'css origin')
  assertNotIncludes(lv, 'visualViewport', 'no visualViewport')
  assertNotIncludes(lv, '100dvh', 'no dvh')
  console.log('PASS  2. hierarchy + static scale owner')
}

{
  const app = read('src/features/landing-v2/mobile-story/app/MobileOurWedApp.tsx')
  const appCss = read('src/features/landing-v2/mobile-story/app/MobileOurWedApp.module.css')
  assertNotIncludes(app, 'marketingPhoneDensity', 'density prop removed')
  assertNotIncludes(appCss, '100cqw / var(--ow-density-canon-w)', 'ineffective rem density gone')
  assertIncludes(
    read('src/features/landing-v2/mobile-story/app/screens/MobileDashboardDemo.module.css'),
    'min-height: 164px',
    'hero laid out at CRM mobile size',
  )
  console.log('PASS  3. rem density regression + CRM geometry at logical width')
}

{
  const phoneCss = read('src/features/landing-v2/mobile-story/device/HeroPhoneFrame.module.css')
  assertIncludes(phoneCss, '76.5vw', 'phone size frozen')
  assertIncludes(phoneCss, '100svh', 'svh stable')
  assertNotIncludes(phoneCss, '100dvh', 'no dvh phone')
  console.log('PASS  4. phone physical size + safari stability')
}

{
  /* 3F.2 perceived physical speed preserved via measured duration compensation */
  const day = compactTourSegmentById('dayScroll')!
  const dash = compactTourSegmentById('dashScroll')!
  const route = compactTourSegmentById('routeTravel')!
  assert(COMPACT_TOUR_3F2_DASH_SCROLL_MS === 5400, '3F.2 dash baseline')
  assert(COMPACT_TOUR_3F2_DAY_SCROLL_MS === 3600, '3F.2 day baseline')
  assert(COMPACT_TOUR_3F2_ROUTE_TRAVEL_MS === 2500, '3F.2 route baseline')
  assert(dash.durationMs === COMPACT_TOUR_DASH_SCROLL_MS, 'dash compensated')
  assert(day.durationMs === COMPACT_TOUR_DAY_SCROLL_MS, 'day compensated')
  assert(route.durationMs === COMPACT_TOUR_ROUTE_TRAVEL_MS, 'route compensated')
  const dashErr = Math.abs(COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DASH - 1) /* ratio applied to duration */
  assert(dashErr > 0.05, 'compensation non-trivial')
  assert(
    Math.abs(COMPACT_TOUR_DASH_SCROLL_MS / COMPACT_TOUR_3F2_DASH_SCROLL_MS - COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DASH) <
      0.01,
    'dash duration tracks phys ratio',
  )
  assert(
    Math.abs(COMPACT_TOUR_DAY_SCROLL_MS / COMPACT_TOUR_3F2_DAY_SCROLL_MS - COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DAY) <
      0.01,
    'day duration tracks phys ratio',
  )
  assert(
    Math.abs(
      COMPACT_TOUR_ROUTE_TRAVEL_MS / COMPACT_TOUR_3F2_ROUTE_TRAVEL_MS - COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_ROUTE,
    ) < 0.01,
    'route duration tracks phys ratio',
  )
  assert(COMPACT_PHONE_TOUR_DURATION_S >= 13.5 && COMPACT_PHONE_TOUR_DURATION_S <= 15, 'total after compensation')
  assert(COMPACT_PHONE_TOUR_SEGMENTS.length === 13, 'segment count frozen')
  console.log(
    `PASS  5. phys-speed compensation dash×${COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DASH} day×${COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DAY}`,
  )
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  6. registration')
}

console.log('\nPASS  landing mobile phone logical viewport\n')
