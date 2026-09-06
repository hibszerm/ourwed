/**
 * Landing V2 — production DNA baseline + isolated Hero.
 * Run: npm run test:landing-v2
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { WORKFLOW_STAGE_LABELS, WORKFLOW_STAGES } from '@/lib/utils/workflow'
import { juliaMaksymilian, LANDING_V2_TABS } from '@/features/landing-v2/narrative'
import { PRO_PLAN } from '@/lib/billing/planCatalog'
import {
  compactHeroExitCoverScale,
  HERO_THEATER_GEOMETRY_COMPACT,
  HERO_THEATER_GEOMETRY_DESKTOP,
} from '@/features/landing-v2/hero/heroTheaterGeometry'
import {
  featuresOpacityAt,
  headlineCompositeOpacityAt,
  headlineSepYAt,
  isHandoffDeadZone,
  MOBILE_RANGES,
  phoneInT,
} from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import {
  sceneExitOpacityAt,
} from '@/features/landing-v2/lifecycle-story/lifecycleStoryProgress'
import {
  PRODUCT_STORY_COVER_SCALE_FALLBACK,
  deviceScaleContinuitySamples,
  deviceScaleFromHandoff,
  productTheaterOwned,
  productVisualActive,
  readProductTabletDiagMode,
  screenBlackoutFromHandoff,
  screenRevealFromHandoff,
  viewportCrossHandoffT,
  workspaceDormantFromHandoff,
  workspaceRenderActive,
} from '@/features/landing-v2/product-story/productStoryProgress'
import {
  getScene07Range,
  scene07HeadlineVisualAt,
  scene07PinActive,
  SCENE07_PIN_LEAD,
} from '@/features/landing-v2/sections/scene07HeadlineContinuity'
import {
  compactBarOpacityAt,
  compactEnterPxForMaxScroll,
} from '@/features/landing-v2/mobile-story/app/motion/mobileDashboardCollapse'
import {
  MOBILE_TRACK_POST_BRIEF_SVH,
  POST_BRIEF_BODY_COMPRESS_START,
  POST_BRIEF_MORPH_START,
  POST_BRIEF_RANGES,
  postBriefAspectRatioAt,
  postBriefBodyCompressAt,
  postBriefBriefOpacityAt,
  postBriefCompressAt,
  postBriefContentOpAt,
  postBriefOuterOpacityAt,
  postBriefOuterScaleAt,
  postBriefPerceptAt,
  postBriefScreenMergeAt,
  postBriefShackleAt,
  postBriefShrinkScaleAt,
} from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import {
  MOBILE_TRACK_STUDIO_HISTORY_SVH,
  STUDIO_HISTORY_RANGES,
  STUDIO_LOCK_SCALE_END,
  studioCardsOpAt,
  studioEyebrowOpAt,
  studioHeadlineOpAt,
  studioLockScaleAt,
  studioLockSettledGateAt,
  studioLockTravelT,
  studioLockYVhAt,
  studioSecurityCopyOpAt,
  studioSecurityCopyYAt,
  studioSupportOpAt,
  studioTimelineOpAt,
  studioYear2026OpAt,
  studioYear2027OpAt,
  studioYear2028OpAt,
} from '@/features/landing-v2/mobile-story/studioHistoryProgress'
import {
  MOBILE_TRACK_SEASON_IMPORT_SVH,
  SEASON_IMPORT_RANGES,
  SEASON_IMPORT_SHELL_SCALE_END,
  SEASON_IMPORT_SHELL_Y_PX,
  SEASON_IMPORT_LOCK_SCALE_END,
  SEASON_IMPORT_LOCK_Y_PX,
  seasonImportHistoryIntroOpAt,
  seasonImportHistoryShellOpAt,
  seasonImportHistoryShellScaleAt,
  seasonImportHistoryShellYAt,
  seasonImportHistoryYear2026OpAt,
  seasonImportHistoryYear2027OpAt,
  seasonImportHistoryYear2028OpAt,
  seasonImportHeadlineOpAt,
  seasonImportEyebrowOpAt,
  seasonImportLockOpAt,
  seasonImportLockScaleAt,
  seasonImportLockYAt,
  seasonImportReadyOpAt,
  seasonImportSheetOpAt,
} from '@/features/landing-v2/mobile-story/seasonImportProgress'
import {
  MOBILE_TRACK_FOUNDER_COVER_SVH,
  MOBILE_TRACK_FOUNDER_STORY_SVH,
  MOBILE_TRACK_FOUNDER_SVH,
  MOBILE_TRACK_IMPORT_COVER_HOLD_SVH,
} from '@/features/landing-v2/mobile-story/founderStoryProgress'
import {
  LV2_FOUNDER_CLOSING,
  LV2_FOUNDER_IDENTITY,
  LV2_FOUNDER_OPENING,
  LV2_FOUNDER_ORIGIN,
} from '@/features/landing-v2/mobile-story/founderStoryClaims'
import {
  LV2_SEASON_IMPORT_ASSIGNMENT,
  LV2_SEASON_IMPORT_COPY,
  LV2_SEASON_IMPORT_ROWS,
} from '@/features/landing-v2/mobile-story/seasonImportClaims'
import { LV2_HISTORY_SEASONS } from '@/features/landing-v2/security-history/securityHistoryClaims'
import {
  classifyMorph,
  findForwardMorphOscillations,
  type MorphSample,
} from '@/features/landing-v2/mobile-story/postBriefOscillationGuard'
import {
  dashHandoffYAt,
  dashOpacityAt,
  dashPhaseOuterPxFromMaxScroll,
  dashScrollYAt,
  dayHandoffYAt,
  dayOpacityAt,
  dayReturnScrollPx,
  dayScrollYAt,
  DAY_END_HOLD_OUTER_PX,
  DAY_RETURN_FRACTION,
  handoffLinearT,
  mapLayerOpacityAt,
  MOBILE_APP_RANGES,
  MOBILE_TRACK_DASH_SVH_FALLBACK,
  MOBILE_TRACK_POST_SVH,
  MOBILE_TRACK_PRE_SVH,
  NAV_ARRIVAL_OUTER_PX,
  NAV_ENTER_OUTER_PX,
  NAV_PATH_END,
  NAV_REST_OUTER_PX,
  NAV_STORY_OUTER_PX,
  NAV_TRAVEL_OUTER_PX,
  BRIEF_ENTER_OUTER_PX,
  BRIEF_SETTLE_OUTER_PX,
  briefOpenAt,
  briefScrollYAt,
  postPhaseBudgetsFromDayMax,
  splitMobileMasterProgress,
  travelProgressAt,
} from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'
import {
  DASHBOARD_BOTTOM_INSET_PX,
  measureDashboardScrollGeometry,
} from '@/features/landing-v2/mobile-story/app/motion/mobileDashboardScrollGeometry'
import { WEDDING_DAY_BOTTOM_INSET_PX } from '@/features/landing-v2/mobile-story/app/motion/mobileWeddingDayScrollGeometry'

function read(rel: string) {
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

function assertEq<T>(actual: T, expected: T, m: string) {
  if (actual !== expected) {
    throw new Error(`${m}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function exists(rel: string) {
  try {
    statSync(resolve(process.cwd(), rel))
    return true
  } catch {
    return false
  }
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkTs(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

{
  assert(exists('docs/design/LANDING_V2_DESIGN.md'), 'DESIGN.md exists')
  console.log('PASS  design contract')
}

{
  const router = read('src/routes/router.tsx')
  const redirect = read('src/routes/RedirectToRootPreserveHash.tsx')
  assertIncludes(router, '{ path: \'/\', element: <LandingPage /> }', '/ renders LandingPage')
  assertIncludes(router, "path: '/landingv2'", 'legacy /landingv2 retained as redirect')
  assertIncludes(router, "path: '/landing-v3'", 'legacy /landing-v3 retained as redirect')
  assertIncludes(router, 'RedirectToRootPreserveHash', 'legacy landings redirect to root')
  assertIncludes(router, 'hydrateFallbackElement:', 'HydrateFallback configured')
  assert(
    !/lazy:\s*async\s*\(\)\s*=>[\s\S]*?landing-v2\/LandingV2Page/.test(router),
    'Landing V2 no longer lazy-split off /',
  )
  assertIncludes(redirect, "pathname: '/'", 'redirect targets /')
  assertIncludes(redirect, 'hash', 'redirect preserves fragment')
  assertIncludes(redirect, 'replace', 'redirect replaces history')
  assertIncludes(router, "path: '/login'", 'login route retained')
  assertIncludes(router, "path: '/register'", 'register route retained')
  console.log('PASS  routing')
}

{
  const page = read('src/features/landing-v2/LandingV2Page.tsx')
  const indexHtml = read('index.html')
  assertIncludes(page, 'LandingV2Hero', 'isolated hero')
  assertIncludes(page, 'data-landing-v2-baseline="production"', 'production baseline marker')
  assertNotIncludes(page, 'AssignmentOverviewSection', 'post-Founder V3 feature stack removed')
  assertNotIncludes(page, 'ImportExistingWorkSection', 'V3 import absorbed into Mobile season import')
  assertIncludes(page, 'LandingV2Pricing', 'conversion pricing')
  assertIncludes(page, 'LandingV2Faq', 'conversion faq')
  assertIncludes(page, 'LandingV2FinalCta', 'conversion final cta')
  assertIncludes(page, 'LandingV3Footer', 'footer')
  assertIncludes(page, 'LandingV3Nav', 'production nav DNA')
  assertIncludes(page, 'LandingV2FounderStory', 'founder chapter')
  assertIncludes(page, 'id="jak-dziala"', 'jak-dziala product theater anchor')
  assertNotIncludes(page, 'noindex, nofollow', 'no runtime noindex')
  assertNotIncludes(page, 'useLandingV2NoIndex', 'noindex hook removed')
  assertNotIncludes(page, 'eksperymentalna', 'no experimental title')
  assertNotIncludes(page, 'document.title', 'no runtime title mutation')
  assertNotIncludes(page, 'EXPERIMENTAL_TITLE', 'no experimental title constant')

  assertIncludes(
    indexHtml,
    'OurWed — CRM dla fotografów i filmowców ślubnych',
    'production title in shell',
  )
  assertIncludes(
    indexHtml,
    'Obsługa zleceń ślubnych bez chaosu. Śluby, sesje, umowy, ankiety, płatności i plan dnia w jednym miejscu.',
    'production meta description',
  )
  assertIncludes(indexHtml, 'content="index, follow"', 'robots indexable')
  assertIncludes(indexHtml, 'href="https://ourwed.pl/"', 'canonical absolute root')
  assertIncludes(indexHtml, 'property="og:url" content="https://ourwed.pl/"', 'OG url root')
  assertNotIncludes(indexHtml, 'content creatorów', 'shell free of content creatorów')
  assertNotIncludes(indexHtml, 'eksperymentalna', 'shell free of experimental branding')
  assertNotIncludes(indexHtml, 'Landing V2', 'shell free of Landing V2 branding')
  assertNotIncludes(indexHtml, 'Landing V3', 'shell free of Landing V3 branding')
  assertEq(
    (indexHtml.match(/rel="canonical"/g) || []).length,
    1,
    'exactly one canonical link',
  )

  assertNotIncludes(page, 'Act1Hero', 'not production hero component')
  assertNotIncludes(page, 'HeroProofSection', 'rejected hero proof not rendered')
  assertNotIncludes(page, 'ShowcaseProofSection', 'rejected showcase not rendered')
  assertNotIncludes(page, 'WeddingDayProofSection', 'rejected wedding day proof not rendered')
  assertNotIncludes(page, 'HeroAppEnvironment', 'rejected env not rendered')
  assertNotIncludes(page, 'ProductFocusCanvas', 'rejected canvas not rendered')
  assertNotIncludes(page, 'ProductReviewSurface', 'old product review not mounted')
  assertNotIncludes(page, 'data-landing-v2-proof', 'proof slice marker gone')
  assertNotIncludes(page, 'ChaosCalm', 'no ChaosCalm')
  assertNotIncludes(page, 'AppLayout', 'no AppLayout')
  assertNotIncludes(page, 'useAuth', 'V2 page has no auth redirect')

  assert(exists('src/features/landing-v2/sections/LandingV2Hero.tsx'), 'LandingV2Hero')
  assert(
    exists('src/features/landing-v2/hero/HeroModernDashboard.tsx'),
    'HeroModernDashboard',
  )

  const landing = read('src/pages/LandingPage.tsx')
  assertIncludes(landing, 'LandingV2Page', 'production / mounts Landing V2')
  assertNotIncludes(landing, 'LandingV3Page', 'LandingPage no longer mounts V3')

  const v3Page = read('src/features/landing-v3/LandingV3Page.tsx')
  assertIncludes(v3Page, 'Act1Hero', 'V3 source retained')
  assertNotIncludes(v3Page, 'LandingV2Hero', 'V3 page ignores V2 hero')
  assertNotIncludes(v3Page, 'landing-v2', 'V3 page ignores V2')

  console.log('PASS  production DNA architecture')
}

{
  const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
  assertIncludes(hero, 'Obsługa zleceń ślubnych', 'hero title')
  assertIncludes(hero, 'bez chaosu.', 'hero title line 2')
  assertIncludes(hero, 'HeroModernDashboard', 'modern dashboard canvas')
  assert(
    hero.includes('useMotionValue') || hero.includes('useScroll'),
    'single scroll progress source',
  )
  assertIncludes(hero, 'useTransform', 'reveal transforms')
  assertIncludes(hero, '--hero-progress', 'progress css var')
  assertIncludes(hero, 'Załóż bezpłatne konto', 'trial CTA')
  assertNotIncludes(hero, '#produkt', 'no product hash CTA')
  assertNotIncludes(hero, 'Zobacz produkt', 'secondary product CTA removed')
  assertIncludes(hero, 'data-hero-theater', 'theater mode marker')
  assertNotIncludes(hero, 'LandingV2HeroWorkspace', 'old wrong workspace gone')
  assertNotIncludes(hero, 'HeroAppEnvironment', 'no rejected env')
  assertNotIncludes(hero, 'ProductFocusCanvas', 'no rejected canvas')
  assertNotIncludes(hero, 'AssignmentShell', 'no AssignmentShell')
  assertNotIncludes(hero, 'DashboardDemo', 'no classic V3 dashboard demo')
  assertNotIncludes(hero, 'ScrollTrigger', 'no GSAP ScrollTrigger')
  assertNotIncludes(hero, "from 'gsap'", 'no GSAP')
  assertNotIncludes(hero, 'DEMO_CAPABILITY_LINE', 'capability line removed')
  assertNotIncludes(hero, 'lv2-capability-line', 'capability testid gone')
  assertIncludes(hero, 'HeroTabletFrame', 'tablet device frame')
  assertIncludes(hero, 'hardwareProgress', 'late hardware reveal')
  /* hardware window asserted with assemble/exit map below */

  /* Phase 1 mobile parity — Hero motion policy */
  assertIncludes(hero, 'useLandingCompactViewport', 'shared compact viewport hook')
  assertIncludes(hero, 'isReducedMotion', 'explicit reduced-motion flag')
  assertIncludes(hero, 'isCompactViewport', 'explicit compact viewport flag')
  assertIncludes(hero, 'const skipTheater = isReducedMotion', 'Hero skips theater only for reduced motion')
  assertNotIncludes(
    hero,
    'Boolean(reduced) || compact',
    'Hero no longer equates compact viewport with reduced motion',
  )
  assertNotIncludes(
    hero,
    'skipTheater = Boolean(reduced) || compact',
    'legacy Hero skipTheater compact gate removed',
  )
  assertIncludes(hero, 'heroTheaterGeometry', 'compact/desktop geometry table')
  assertIncludes(hero, 'data-hero-compact', 'compact viewport marker')
  assertIncludes(hero, 'data-hero-reduced-motion', 'reduced-motion marker')
  assertIncludes(
    hero,
    "data-hero-theater={skipTheater ? 'simple' : 'scroll'}",
    'theater attr still driven by skipTheater (reduced only)',
  )
  /* Hero tablet parity — outer scale only, never internal compact crop */
  assertIncludes(hero, 'canonical', 'Hero tablet uses canonical device')
  assertIncludes(hero, 'fitLock={isCompactViewport}', 'compact freezes design width for outer scale')
  assertIncludes(hero, 'deviceFit', 'outer device fit wrapper')
  assertIncludes(hero, '--hero-device-fit-scale', 'uniform fit scale var')
  assertNotIncludes(
    hero,
    'compact={isCompactViewport}',
    'Hero must not pass compact viewport into tablet/dashboard',
  )
  assertNotIncludes(
    hero,
    '<HeroModernDashboard\n                    compact=',
    'Hero dashboard never compact-prop driven by viewport',
  )
  assertNotIncludes(
    hero,
    'HeroTabletFrame compact',
    'Hero tablet never compact mode',
  )

  const heroGeom = read('src/features/landing-v2/hero/heroTheaterGeometry.ts')
  assertIncludes(heroGeom, 'HERO_THEATER_GEOMETRY_DESKTOP', 'desktop geometry frozen')
  assertIncludes(heroGeom, 'HERO_THEATER_GEOMETRY_COMPACT', 'compact geometry table')
  assertIncludes(heroGeom, '[360, 220, 10, 0]', 'desktop productY travel preserved')
  assertIncludes(heroGeom, 'coverScaleMax: 2.45', 'desktop cover scale max preserved')
  assertIncludes(heroGeom, 'compactHeroExitCoverScale', 'compact vertical overscan helper')
  assertIncludes(heroGeom, 'exitVerticalOverscan: 1.14', 'compact portrait overscan factor')
  assertIncludes(heroGeom, 'coverScaleMax: 4.25', 'compact exit max allows portrait clear')

  {
    assertEq(HERO_THEATER_GEOMETRY_DESKTOP.coverScaleMax, 2.45, 'desktop exit max frozen')
    assert(HERO_THEATER_GEOMETRY_COMPACT.coverScaleMax > 2.15, 'compact exit stronger than early Phase 1 cap')

    /* 390×844 sticky ≈ 776 after nav; fitted landscape tablet ~240px tall */
    const s390 = compactHeroExitCoverScale({
      stickyHeight: 776,
      fittedTabletHeight: 240,
      overscan: HERO_THEATER_GEOMETRY_COMPACT.exitVerticalOverscan,
      min: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMin,
      max: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMax,
    })
    assert(s390 > 1, 'compact exit scale > fitted state')
    assert(240 * s390 > 776, 'compact exit clears sticky height at 390-class')

    const s375 = compactHeroExitCoverScale({
      stickyHeight: 744,
      fittedTabletHeight: 220,
      overscan: HERO_THEATER_GEOMETRY_COMPACT.exitVerticalOverscan,
      min: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMin,
      max: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMax,
    })
    assert(220 * s375 > 744, 'compact exit clears sticky height at 375-class')

    const s430 = compactHeroExitCoverScale({
      stickyHeight: 864,
      fittedTabletHeight: 255,
      overscan: HERO_THEATER_GEOMETRY_COMPACT.exitVerticalOverscan,
      min: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMin,
      max: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMax,
    })
    assert(255 * s430 > 864, 'compact exit clears sticky height at 430-class')

    const s402 = compactHeroExitCoverScale({
      stickyHeight: 806,
      fittedTabletHeight: 235,
      overscan: HERO_THEATER_GEOMETRY_COMPACT.exitVerticalOverscan,
      min: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMin,
      max: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMax,
    })
    assert(235 * s402 > 806, 'compact exit clears sticky height at 402-class')
  }

  assertIncludes(hero, 'compactHeroExitCoverScale', 'Hero uses compact overscan helper')
  assertIncludes(hero, 'isCompactViewport', 'compact exit branch gated')

  const heroCss = read('src/features/landing-v2/sections/LandingV2Hero.module.css')
  assertIncludes(heroCss, '420svh', 'desktop scroll track with exit')
  assertIncludes(heroCss, '--lv2-hero-track-compact: 280svh', 'compact scroll runway token')
  assertIncludes(heroCss, "data-hero-theater='scroll'", 'compact scroll theater CSS')
  assertIncludes(heroCss, 'position: sticky', 'sticky viewport')
  assertIncludes(heroCss, 'clamp(3.5rem, 7vw, 6.75rem)', 'monumental H1 near production')
  assertIncludes(heroCss, 'titleLine', 'controlled H1 lines')
  assertIncludes(heroCss, 'deviceExit', 'whole-device exit wrapper')
  assertIncludes(heroCss, 'blackPlate', 'black handoff plate')
  assertNotIncludes(heroCss, 'filter: blur', 'no content blur')
  assertNotIncludes(heroCss, 'mask-composite', 'rejected edge fade removed')
  assertNotIncludes(heroCss, 'mask-image', 'no dashboard edge mask')

  assertIncludes(hero, 'assembleProgress', 'remapped assemble progress')
  assertIncludes(hero, 'exitProgress', 'ipad exit progress')
  assertIncludes(hero, 'deviceExit', 'physical exit wrapper')
  assertIncludes(hero, '--screen-blackout', 'screen blackout var')
  assertIncludes(hero, 'applyHeroDemoThemeToElement', 'real graphite token interpolation')
  assertIncludes(hero, '[0.54, 0.64]', 'theme transition window')
  assertIncludes(hero, '[0.7, 0.91]', 'exit window after graphite hold')
  assertIncludes(hero, '[0.76, 0.92]', 'hardware resolve window')

  /* Phase 1/2 — later theaters still use compact∨reduced static gate */
  const productStoryGate = read(
    'src/features/landing-v2/product-story/LandingV2ProductStory.tsx',
  )
  const problemGate = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')
  const lifecycleGate = read(
    'src/features/landing-v2/lifecycle-story/LandingV2LifecycleStory.tsx',
  )
  const mobileStoryGate = read(
    'src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx',
  )
  const founderGate = read(
    'src/features/landing-v2/mobile-story/LandingV2FounderStory.tsx',
  )
  assertIncludes(
    productStoryGate,
    'const simple = Boolean(reduced)',
    'Product Story skips theater only for reduced motion',
  )
  assertNotIncludes(
    productStoryGate,
    'Boolean(reduced) || compact',
    'Product Story no longer equates compact with reduced motion',
  )
  assertIncludes(
    productStoryGate,
    'useLandingCompactViewport',
    'Product uses shared compact viewport hook',
  )
  assertIncludes(
    productStoryGate,
    'measureCanonicalDeviceFit',
    'Product settle shares Hero canonical fit helper',
  )
  assertIncludes(
    productStoryGate,
    'fitLock={isCompactViewport}',
    'Product compact freezes design width for outer scale',
  )
  assertIncludes(
    productStoryGate,
    'canonical',
    'Product handoff tablet is canonical Hero geometry',
  )
  assertNotIncludes(
    productStoryGate,
    '<HeroTabletFrame compact',
    'Product must not use responsive compact tablet internals',
  )
  /* Phase 2 — Problem Story: compact no longer forces static */
  assertIncludes(
    problemGate,
    'const skipTheater = isReducedMotion',
    'Problem Story skips theater only for reduced motion',
  )
  assertIncludes(problemGate, 'useLandingCompactViewport', 'Problem uses shared compact hook')
  assertNotIncludes(
    problemGate,
    'Boolean(reduced) || compact',
    'Problem Story no longer equates compact with reduced motion',
  )
  assertIncludes(
    problemGate,
    'SCENE07_BLUR_MAX_DESKTOP = 25',
    'desktop Scene 07 blur max preserved',
  )
  assertIncludes(
    problemGate,
    'SCENE07_EXIT_SCALE_DESKTOP = 2.15',
    'desktop Scene 07 exit scale preserved',
  )
  assertIncludes(
    problemGate,
    'SCENE07_BLUR_MAX_COMPACT',
    'compact Scene 07 blur adapted',
  )
  assertIncludes(problemGate, 'SCENE_ENTER_Y = 10', 'desktop scene enter Y frozen')
  assertIncludes(problemGate, 'SCENE_EXIT_Y = -8', 'desktop scene exit Y frozen')
  assertIncludes(problemGate, 'SCENE_ENTER_Y_COMPACT = 0', 'compact normal scenes opacity-only enter')
  assertIncludes(problemGate, 'SCENE_EXIT_Y_COMPACT = 0', 'compact normal scenes opacity-only exit')
  assert(
    !problemGate.includes('SCENE_ENTER_Y_COMPACT = 8') &&
      !problemGate.includes('SCENE_ENTER_Y_COMPACT = 10') &&
      !problemGate.includes('SCENE_ENTER_Y_COMPACT = 2'),
    'compact must not use bottom-up enter Y',
  )
  assertIncludes(
    problemGate,
    'SCENE07_EXIT_SCALE_COMPACT = 3.2',
    'compact Scene 07 portal scale pairs with Product cover',
  )
  assertIncludes(
    problemGate,
    'SCENE07_BLUR_MAX_COMPACT = 18',
    'compact Scene 07 blur adapted for portal',
  )
  assertIncludes(
    problemGate,
    'SCENE07_EXIT_SCALE_DESKTOP = 2.15',
    'desktop Scene 07 exit scale frozen',
  )
  assertIncludes(
    problemGate,
    'SCENE07_BLUR_MAX_DESKTOP = 25',
    'desktop Scene 07 blur frozen',
  )
  assertIncludes(
    problemGate,
    "scene.id === '07'",
    'Scene 07 remains in compact normal-motion theater',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/problemStoryCopy.ts'),
    'Jedno miejsce. Cały sezon. Zero chaosu.',
    'exact final Problem beat remains in sequence',
  )
  assertIncludes(
    lifecycleGate,
    'const simple = Boolean(reduced)',
    'Lifecycle Story skips theater only for reduced motion',
  )
  assertNotIncludes(
    lifecycleGate,
    'Boolean(reduced) || compact',
    'Lifecycle Story no longer equates compact with reduced motion',
  )
  assertIncludes(
    lifecycleGate,
    'useLandingCompactViewport',
    'Lifecycle uses shared compact viewport hook',
  )
  assertIncludes(
    lifecycleGate,
    'publishLifecycleExitT(0)',
    'PRM static Lifecycle must not force Product iPad off-screen',
  )
  assert(
    !/if \(simple\) \{[^}]*publishLifecycleExitT\(1\)/.test(
      lifecycleGate.replace(/\/\*[\s\S]*?\*\//g, ''),
    ),
    'static Lifecycle must not publishLifecycleExitT(1)',
  )
  assertIncludes(
    productStoryGate,
    'handoffT < 0.995',
    'Product ignores lifecycle exit until Scene 07 handoff completes',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.module.css'),
    "[data-ps-theater-owned='true']:not([data-ps-lifecycle-exit='done'])",
    'owned Product sticky stays visible until real lifecycle exit done',
  )
  assertIncludes(
    mobileStoryGate,
    'Boolean(reduced) || compact',
    'Mobile Story still compact∨reduced static (deferred)',
  )
  assertIncludes(
    founderGate,
    'Boolean(reduced) || compact',
    'Founder Story still compact∨reduced static (deferred)',
  )

  const problem = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')
  const problemCss = read(
    'src/features/landing-v2/sections/LandingV2ProblemStory.module.css',
  )
  assertIncludes(problem, 'lv2-problem-story', 'problem story testid')
  assertIncludes(problem, 'PROBLEM_STORY_SCENES', 'exact copy module')
  assertIncludes(problem, 'stickyStage', 'pinned sticky stage')
  assertIncludes(problem, 'sceneLayer', 'absolute scene overlays')
  assertIncludes(problem, 'stageInner', 'stage containing block')
  assertIncludes(problem, 'data-scene05-actual-text', 'scene 05 intrinsic text hook')
  assertIncludes(problemCss, 'problemTrack', 'scroll track')
  assertIncludes(problemCss, 'stickyStage', 'sticky stage css')
  assertIncludes(problemCss, 'sceneLayer', 'scene layer css')
  assertNotIncludes(problemCss, '-3vh', 'no optical y offset')
  assertNotIncludes(problemCss, 'max-width: 15ch', 'no narrow ch widths')
  assertNotIncludes(problemCss, 'max-width: 22ch', 'no narrow ch widths')
  assertIncludes(problem, 's6ExitFilter', 'Scene 07 approved exit blur MotionValue')
  assertIncludes(problem, 'scene07HeadlineBlur', 'Scene 07 blur on tight headline layer')
  assertIncludes(problem, 'data-scene07-headline-blur', 'Scene 07 headline blur marker')
  assertIncludes(problem, 'blur(${px', 'Scene 07 blur radius from exit progress')
  assertIncludes(problem, 'scene07BlurMax', 'Scene 07 blur uses desktop/compact max')
  assertIncludes(problem, 't * scene07BlurMax', 'Scene 07 blur driven by adaptive max')
  assertNotIncludes(problem, "from 'gsap'", 'no GSAP in problem story')

  const problemCopy = read('src/features/landing-v2/sections/problemStoryCopy.ts')
  assertIncludes(problemCopy, 'Jedno zlecenie.', 'scene 01')
  assertIncludes(problemCopy, 'Umowa w plikach.', 'scene 02')
  assertIncludes(problemCopy, 'Płatności w Excelu.', 'scene 03')
  assertIncludes(problemCopy, 'Plan dnia gdzieś w mailu.', 'scene 04')
  assertIncludes(problemCopy, 'Wszystko dotyczy tego samego ślubu.', 'scene 05')
  assertIncludes(
    problemCopy,
    'Dlatego w OurWed wszystko masz pod ręką.',
    'scene 06',
  )
  assertIncludes(problemCopy, 'Jedno miejsce. Cały sezon. Zero chaosu.', 'scene 07')
  assertNotIncludes(
    problemCopy,
    'Dlatego w OurWed wszystko zaczyna się od jednego zlecenia.',
    'old scene 06 removed',
  )

  assertIncludes(problemCss, '450svh', 'tighter problem story track')
  assertIncludes(problemCss, '--lv2-problem-track-compact: 360svh', 'compact scroll runway')
  assertIncludes(
    problemCss,
    "data-problem-theater='scroll'",
    'compact scroll theater CSS',
  )
  assertIncludes(
    problemCss,
    '--lv2-problem-hero-overlap-compact',
    'compact Hero→Problem black overlap',
  )
  /* Compact must not force sticky over early-fixed (Scene 02+ scroll-rise bug) */
  assertIncludes(
    problemCss,
    "stickyStage[data-early-story-fixed='true']",
    'compact restates early-fixed fixed positioning',
  )
  assertIncludes(
    problemCss,
    'Do NOT re-declare position:sticky here',
    'compact documents sticky/early-fixed specificity trap',
  )
  {
    const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
    const compactStickyDecl =
      stripCssComments(problemCss).match(
        /\.problemTrack\[data-problem-theater='scroll'\]\s+\.stickyStage\s*\{([^}]*)\}/,
      )?.[1] ?? ''
    assert(
      compactStickyDecl.length > 0,
      'compact scroll theater declares .stickyStage geometry',
    )
    assert(
      !/position\s*:\s*sticky/.test(compactStickyDecl),
      'compact scroll theater must not force position:sticky on .stickyStage',
    )
    assert(
      /position\s*:\s*fixed/.test(
        stripCssComments(problemCss).match(
          /\.problemTrack\[data-problem-theater='scroll'\]\s+\.stickyStage\[data-early-story-fixed='true'\]\s*\{([^}]*)\}/,
        )?.[1] ?? '',
      ),
      'compact early-fixed restates position:fixed with theater specificity',
    )
    const compactSceneLayerDecl =
      stripCssComments(problemCss).match(
        /\.problemTrack\[data-problem-theater='scroll'\]\s+\.sceneLayer\s*\{([^}]*)\}/,
      )?.[1] ?? ''
    assert(
      /position\s*:\s*absolute/.test(compactSceneLayerDecl) &&
        /inset\s*:\s*0/.test(compactSceneLayerDecl),
      'compact scroll theater keeps scene layers absolute overlays (not document flow)',
    )
    assert(
      !/position\s*:\s*relative/.test(compactSceneLayerDecl) &&
        !/position\s*:\s*static/.test(compactSceneLayerDecl),
      'compact must not demote scene layers into normal flow stacking',
    )
  }
  /* Shared stage geometry — scenes overlay, they are not vertically stacked in flow */
  assertIncludes(
    problemCss,
    '.sceneLayer {\n  position: absolute;\n  inset: 0;',
    'desktop scene layers share one absolute stage slot',
  )
  assertIncludes(problemCss, '.stageInner {\n  position: relative;', 'stageInner is positioning context')
  assertNotIncludes(problemCss, 'min-height: 6.4em', 'artificial sceneCopy min-height removed')
  assertIncludes(
    problemCss,
    '.scene07ExitFixed .lineMobile',
    'portaled Scene 07 shows mobile lines on compact',
  )
  assertIncludes(
    problemCss,
    '.scene07ExitFixed .lineDesktopWide',
    'portaled Scene 07 hides desktop lines on compact',
  )
  assertIncludes(problemCss, 'place-items: center', 'centered scenes')
  assertIncludes(problemCss, '#000000', 'true black background')
  assertIncludes(problemCss, '#f5f1ea', 'warm ivory type')
  assertIncludes(problemCss, 'clamp(3.5rem, 7vw, 6.75rem)', 'hero-authority type')
  assertNotIncludes(problemCss, '#1d272b', 'no graphite bg')
  assertIncludes(problemCss, 'scene07HeadlineBlur', 'tight Scene 07 blur wrapper css')
  assertNotIncludes(
    problemCss,
    '.sceneLayer {\n  filter',
    'no full-viewport sceneLayer filter rule',
  )
  assertNotIncludes(problemCss, 'filter: blur', 'no static CSS blur rule (MotionValue owns blur)')

  const page = read('src/features/landing-v2/LandingV2Page.tsx')
  assertIncludes(page, 'LandingV2ProblemStory', 'problem story mounted')
  assertIncludes(page, '<LandingV2Hero />', 'hero mounted')
  assertIncludes(page, '<LandingV2ProblemStory />', 'problem story element')
  assert(
    page.indexOf('<LandingV2Hero />') < page.indexOf('<LandingV2ProblemStory />'),
    'problem story after hero',
  )
  assert(
    page.indexOf('<LandingV2ProblemStory />') < page.indexOf('id="jak-dziala"'),
    'problem story before later product sections',
  )
  assertIncludes(page, 'LandingV2ProductStory', 'product story mounted')
  assertIncludes(page, '<LandingV2ProductStory />', 'product story element')
  assert(
    page.indexOf('<LandingV2ProblemStory />') < page.indexOf('<LandingV2ProductStory />'),
    'product story after problem story',
  )
  assert(
    page.indexOf('<LandingV2ProductStory />') < page.indexOf('<LandingV2LifecycleStory />'),
    'lifecycle story after product story',
  )
  assert(
    page.indexOf('<LandingV2LifecycleStory />') < page.indexOf('id="jak-dziala"') &&
      page.indexOf('id="jak-dziala"') < page.indexOf('<LandingV2FeaturesGrid />') &&
      page.indexOf('<LandingV2FeaturesGrid />') < page.indexOf('<LandingV2MobileStory />') &&
      page.indexOf('<LandingV2MobileStory />') < page.indexOf('<LandingV2SecurityHistoryStory />') &&
      page.indexOf('<LandingV2SecurityHistoryStory />') < page.indexOf('<LandingV2FounderStory />'),
    'lifecycle → jak-dziala features → mobile → security-history → founder',
  )
  assertIncludes(page, 'LandingV2FeaturesGrid', 'features grid mounted')
  assertIncludes(page, '<LandingV2FeaturesGrid />', 'features grid element')
  assertIncludes(page, 'FeaturesExitShell', 'features exit shell wraps atlas')
  assertIncludes(page, 'LandingV2MobileStory', 'mobile story mounted')
  assertIncludes(page, '<LandingV2MobileStory />', 'mobile story element')
  assertIncludes(page, 'LandingV2SecurityHistoryStory', 'security-history story mounted')
  assertIncludes(page, '<LandingV2SecurityHistoryStory />', 'security-history story element')

  assert(
    page.indexOf('<LandingV2LifecycleStory />') < page.indexOf('id="jak-dziala"'),
    'lifecycle story before jak-dziala',
  )
  assertIncludes(page, 'LandingV2LifecycleStory', 'lifecycle story mounted')
  assertIncludes(page, '<LandingV2LifecycleStory />', 'lifecycle story element')

  assert(
    page.indexOf('<LandingV2ProductStory />') < page.indexOf('id="jak-dziala"'),
    'product story before jak-dziala',
  )

  const productStory = read(
    'src/features/landing-v2/product-story/LandingV2ProductStory.tsx',
  )
  const productStoryCss = read(
    'src/features/landing-v2/product-story/LandingV2ProductStory.module.css',
  )
  const productProgress = read(
    'src/features/landing-v2/product-story/productStoryProgress.ts',
  )
  const productWorkspace = read(
    'src/features/landing-v2/product-story/ProductStoryWorkspace.tsx',
  )
  const productFragments = read(
    'src/features/landing-v2/product-story/productStoryFragments.ts',
  )
  assertIncludes(productStory, 'HeroTabletFrame', 'reuses approved Hero tablet shell')
  assertIncludes(productStory, 'ProductStoryWorkspace', 'wedding-detail walkthrough')
  assertIncludes(productStory, 'deviceCamera', 'camera pull-back layer')
  assertIncludes(productStory, 'computeProductCoverScale', 'measured cover scale')
  assertIncludes(productStoryCss, '#000000', 'black stage start')
  assertIncludes(productStoryCss, '360svh', 'product story scrub track preserved')
  assertIncludes(productStoryCss, '120svh', 'post-story exit pin budget for lifecycle')
  assertIncludes(productStoryCss, 'deviceExit', 'lifecycle exit wrapper outside deviceCamera')
  assertIncludes(productStory, 'lifecycleExitMv', 'Product exit driven by lifecycle clock only')
  assertIncludes(productStory, 'data-ps-device-exit', 'exit wrapper marker')
  assertIncludes(productStoryCss, 'deviceCamera', 'camera layer css')
  assertIncludes(productStoryCss, 'paperPlate', 'compositor paper opacity plate')
  assertIncludes(productStoryCss, 'exitVeil', 'compositor exit veil opacity plate')
  assertNotIncludes(
    productStoryCss,
    'color-mix(',
    'no per-frame color-mix on Product visual stage',
  )
  assertIncludes(productStoryCss, 'z-index: 6', 'above Problem Story sticky while theater-owned')
  assertIncludes(
    productStoryCss,
    "data-ps-theater-owned='true'",
    'sticky shell owned state raises stacking',
  )
  assertIncludes(
    productStoryCss,
    'content-visibility: hidden',
    'Problem-owned sticky drops compositor work',
  )
  assertNotIncludes(productStory, 'PRODUCT_STORY_FRAGMENTS', 'no floating fragment architecture')
  assertNotIncludes(productStory, 'FragmentCard', 'no fragment cards')
  assertNotIncludes(productStory, 'ProductStoryFrame', 'old floating frame removed')
  assertNotIncludes(productStory, 'PRODUCT_STORY_BRIDGE', 'no duplicate Scene 07 bridge headline')
  assertNotIncludes(productFragments, 'PRODUCT_STORY_BRIDGE', 'bridge copy removed')
  assertNotIncludes(productFragments, "id: 'identity'", 'fragment constellation removed')
  assertNotIncludes(productStory, 'LandingV2Hero', 'does not import Hero section')
  assertNotIncludes(productStory, 'LandingV2ProblemStory', 'does not import Problem Story')
  assertIncludes(productStory, 'data-product-theater="static"', 'reduced-motion static fallback')
  assertIncludes(
    productStory,
    'data-product-theater="scroll"',
    'compact normal-motion uses scroll theater',
  )
  assertIncludes(
    productStoryCss,
    "data-product-theater='scroll'",
    'compact scroll theater preserves Product runway/overlap',
  )
  assertIncludes(
    productStoryCss,
    "data-product-theater='static'",
    'only static theater collapses on compact',
  )
  assertIncludes(productStoryCss, 'deviceFitSlot', 'Product compact outer fit slot')
  assertIncludes(productStoryCss, '--ps-device-fit-scale', 'Product compact fit scale var')
  assertIncludes(
    productProgress,
    'PRODUCT_STORY_COVER_SCALE_FALLBACK_COMPACT = 3.2',
    'compact Product cover fallback pairs Scene 07',
  )
  assertIncludes(
    productProgress,
    'PRODUCT_STORY_COVER_SCALE_FALLBACK = 2.15',
    'desktop Product cover fallback frozen',
  )
  assertIncludes(
    productProgress,
    'PRODUCT_COVER_SCALE_DESKTOP',
    'desktop cover clamp isolated',
  )
  assertIncludes(
    productProgress,
    'PRODUCT_COVER_SCALE_COMPACT',
    'compact cover clamp from Hero geometry',
  )
  assertIncludes(
    productProgress,
    'HERO_THEATER_GEOMETRY_COMPACT',
    'Product compact cover shares Hero overscan source',
  )
  assertIncludes(
    read('src/features/landing-v2/hero/landingTabletFit.ts'),
    'LANDING_TABLET_DESIGN_WIDTH_PX = 1420',
    'shared canonical tablet design width',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2Hero.tsx'),
    'measureCanonicalDeviceFit',
    'Hero settle uses shared tablet fit helper',
  )
  assertNotIncludes(
    productStory,
    '--lv2-ps-headline-exit',
    'Scene 07 exit var owned by Problem Story only',
  )
  assertIncludes(productStory, '--screen-blackout', 'screen wake via blackout')
  assertIncludes(productProgress, 'SCENE07_HANDOFF_CSS_VAR', 'Scene 07 handoff CSS var')
  assertIncludes(productProgress, 'readScene07HandoffT', 'reads Scene 07 handoff clock')
  assertIncludes(productProgress, 'screenRevealFromHandoff', 'screen reveal from Scene 07 handoff')
  assertIncludes(productProgress, 'PRODUCT_SCREEN_REVEAL', 'screen reveal window constants')
  assertIncludes(productProgress, 'productVisualActive', 'symmetric visual activation helper')
  assertIncludes(productProgress, 'productTheaterOwned', 'explicit Product theater ownership')
  assertIncludes(productProgress, 'deviceScaleFromHandoff', 'linear device scale helper')
  assertIncludes(productProgress, 'stagePaperFromHandoff', 'linear stage paper helper')
  assertIncludes(productProgress, 'viewportCrossHandoffT', 'viewport-cross audit helper')
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'deviceScaleFromHandoff',
    'Product deviceScale uses linear handoff helper',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'paperPlate',
    'stage paper via opacity plate MotionValue',
  )
  assertNotIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    '--ps-stage-paper',
    'no CSS-variable-driven paper paint path',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'screenBlackoutMv',
    'screen blackout via useTransform MotionValue',
  )
  assertNotIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'easeOutCubic(handoffT)',
    'no easeOut on handoff device/paper/blackout hot path',
  )
  assertIncludes(
    productStory,
    'workspaceDormantFromHandoff',
    'workspace dormancy discrete gate under black travel',
  )
  assertIncludes(
    productStory,
    'data-ps-workspace-dormant',
    'workspace dormancy DOM attribute (no per-frame React)',
  )
  assertIncludes(
    productStoryCss,
    "data-ps-workspace-dormant='true'",
    'dormant workspace uses visibility/content-visibility',
  )
  assertIncludes(
    productProgress,
    'workspaceRenderActive',
    'workspace render-active helper at reveal threshold',
  )
  assertIncludes(
    productProgress,
    'readProductTabletDiagMode',
    'URL-only Tablet #2 diagnostic modes',
  )
  assertIncludes(
    productProgress,
    'deviceScaleContinuitySamples',
    'small-scroll continuity helper for linear scale',
  )
  assertIncludes(
    productStory,
    'data-ps-tablet-diag',
    'diagnostic mode attr published (no landing UI controls)',
  )
  assertIncludes(
    productProgress,
    'lv2TabletDiag',
    'diagnostic query param is URL-only (no landing UI)',
  )
  assertNotIncludes(
    productStory,
    'setTheaterOwned',
    'no React state for theater ownership flips',
  )
  assertNotIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'setVisualActive',
    'no React state for visual activation flips',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/scene07HandoffClock.ts'),
    'scene07HandoffMv',
    'shared handoff MotionValue clock',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'scene07HandoffMv',
    'Product deviceScale driven from shared handoff MotionValue',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'useMotionValueEvent(scene07HandoffMv',
    'ownership flags via MotionValue event (DOM attrs only)',
  )
  assertNotIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'readScene07HandoffT()',
    'Product must not poll handoff via CSS read helper in hot path',
  )
  assertNotIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'requestAnimationFrame(loop)',
    'no perpetual Product rAF measure loop',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'publishScene07HandoffT',
    'Problem Story publishes shared handoff MotionValue',
  )
  assertIncludes(productProgress, 'toLogistics', 'tab walkthrough logistics')
  assertIncludes(productProgress, 'toQuestionnaire', 'tab walkthrough questionnaire')
  assertIncludes(productProgress, 'computeProductCoverScale', 'cover scale helper')
  assertNotIncludes(productProgress, 'deviceReveal', 'device reveal owned by Scene 07 handoff')
  assertNotIncludes(productProgress, 'headlineExit', 'headline exit owned by Scene 07 handoff')
  assertNotIncludes(productProgress, 'stagePaper(', 'no legacy stagePaper() sticky helper')
  assertNotIncludes(productProgress, 'uiWake', 'UI wake no longer a sticky post-handoff phase')
  assertIncludes(productWorkspace, 'juliaMaksymilian', 'narrative SoT')
  assertIncludes(productWorkspace, 'Przegląd', 'overview tab')
  assertIncludes(productWorkspace, 'Logistyka', 'logistics tab')
  assertIncludes(productWorkspace, 'Umowa i finanse', 'finance tab')
  assertIncludes(productWorkspace, 'Ankieta przedślubna', 'questionnaire tab')
  assertIncludes(productWorkspace, 'tabUnderline', 'shared sliding underline')
  assertIncludes(productWorkspace, 'HERO_DEMO_LIGHT_TOKENS', 'light Graphite Modern tokens')
  assertIncludes(productWorkspace, 'data-ps-sidebar', 'Graphite sidebar present')
  assertIncludes(productWorkspace, 'HERO_MODERN_DEMO', 'Hero sidebar nav labels')
  assertIncludes(productWorkspace, "id === 'weddings'", 'Śluby rail active in theater')
  assertNotIncludes(productWorkspace, 'Dzień dobry', 'no dashboard greeting on wedding detail')
  assertNotIncludes(productWorkspace, 'greetingLine', 'no greeting chrome')
  assertIncludes(productWorkspace, 'styles.hero', 'wedding identity hero')
  assertIncludes(
    productProgress,
    'PRODUCT_SCREEN_REVEAL = { start: 0.72, end: 0.96 }',
    'UI wakes after high-amplitude camera travel (Hero-parity black screen)',
  )
  assertIncludes(
    productStory,
    'screenBlackoutFromHandoff',
    'blackout driven by handoffT not sticky post-settle',
  )
  assertIncludes(
    productStory,
    'productTheaterOwned',
    'Product sticky ownership is an explicit current-state gate',
  )
  assertIncludes(
    productStory,
    'data-ps-theater-owned',
    'sticky shell publishes theater ownership attribute',
  )
  assertIncludes(
    productStory,
    'productVisualActive',
    'visual stage is pure function of handoffT',
  )
  assertNotIncludes(
    productStory,
    'previousScrollY',
    'no scroll-direction history for ownership',
  )
  assertNotIncludes(
    productStory,
    'scrollDirection',
    'no scroll-direction variable for ownership',
  )
  assertNotIncludes(
    productStory,
    'isScrollingUp',
    'no reverse-scroll flag for ownership',
  )
  assertNotIncludes(
    productStory,
    'filter:',
    'no workspace filter blur during handoff (blackout only)',
  )
  assertNotIncludes(
    productStory,
    'data-ps-ui-wake',
    'removed uiWake blur wrapper that escaped screen clip',
  )
  assertIncludes(
    productStory,
    'data-ps-workspace-clip',
    'workspace clipped inside tablet screen',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.module.css'),
    '170svh',
    'Product Story scroll geometry overlaps Problem Story for Scene 07 pin',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'data-ps-visual-stage',
    'visual stage is the sole Product Story paint owner',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.module.css'),
    "data-ps-visual-active='true'",
    'visual stage activates only after Scene 07 handoff begins',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.module.css'),
    'visibility: hidden',
    'Product visual stage suppressed before handoff',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.module.css'),
    'background: transparent',
    'track/sticky remain transparent geometry',
  )
  assertNotIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.module.css'),
    'filter: blur',
    'Product Story CSS has no workspace blur during handoff',
  )
  assertNotIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx'),
    'position: fixed',
    'no fixed Product Story theater roots',
  )
  assertNotIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.module.css'),
    'position: fixed',
    'no fixed Product Story CSS roots',
  )

  /* Screen reveal — after camera travel; black screen during main scale. */
  {
    assert(
      screenRevealFromHandoff(0.5) <= 0.001,
      'screenReveal at handoff 0.50 must stay black during camera travel',
    )
    assert(
      screenRevealFromHandoff(0.72) <= 0.001,
      'screenReveal at handoff 0.72 (reveal start) must be ~0',
    )
    assert(
      screenRevealFromHandoff(0.84) > 0.4 && screenRevealFromHandoff(0.84) < 0.6,
      'screenReveal mid-window ~0.5',
    )
    assert(
      screenRevealFromHandoff(0.96) >= 0.99,
      'screenReveal at handoff 0.96 must be ~1',
    )
    assert(
      Math.abs(screenRevealFromHandoff(1) - 1) <= 0.001,
      'screenReveal at handoff 1.00 must be 1',
    )
    assert(
      !productVisualActive(0) && !productVisualActive(0.001),
      'visual stage must be inactive at handoffT <= EPSILON',
    )
    assert(
      productVisualActive(0.002),
      'visual stage must activate above EPSILON',
    )
    assert(
      !productTheaterOwned(0) && !productTheaterOwned(0.001),
      'Problem-owned: theater inactive at handoffT <= EPSILON',
    )
    assert(
      productTheaterOwned(0.002),
      'handoff-owned: theater active when handoffT > EPSILON',
    )
    assert(
      productTheaterOwned(1),
      'Product-owned: theater remains active after completed handoff',
    )
    assert(
      productTheaterOwned(0.5) === productVisualActive(0.5),
      'ownership and visual activation stay aligned on handoffT',
    )
    assert(
      screenBlackoutFromHandoff(0.6) >= 0.99,
      'at handoff 0.60 screen stays black while camera still travels',
    )
    const cs = PRODUCT_STORY_COVER_SCALE_FALLBACK
    assert(
      deviceScaleFromHandoff(0.6, cs) > 1.01 && screenRevealFromHandoff(0.6) <= 0.001,
      'at handoff 0.60 device still shrinking with black screen (Hero-parity)',
    )
    {
      const crossT = viewportCrossHandoffT(1.45, 896, 1178)
      assert(crossT > 0.26 && crossT < 0.36, 'viewportCrossT in expected band for linear scale')
      assert(
        screenBlackoutFromHandoff(0.1) >= 0.97,
        'near cover-scale reverse frames stay black (no giant light cards)',
      )
    }
    /* Main travel continuity — linear scale monotonic, no derivative jumps. */
    {
      let prev = deviceScaleFromHandoff(0, cs)
      for (let i = 1; i <= 20; i++) {
        const t = i / 20
        const next = deviceScaleFromHandoff(t, cs)
        assert(next <= prev + 1e-9, `deviceScale monotonic decreasing at t=${t}`)
        assert(
          Math.abs((prev - next) - (cs - 1) / 20) <= 0.001,
          `deviceScale linear step at t=${t}`,
        )
        prev = next
      }
      assert(Math.abs(deviceScaleFromHandoff(1, cs) - 1) <= 0.001, 'deviceScale ends at 1')
    }
    /* Small scroll increments → proportional linear scale (no plateaus / rounding cliffs). */
    {
      const budget = 1200
      const samples = deviceScaleContinuitySamples(cs, [1, 2, 4, 8], budget)
      for (const s of samples) {
        const expectedHandoff = s.scrollDelta / budget
        const expectedScale = -expectedHandoff * (cs - 1)
        assert(
          Math.abs(s.handoffDelta - expectedHandoff) < 1e-12,
          `handoff delta proportional for +${s.scrollDelta}px`,
        )
        assert(
          Math.abs(s.scaleDelta - expectedScale) < 1e-12,
          `scale delta proportional for +${s.scrollDelta}px`,
        )
      }
      assert(
        Math.abs(samples[3]!.scaleDelta / samples[0]!.scaleDelta - 8) < 1e-9,
        '8px scale delta is 8× the 1px scale delta (linear continuity)',
      )
    }
    /* Workspace dormancy — black under travel; wake at reveal start. */
    {
      assert(workspaceDormantFromHandoff(0.5), 'workspace dormant mid-travel')
      assert(workspaceDormantFromHandoff(0.719), 'workspace dormant just before reveal')
      assert(workspaceRenderActive(0.72), 'workspace render-active at reveal start')
      assert(!workspaceDormantFromHandoff(0.85), 'workspace active during reveal fade')
      assert(readProductTabletDiagMode('') === 'full', 'diag default full')
      assert(readProductTabletDiagMode('?lv2TabletDiag=black') === 'black', 'diag black')
      assert(readProductTabletDiagMode('?lv2TabletDiag=noshadow') === 'noshadow', 'diag noshadow')
      assert(readProductTabletDiagMode('?lv2TabletDiag=flat') === 'flat', 'diag flat')
      assert(readProductTabletDiagMode('?lv2TabletDiag=static') === 'static', 'diag static')
    }
  }
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'pastProblemStory',
    'Problem progress stays 1 past track end so Product ownership does not cliff',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    '--lv2-scene07-handoff',
    'Problem Story publishes the single handoff clock',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    's07Range.outStart',
    'handoffT derived from Scene 07 outStart',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    's07Range.outEnd',
    'handoffT derived from Scene 07 outEnd',
  )
  assertNotIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'blur(calc',
    'Scene 07 blur is MotionValue-driven, not CSS calc on full stage',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    's6ExitFilter',
    'Scene 07 exit blur MotionValue restored',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'data-scene07-headline-blur',
    'Scene 07 blur owned by tight headline wrapper',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'style={{ filter: s6ExitFilter }}',
    'filter applied on headline blur layer only',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'scene07PinActive',
    'Scene 07 portal pin engages before enter (opacity≈0)',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    "from '@/features/landing-v2/sections/scene07HeadlineContinuity'",
    'Scene 07 pin helper shared with continuity tests',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'scene07PinActive(storyP)',
    'Scene 07 pin driven by storyP before enter, not handoffT mid-exit',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'setScene07Pinned(nextPinned)',
    'Scene 07 pin React state updates only at discrete crossings',
  )
  assertNotIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'setScene07ExitFixed(scene07HandoffT',
    'regression: must not remount portal at handoffT>0 while headline opaque',
  )
  assertNotIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'var(--lv2-ps-headline-exit',
    'portaled Scene 07 must not swap to CSS-var opacity/scale mid-exit',
  )
  assert(
    !read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx').includes(
      "filter: 'blur",
    ) &&
      !read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx').match(
        /sceneLayer[\s\S]{0,400}filter:\s*s6ExitFilter/,
      ),
    'filter must not be on full-viewport sceneLayer style object',
  )
  assertNotIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'productExit',
    'no Product sticky-driven exit competition',
  )

  /* Scene 07 headline handoff continuity — no disappear→reappear gap. */
  {
    const r = getScene07Range()
    const pinStart = r.inStart - SCENE07_PIN_LEAD
    assert(
      !scene07PinActive(pinStart - 0.001),
      'Scene 07 pin inactive before lead-in',
    )
    assert(scene07PinActive(pinStart), 'Scene 07 pin active at lead-in')
    assert(
      scene07PinActive(r.inStart),
      'Scene 07 pin active at enter start (opacity still rising from 0)',
    )
    assert(
      scene07HeadlineVisualAt(pinStart).opacity <= 0.001,
      'pin engages while headline opacity ≈ 0',
    )
    assert(
      scene07PinActive(r.outStart) && scene07PinActive(r.outStart + 0.001),
      'pin already held at handoff start — no remount mid-exit',
    )

    /* Dense forward samples across hold → exit: visibility never dips then rises. */
    let sawFinalZero = false
    let wasVisible = false
    let prevOpacity = scene07HeadlineVisualAt(r.holdStart).opacity
    for (let p = r.holdStart; p <= 1.0001; p += 0.001) {
      const s = scene07HeadlineVisualAt(Math.min(1, p))
      assert(s.pinned, 'Scene 07 must stay pinned through visible life')
      if (s.visible) {
        assert(
          !sawFinalZero,
          'Scene 07 must not reappear after final fade (forward)',
        )
        wasVisible = true
      } else if (wasVisible && s.opacity <= 0.02) {
        sawFinalZero = true
      }
      /* No mid-exit flash to zero then recovery before true end. */
      if (
        wasVisible &&
        !sawFinalZero &&
        prevOpacity > 0.25 &&
        s.opacity < 0.02 &&
        s.handoffT < 0.85
      ) {
        assert(
          false,
          `Scene 07 flash-to-hidden mid-exit at handoffT=${s.handoffT}`,
        )
      }
      prevOpacity = s.opacity
    }
    assert(sawFinalZero, 'Scene 07 exit must reach final opacity ≈ 0')
    assert(wasVisible, 'Scene 07 must be visible during hold')

    /* Boundary: last stable hold frame vs first exit frame — geometric continuity. */
    const stable = scene07HeadlineVisualAt(r.outStart)
    const firstExit = scene07HeadlineVisualAt(r.outStart + 0.0005)
    assert(Math.abs(stable.opacity - firstExit.opacity) < 0.02, 'Δopacity ≈ 0 at exit start')
    assert(Math.abs(stable.scale - firstExit.scale) < 0.05, 'Δscale ≈ 0 at exit start')
    assert(Math.abs(stable.blurPx - firstExit.blurPx) < 0.5, 'Δblur ≈ 0 at exit start')
    assert(stable.pinned && firstExit.pinned, 'same pinned owner across exit boundary')

    /* Reverse: pin remains held while headline is still visible (no remount pop). */
    for (let p = 1; p >= r.holdStart - 0.0001; p -= 0.002) {
      const s = scene07HeadlineVisualAt(Math.max(r.holdStart, p))
      if (s.opacity > 0.02) {
        assert(
          s.pinned,
          `reverse: Scene 07 must stay pinned while visible (op=${s.opacity})`,
        )
      }
    }
    /* Reverse opacity reconstructs continuously (no zero-hole then rise mid-band). */
    {
      let prev = scene07HeadlineVisualAt(1).opacity
      let rising = false
      for (let p = 1; p >= r.outStart - 0.0001; p -= 0.001) {
        const op = scene07HeadlineVisualAt(Math.max(r.outStart, p)).opacity
        if (op > prev + 0.005) rising = true
        if (rising && prev > 0.2 && op < 0.02) {
          assert(false, 'reverse Scene 07 opacity hole after reconstruct began')
        }
        prev = op
      }
    }
  }

  assertNotIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'handoffClear',
    'no handoffClear paint flag',
  )
  assertNotIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'dataset.psHandoff',
    'no html data-ps-handoff paint gate',
  )
  assertNotIncludes(
    read('src/features/landing-v2/product-story/LandingV2ProductStory.module.css'),
    'data-ps-handoff',
    'Product Story no longer gated by html data-ps-handoff',
  )
  assertNotIncludes(productStory, 'Jedno miejsce', 'Product Story has no Scene 07 copy')
  assertNotIncludes(productStory, 'Zero chaosu', 'Product Story has no Scene 07 copy')
  assertNotIncludes(productWorkspace, 'Jedno miejsce', 'workspace has no Scene 07 copy')

  const productPanels = read(
    'src/features/landing-v2/product-story/ProductStoryPanels.tsx',
  )
  assertNotIncludes(productPanels, 'Jedno miejsce', 'panels have no Scene 07 copy')
  const productPanelsCss = read(
    'src/features/landing-v2/product-story/ProductStoryPanels.module.css',
  )
  const productWorkspaceCss = read(
    'src/features/landing-v2/product-story/ProductStoryWorkspace.module.css',
  )
  assertIncludes(productPanels, 'mapPoints', 'logistics map points')
  assertIncludes(productPanels, 'data-ps-route-map', 'SVG route map surface')
  assertIncludes(productPanels, '<svg', 'inline SVG map, no image asset')
  assertIncludes(productPanels, 'mapStreets', 'irregular street network')
  assertIncludes(productPanels, 'C 32 30', 'curved route geometry unchanged')
  assertIncludes(productPanels, 'paymentDueDate', 'finance payment due date')
  assertIncludes(productPanels, 'travelAmount', 'travel fee displayed')
  assertIncludes(productPanels, 'pkg.contents', 'package details')
  assertIncludes(productPanels, 'data-ps-q-summary', 'questionnaire summary section')
  assertIncludes(productPanels, 'data-ps-q-locations', 'questionnaire locations section')
  assertIncludes(productPanels, 'data-ps-q-priorities', 'questionnaire priorities section')
  assertIncludes(productPanels, 'questionnaireContent', 'questionnaire chapter grid')
  assertIncludes(productPanels, 'q.summary', 'questionnaire summary from SoT')
  assertIncludes(productPanels, 'q.locations', 'questionnaire locations from SoT')
  assertIncludes(productPanels, 'q.priorities', 'questionnaire priorities from SoT')
  assertIncludes(productPanels, 'data-ps-next-steps', 'overview next-steps strip')
  assertIncludes(productPanels, 'data-ps-payment-history', 'finance payment history')
  assertIncludes(productPanels, 'coverageEnd', 'logistics coverage end row')
  assertIncludes(productPanels, 'financeBottom', 'finance two-column lower cards')
  assertIncludes(productPanels, 'overviewLayout', 'dense overview main/side layout')
  assertIncludes(productPanels, 'w.story.title', 'overview readiness lead from SoT')
  assertNotIncludes(productPanels, 'Dzień dobry', 'panels are wedding detail, not dashboard')
  assertNotIncludes(productPanels, 'google', 'no Google Maps')
  assertNotIncludes(productPanels, '<img', 'no screenshot/image assets')
  assertIncludes(productPanelsCss, '.mapSvg', 'CSS/SVG map styles')
  assertIncludes(productPanelsCss, '.mapStreets', 'map street styles')
  assertIncludes(productPanelsCss, '.routeLeg', 'route connector chips')
  assertIncludes(productPanelsCss, '.questionnaireContent', 'questionnaire fills chapter via grid')
  assertIncludes(productPanelsCss, 'grid-template-rows', 'explicit questionnaire row template')
  assertIncludes(productPanelsCss, '.qSummaryGrid', 'questionnaire summary grid')
  assertIncludes(productPanelsCss, '.qLocationsGrid', 'questionnaire locations grid')
  assertIncludes(productPanelsCss, '.qPrioritiesLayout', 'questionnaire priorities layout')
  assertIncludes(productWorkspaceCss, 'height: 548px', 'fixed chapter viewport height')
  assertIncludes(productWorkspaceCss, 'max-height: 548px', 'chapter height locked across tabs')

  const narrative = read('src/features/landing-v2/narrative/juliaMaksymilian.ts')
  assertIncludes(narrative, 'Na ten moment wszystko gotowe', 'overview readiness copy in SoT')
  assertIncludes(narrative, 'routeLegs', 'narrative SoT route legs')
  assertIncludes(narrative, 'mapPoints', 'narrative SoT map points')
  assertIncludes(narrative, 'paymentDueDate', 'narrative payment due')
  assertIncludes(narrative, 'travelAmount', 'narrative travel fee')
  assertIncludes(narrative, 'package:', 'narrative package block')
  assertIncludes(narrative, 'Odpowiedzi pary', 'questionnaire section label')
  assertIncludes(narrative, 'nextSteps', 'overview next steps in SoT')
  assertIncludes(narrative, 'summary:', 'questionnaire summary SoT')
  assertIncludes(narrative, 'locations:', 'questionnaire locations SoT')
  assertIncludes(narrative, 'priorities:', 'questionnaire priorities SoT')
  assertIncludes(narrative, 'Pierwszy taniec', 'questionnaire has dance answer')
  assertIncludes(narrative, 'Dodatkowe uwagi', 'questionnaire notes')
  assertIncludes(
    productWorkspace,
    'HERO_MODERN_DEMO',
    'Hero sidebar nav labels',
  )
  assertIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx'),
    'weights.length - 1 ? 0.52',
    'Scene 07 shorter hold before exit',
  )
  assertNotIncludes(
    read('src/features/landing-v2/sections/LandingV2ProblemStory.module.css'),
    'data-handoff-clear',
    'no transparent Problem sticky handoffClear',
  )
  assertIncludes(productStory, 'data-product-theater="static"', 'reduced-motion static fallback remains')
  assertIncludes(productStory, 'data-ps-visual-stage', 'Product visual stage marker')
  assertIncludes(productStory, 'scene07HandoffMv', 'Product Story follows Scene 07 handoff MotionValue')
  assertIncludes(productStory, 'productVisualActive', 'visual stage activation from handoffT')
  assertIncludes(
    productStory,
    'PRODUCT_STORY_COVER_SCALE_FALLBACK_COMPACT',
    'compact cover fallback wired into Product theater',
  )

  const tablet = read('src/features/landing-v2/hero/HeroTabletFrame.tsx')
  assertIncludes(tablet, 'lv2-hero-tablet', 'tablet testid')
  assertIncludes(tablet, 'hardwareProgress', 'late hardware reveal prop')
  assertIncludes(tablet, 'cameraCluster', 'camera/sensor cluster')
  assertIncludes(tablet, 'powerButton', 'power button')
  assertIncludes(tablet, 'volumeUp', 'volume up')
  assertIncludes(tablet, 'volumeDown', 'volume down')
  assertNotIncludes(tablet, '.png', 'no png device asset')
  assertNotIncludes(tablet, '<img', 'no image tag')
  assertNotIncludes(tablet, 'Apple', 'no Apple branding')

  const tabletCss = read('src/features/landing-v2/hero/HeroTabletFrame.module.css')
  assertIncludes(tabletCss, 'overflow: hidden', 'screen clips dashboard')
  assertIncludes(tabletCss, 'scale(calc(100cqi / 1420px))', 'uniform dashboard scale')
  assertIncludes(tabletCss, '--hardware-progress', 'hardware progress var')
  assertIncludes(tabletCss, '--chassis', 'chassis thickness')
  assertIncludes(tabletCss, '--bezel', 'bezel thickness')
  assertIncludes(tabletCss, '--screen-ratio', 'canonical screen aspect ratio')
  assertIncludes(tabletCss, 'aspect-ratio: var(--screen-ratio)', 'screen height follows ratio')
  assertIncludes(tabletCss, '142 / 86', 'dashboard design aspect 1420×860')
  assertIncludes(tabletCss, "data-canonical='true'][data-fit-lock='true']", 'fit-lock freezes design width')
  assertIncludes(tabletCss, '1420px + 2 * var(--outset)', 'fit-lock uses design canvas width')
  assertNotIncludes(tabletCss, 'min(78svh', 'no independent viewport-height screen sizing')
  assertNotIncludes(tabletCss, '100cqi * 0.68', 'no divergent cqi height vs width')
  assertNotIncludes(tabletCss, '388 / 195', 'no clipped svh laptop ratio')
  /* Viewport must not reflow non-compact / canonical tablets */
  assertNotIncludes(
    tabletCss,
    ".device:not([data-compact='true']) {\n    --chassis: 6px;",
    'no viewport media crop of non-compact tablet',
  )
  assertIncludes(tabletCss, 'screenBlackout', 'screen blackout layer')
  assertIncludes(tabletCss, '#000000', 'blackout true black')
  assertNotIncludes(tabletCss, 'scaleX', 'no non-uniform X scale')
  assertNotIncludes(tabletCss, 'scaleY', 'no non-uniform Y scale')
  assertNotIncludes(tabletCss, 'filter: blur', 'no blur on device')
  assertNotIncludes(tabletCss, 'mask-image', 'no dissolve mask on tablet')
  assertNotIncludes(tabletCss, 'backdrop-filter', 'no backdrop blur on device')

  const modern = read('src/features/landing-v2/hero/HeroModernDashboard.tsx')
  assertIncludes(modern, 'heroModernDemoData', 'local demo data')
  assertIncludes(modern, 'Najbliższe zlecenie', 'nearest geometry')
  assertIncludes(modern, 'Kolejne zlecenia', 'upcoming')
  assertIncludes(modern, 'Powiadomienia', 'notifications')
  assertIncludes(modern, 'Terminy oddania', 'deadlines')
  assertIncludes(modern, 'Dziś', 'today tasks')
  assertIncludes(modern, 'themeProgress', 'theme interpolation prop')
  assertIncludes(modern, 'applyHeroDemoThemeToElement', 'semantic token interpolation')
  assertNotIncludes(modern, '@supabase', 'no supabase')
  assertNotIncludes(modern, 'useQuery', 'no react-query')
  assertNotIncludes(modern, 'useAuth', 'no auth')
  assertNotIncludes(modern, 'taskService', 'no task service')
  assertNotIncludes(modern, 'DashboardDemo', 'no classic demo')
  assertNotIncludes(modern, 'NextAssignmentCard', 'no classic nearest card')
  assertNotIncludes(modern, 'TodoTodayCard', 'no classic today card')
  assertNotIncludes(modern, 'DemoAppShell', 'no V3 demo shell')

  const modernCss = read(
    'src/features/landing-v2/hero/HeroModernDashboard.module.css',
  )
  assertIncludes(modernCss, '--dashboard-design-width: 1420px', 'design width')
  assertIncludes(modernCss, '--sidebar-design-width: 224px', 'sidebar width')
  assertIncludes(modernCss, "minmax(0, 1.72fr) minmax(340px, 0.86fr)", 'modern grid')
  assertIncludes(
    modernCss,
    ".root[data-compact='true']",
    'dashboard crop only via data-compact',
  )
  assertNotIncludes(
    modernCss,
    '@media (max-width: 1100px)',
    'dashboard must not reflow from page viewport width',
  )
  const data = read('src/features/landing-v2/hero/heroModernDemoData.ts')
  assertIncludes(data, 'Julia i Maksymilian', 'demo couple')
  assertIncludes(data, 'Marta', 'greeting name')
  assertNotIncludes(data, 'Marcin Hibszer', 'no real user')
  assertNotIncludes(data, 'Hibszer', 'no real surname')

  assert(
    exists('src/features/landing-v2/hero/heroDemoThemeTokens.ts'),
    'hero demo theme tokens',
  )
  assert(
    exists('src/features/landing-v2/hero/heroDemoThemeInterpolation.ts'),
    'hero demo theme interpolation',
  )
  assertIncludes(modern, 'data-hero-modern-graphite', 'graphite scope')
  assert(exists('src/features/landing-v2/hero/heroModernDemoData.ts'), 'demo data')

  console.log('PASS  hero modern dashboard + scroll reveal')
}

{
  assertEq(juliaMaksymilian.wedding.coupleName, 'Julia i Maksymilian', 'couple')
  assertEq(juliaMaksymilian.wedding.isoDate, '2027-06-12', 'iso date')
  assertEq(juliaMaksymilian.wedding.date.day, '12', 'day')
  assertEq(juliaMaksymilian.wedding.date.month, 'CZE', 'month')
  assertEq(juliaMaksymilian.commercial.contractValue, '10 900 zł', 'value')
  assertEq(juliaMaksymilian.commercial.paid, '1 000 zł', 'paid')
  assertEq(juliaMaksymilian.commercial.remaining, '9 900 zł', 'remaining')
  assertEq(juliaMaksymilian.commercial.depositLabel, 'Zadatek', 'deposit label')
  assertEq(juliaMaksymilian.commercial.depositAmount, '1 000 zł', 'deposit amount')
  assertEq(juliaMaksymilian.wedding.places.juliaPrep.place, 'Hotel Stary', 'julia hotel')
  assertEq(juliaMaksymilian.wedding.places.maksPrep.place, 'Hotel Saski', 'maks hotel')
  assertEq(
    juliaMaksymilian.wedding.places.ceremony.place,
    'Kościół Świętych Apostołów Piotra i Pawła',
    'ceremony',
  )
  assertEq(juliaMaksymilian.wedding.places.reception.place, 'Villa Love', 'reception')
  assertEq(juliaMaksymilian.wedding.packageName, 'Reportaż Premium', 'package')
  assertEq(LANDING_V2_TABS[1]!.label, 'Logistyka', 'logistics tab')

  const expectedWorkflow = WORKFLOW_STAGES.map((s) => WORKFLOW_STAGE_LABELS[s])
  assertEq(
    juliaMaksymilian.workflowLabels.join('|'),
    expectedWorkflow.join('|'),
    'workflow labels match product',
  )
  assert(
    juliaMaksymilian.workflowLabels.includes('Formalności zakończone'),
    'formalności label',
  )
  assert(
    !juliaMaksymilian.workflowLabels.includes('Przygotowania'),
    'no fake Przygotowania stage',
  )

  const narrativeSrc = read('src/features/landing-v2/narrative/juliaMaksymilian.ts')
  assertNotIncludes(narrativeSrc, 'Zofia i Mikołaj', 'no Zofia')
  assertNotIncludes(narrativeSrc, 'Julia i Adrian', 'no V3 couple in narrative SoT')
  assertNotIncludes(narrativeSrc, '12 900', 'no V3 amount')
  assertNotIncludes(narrativeSrc, '12 000 zł', 'no old 12k')
  assertNotIncludes(narrativeSrc, 'Dwór Słoneczny', 'no old venue')

  console.log('PASS  narrative SoT (historical)')
}

{
  const lifecycle = read(
    'src/features/landing-v2/lifecycle-story/LandingV2LifecycleStory.tsx',
  )
  const lifecycleCss = read(
    'src/features/landing-v2/lifecycle-story/LandingV2LifecycleStory.module.css',
  )
  const lifecycleProgress = read(
    'src/features/landing-v2/lifecycle-story/lifecycleStoryProgress.ts',
  )
  const exitClock = read(
    'src/features/landing-v2/lifecycle-story/lifecycleExitClock.ts',
  )
  const surface = read(
    'src/features/landing-v2/lifecycle-story/LifecycleTransformSurface.tsx',
  )
  const link = read(
    'src/features/landing-v2/lifecycle-story/LifecycleLinkObject.tsx',
  )
  const explorer = read(
    'src/features/landing-v2/lifecycle-story/workflow/WorkflowExplorer.tsx',
  )
  const explorerCss = read(
    'src/features/landing-v2/lifecycle-story/workflow/WorkflowExplorer.module.css',
  )
  const explorerData = read(
    'src/features/landing-v2/lifecycle-story/workflow/workflowExplorerData.ts',
  )
  const kj = read('src/features/landing-v2/narrative/karolinaJan.ts')
  const productStory = read(
    'src/features/landing-v2/product-story/LandingV2ProductStory.tsx',
  )
  const handoffClock = read(
    'src/features/landing-v2/product-story/scene07HandoffClock.ts',
  )
  const heroTablet = read('src/features/landing-v2/hero/HeroTabletFrame.tsx')
  const problem = read(
    'src/features/landing-v2/sections/LandingV2ProblemStory.tsx',
  )

  assertIncludes(kj, 'Karolina & Jan', 'Karolina & Jan couple')
  assertIncludes(kj, '14 sierpnia 2027', 'wedding long date')
  assertIncludes(kj, 'ourwed.pl/a/karolina-jan', 'contract questionnaire URL')
  assertIncludes(kj, 'Nowe zlecenie zaczyna się', 'headline line 1')
  assertIncludes(kj, 'od jednego linku.', 'headline line 2')
  assertIncludes(kj, 'Ankieta do umowy', 'pill eyebrow')
  assertNotIncludes(kj, '@supabase', 'narrative has no supabase')

  assertIncludes(exitClock, 'lifecycleExitMv', 'shared lifecycle exit MotionValue')
  assertIncludes(lifecycle, 'publishLifecycleExitT', 'publishes exit clock')
  assertIncludes(lifecycle, 'useMotionValue(0)', 'one master progress MotionValue')
  assertIncludes(lifecycle, 'ipadExitFromProgress', 'Product iPad exit from master')
  assertIncludes(lifecycle, 'requestAnimationFrame(measure)', 'scroll→rAF measure')
  assertNotIncludes(lifecycle, 'requestAnimationFrame(loop)', 'no perpetual rAF loop')
  assertNotIncludes(lifecycle, 'getComputedStyle(document', 'no document getComputedStyle loop')
  assertNotIncludes(lifecycle, 'HeroPhoneFrame', 'no phone in lifecycle chapter')
  assertNotIncludes(lifecycle, 'LifecycleContractDocument', 'C2 contract scroll removed')
  assertNotIncludes(lifecycle, 'LifecycleFormContent', 'form scroll scene removed')
  assertNotIncludes(lifecycle, 'LifecycleBookingEssence', 'booking scroll scene removed')
  assertNotIncludes(lifecycle, 'data-lifecycle-contract-slot', 'no contract sibling slot')
  assertNotIncludes(lifecycle, 'setScrollProgress', 'no per-frame React scroll state')
  assertIncludes(lifecycle, 'LifecycleTransformSurface', 'continuous transform surface')
  assertIncludes(lifecycle, 'WorkflowExplorer', 'interactive workspace explorer')
  assertIncludes(lifecycle, 'data-lifecycle-headline', 'centered headline layer')
  assertIncludes(lifecycle, 'data-lifecycle-theater="static"', 'reduced-motion static fallback')
  assertIncludes(lifecycle, 'data-lifecycle-theater="scroll"', 'compact normal-motion scroll theater')
  assertIncludes(lifecycle, 'data-lifecycle-owned', 'pure ownership predicate')
  assertIncludes(lifecycle, 'data-lifecycle-morph="pill-to-workspace"', 'pill→workspace morph marker')
  assertIncludes(lifecycle, 'compact={isCompactViewport}', 'compact shell geometry for pill morph')
  assertIncludes(lifecycleCss, '320svh', 'desktop morph-only lifecycle scroll track')
  assertIncludes(lifecycleCss, '280svh', 'compact lifecycle scroll runway')
  assertIncludes(
    lifecycleCss,
    "data-lifecycle-theater='scroll'",
    'compact scroll theater preserves Lifecycle sticky',
  )
  assert(
    !/@media \(max-width: 1100px\) \{[^}]*\.sticky \{[^}]*display:\s*none/.test(
      lifecycleCss.replace(/\/\*[\s\S]*?\*\//g, ''),
    ),
    'compact must not hide Lifecycle scroll sticky',
  )
  assertNotIncludes(lifecycleCss, '880svh', 'old C2 scroll budget removed')
  assertIncludes(lifecycleCss, 'stickyPaper', 'sticky paper present')
  assertIncludes(lifecycleCss, '--lv2-hero-paper', 'Hero paper token')
  assertIncludes(lifecycleCss, 'z-index: 5', 'below Product sticky while Product exits')
  assertIncludes(lifecycleCss, 'place-items: center', 'viewport-centered stage')
  assertIncludes(lifecycleCss, "data-lifecycle-owned='false'", 'inactive ownership hide')

  assertIncludes(lifecycleProgress, 'ipadExit: { start: 0.0, end: 0.12 }', 'desktop ipad exit range frozen')
  assertIncludes(lifecycleProgress, 'headlineIn: { start: 0.06, end: 0.18 }', 'desktop headlineIn frozen')
  assertIncludes(lifecycleProgress, 'linkIn: { start: 0.32, end: 0.44 }', 'desktop linkIn frozen')
  assertIncludes(
    lifecycleProgress,
    'workspaceExpand: { start: 0.48, end: 0.86 }',
    'desktop pill→workspace expand frozen',
  )
  assertIncludes(lifecycleProgress, 'ipadExit', 'ipad exit range')
  assertIncludes(lifecycleProgress, 'headlineIn', 'headline entrance range')
  assertIncludes(lifecycleProgress, 'linkIn', 'link entrance range')
  assertIncludes(lifecycleProgress, 'workspaceExpand', 'pill→workspace expand range')
  assertIncludes(lifecycleProgress, 'sourceExit', 'pill content exit range')
  assertIncludes(lifecycleProgress, 'workspaceChromeIn', 'workspace chrome resolve range')
  const transformSurface = read(
    'src/features/landing-v2/lifecycle-story/LifecycleTransformSurface.tsx',
  )
  assertIncludes(transformSurface, 'Math.min(600, Math.max(480', 'desktop pill width formula frozen')
  assertIncludes(transformSurface, 'const workH = 620', 'desktop workspace height frozen')
  assertIncludes(transformSurface, 'compact ?', 'compact morph geometry isolated')
  assertIncludes(transformSurface, 'Math.min(vw - 28, 340)', 'compact pill width fits portrait')
  assertIncludes(transformSurface, 'Math.min(vw - 22, 430)', 'compact workspace nearly full phone width')
  assertIncludes(transformSurface, 'usable * 0.86', 'compact workspace ~86% of sticky stage')
  assertIncludes(transformSurface, 'Math.min(750, Math.max(620', 'compact workspace height band 620–750')
  assertIncludes(transformSurface, 'viewportTick', 'compact shell recomputes on viewport resize')
  assertIncludes(transformSurface, 'compact={compact}', 'compact layout passed into WorkflowExplorer')
  assertIncludes(explorer, "data-workflow-layout={compact ? 'compact' : 'desktop'}", 'layout mode flag')
  assertIncludes(explorer, 'data-workflow-copy', 'copy block marker')
  assertIncludes(explorer, 'data-workflow-visual', 'visual block marker')
  assertIncludes(explorer, "inline: 'center'", 'active tab scrolls into rail center')
  assertIncludes(explorerCss, "data-workflow-layout='compact'", 'compact vertical workspace styles')
  assertIncludes(explorer, "'desktop'", 'desktop layout mode token')
  assertIncludes(explorerCss, ":not([data-workflow-layout='compact'])", 'non-compact keeps prior narrow fallback')
  assertIncludes(
    explorerCss,
    'flex-direction: column',
    'compact panel stacks tabs/copy/visual vertically',
  )
  assertIncludes(explorerCss, 'mask-image: linear-gradient', 'compact tab rail edge fade')
  assert(
    explorer.indexOf('data-workflow-tablist') < explorer.indexOf('data-workflow-copy') &&
      explorer.indexOf('data-workflow-copy') < explorer.indexOf('data-workflow-visual'),
    'compact DOM order: tabs → copy → visual',
  )
  assertIncludes(explorerCss, 'grid-template-columns: minmax(0, 0.4fr) minmax(0, 0.6fr)', 'desktop horizontal split frozen')
  assertNotIncludes(explorer, '<select', 'no select dropdown for features')
  assertNotIncludes(explorer, 'hamburger', 'no hamburger feature menu')
  {
    const visualsCss = read(
      'src/features/landing-v2/lifecycle-story/workflow/WorkflowFeatureVisuals.module.css',
    )
    assertIncludes(
      visualsCss,
      "data-workflow-layout='compact'",
      'compact preview strategies scoped to layout flag',
    )
    assertIncludes(visualsCss, '--preview-scale-contract', 'Umowa compact token')
    assertIncludes(visualsCss, '--preview-scale-questionnaire', 'Ankiety compact token')
    assertIncludes(visualsCss, '--preview-density-logistics', 'Logistyka density token')
    assertIncludes(visualsCss, '--preview-density-execution', 'Realizacja density token')
    assertIncludes(visualsCss, '--workflow-compact-stack-width', 'shared Logistyka/Realizacja stack width')
    assertIncludes(visualsCss, "data-wf-visual='contract'", 'Umowa compact strategy')
    assertIncludes(visualsCss, "data-wf-visual='payments'", 'Płatności compact strategy')
    assertIncludes(visualsCss, "data-wf-visual='questionnaires'", 'Ankiety compact strategy')
    assertIncludes(visualsCss, "data-wf-visual='day-plan'", 'Plan dnia compact strategy')
    assertIncludes(visualsCss, "data-wf-visual='tasks'", 'Zadania compact strategy')
    assertIncludes(visualsCss, "data-wf-visual='calendar'", 'Kalendarz compact strategy')
    assertIncludes(visualsCss, "data-wf-visual='logistics'", 'Logistyka compact strategy')
    assertIncludes(visualsCss, "data-wf-visual='execution'", 'Realizacja compact strategy')
    assertIncludes(visualsCss, "data-wf-visual='studio'", 'Studio compact strategy')
    assertIncludes(
      visualsCss,
      "data-wf-visual='contract'] .flowRow",
      'Umowa keeps horizontal 3-step flow on compact',
    )
    assertIncludes(visualsCss, '.cardAction', 'Umowa Dokument card gets wider flex weight')
    {
      const btnBlock = visualsCss.match(
        /data-wf-visual='contract'\] \.fakeBtn \{([\s\S]*?)\}/,
      )
      assert(Boolean(btnBlock), 'Umowa fakeBtn block present')
      assertIncludes(btnBlock![1], 'width: 100%', 'Umowa button uses full Dokument card width')
      assertIncludes(btnBlock![1], 'font-size: 0.6875rem', 'Umowa button readable compact size')
      assertNotIncludes(btnBlock![1], 'font-size: 0.5625rem', 'Umowa button no longer micro-sized')
    }
    assertIncludes(
      visualsCss,
      'width: var(--workflow-compact-stack-width)',
      'Logistyka/Realizacja share stack width token',
    )
    assertNotIncludes(
      visualsCss,
      'transform: scale(0.66)',
      'no microscopic global contract scale',
    )
  }
  assertIncludes(lifecycleProgress, 'workspaceNavIn', 'nav chrome from shared reveal curve')
  assertIncludes(lifecycleProgress, 'workspaceInteractiveAt', 'interactive gate helper')
  assertIncludes(lifecycleProgress, 'WORKSPACE_INTERACTION_READY_AT', 'named interaction threshold')
  assertIncludes(lifecycleProgress, 'WORKSPACE_NAV_PERCEPTIBLE_OPACITY', 'perceptibility opacity gate')
  assertIncludes(lifecycleProgress, 'workspaceNavOpacityAt', 'nav opacity from shared reveal curve')
  assertIncludes(lifecycleProgress, 'workspaceVisuallySettledAt', 'visual settle distinct from interaction')
  {
    const opacityMatch = lifecycleProgress.match(
      /WORKSPACE_NAV_PERCEPTIBLE_OPACITY\s*=\s*([0-9.]+)/,
    )
    const navInMatch = lifecycleProgress.match(
      /workspaceNavIn:\s*\{\s*start:\s*([0-9.]+),\s*end:\s*([0-9.]+)/,
    )
    assert(Boolean(opacityMatch && navInMatch), 'nav perceptibility constants present')
    const y = Number(opacityMatch![1])
    const start = Number(navInMatch![1])
    const end = Number(navInMatch![2])
    const t = 1 - (1 - y) ** (1 / 3)
    const readyAt = start + t * (end - start)
    assert(y > 0 && y < 0.5, 'perceptible opacity mid-low (not invisible, not fully settled)')
    assertEq(start, 0.76, 'nav reveal start')
    assert(readyAt > start, 'interaction after opacity leaves 0')
    assert(readyAt < 0.8, 'interaction ready before 0.80 (not shell settle)')
    assert(readyAt < 0.86, 'interaction ready before former 0.86 settle gate')
    assert(readyAt >= 0.765 && readyAt <= 0.78, 'ready in early perceptible window ~0.77')
    assertIncludes(
      lifecycleProgress,
      'workspaceNavOpacityAt(p) >= WORKSPACE_NAV_PERCEPTIBLE_OPACITY',
      'interaction gated on nav perceptibility',
    )
    assertIncludes(
      lifecycleProgress,
      'WORKSPACE_INTERACTION_READY_AT = (() =>',
      'ready progress derived from nav curve (not hard-coded settle)',
    )
  }
  assertNotIncludes(
    lifecycleProgress,
    'WORKSPACE_INTERACTION_READY_AT = 0.86',
    'former 0.86 settle gate removed',
  )
  assertNotIncludes(
    lifecycleProgress,
    'return p >= WORKSPACE_INTERACTION_READY_AT',
    'no longer gates solely on hard-coded master progress compare',
  )
  assertNotIncludes(
    lifecycleProgress,
    'workspaceChromeIn.start, LIFECYCLE_RANGES.workspaceChromeIn.end) >= 0.98',
    'interaction no longer waits for chrome>=0.98',
  )
  assertNotIncludes(lifecycleProgress, 'contractGen', 'no contract generation scroll range')
  assertNotIncludes(lifecycleProgress, 'deposit:', 'no deposit scroll range')
  assertNotIncludes(lifecycleProgress, 'returnOw', 'no return-to-booking scroll range')
  assertNotIncludes(lifecycleProgress, 'phoneIn', 'no phone progress range')

  assertIncludes(surface, 'workspaceNavIn', 'nav opacity band on transform surface')
  assertIncludes(surface, 'workspaceInteractiveAt', 'surface uses interaction gate')
  assertNotIncludes(surface, 'progress.set(1)', 'click must not force morph to 1')
  assertNotIncludes(surface, 'scrollIntoView', 'surface click must not scroll page')
  assertNotIncludes(surface, 'setScrollProgress', 'no scroll progress React state')
  assertIncludes(explorer, 'disabled={!interactive}', 'tabs disabled below interaction threshold')
  assertIncludes(explorer, 'data-workflow-interactive', 'interactive DOM flag')
  assertIncludes(explorerCss, "data-workflow-interactive='false'", 'pointer-events off below threshold')
  assertIncludes(explorerCss, 'pointer-events: none', 'non-interactive blocks clicks')
  assertIncludes(explorerCss, ':hover:not(:disabled)', 'hover only when enabled')
  assertNotIncludes(explorer, 'setInterval', 'no autoplay')
  assertNotIncludes(explorer, 'progress.set', 'explorer does not mutate morph progress')
  assertNotIncludes(explorer, 'window.scroll', 'explorer does not change page scroll')

  assert(
    !exists('src/features/landing-v2/lifecycle-story/LifecycleFormContent.tsx'),
    'form content component removed',
  )
  assert(
    !exists('src/features/landing-v2/lifecycle-story/LifecycleBookingEssence.tsx'),
    'booking essence component removed',
  )
  assert(
    !exists('src/features/landing-v2/lifecycle-story/LifecycleContractDocument.tsx'),
    'contract document component removed',
  )

  assertIncludes(surface, 'data-lifecycle-surface', 'one continuous surface')
  assertIncludes(surface, 'LifecycleLinkObject', 'link state on surface')
  assertIncludes(surface, 'WorkflowExplorer', 'workspace on surface')
  assertIncludes(surface, 'workspaceExpand', 'expand morph range')
  assertIncludes(surface, 'surfaceWidth', 'continuous width morph')
  assertIncludes(surface, 'surfaceHeight', 'continuous height morph')
  assertIncludes(surface, 'surfaceRadius', 'continuous radius morph')
  assertNotIncludes(surface, 'LifecycleFormContent', 'no form layer')
  assertNotIncludes(surface, 'LifecycleBookingEssence', 'no booking layer')
  assertNotIncludes(surface, 'HeroPhoneFrame', 'surface has no phone')
  assertNotIncludes(surface, 'setScrollProgress', 'no scroll progress React state')

  assertIncludes(link, 'contractQuestionnaireUrl', 'link from SoT')
  assertIncludes(link, 'data-lc-src="karolina"', 'Karolina source token')
  assertIncludes(link, 'sourceExitT', 'shared source-group exit clock')
  assertIncludes(link, 'sourceOpacity', 'shared opacity for capsule source text')
  assertNotIncludes(link, 'sourceBlur', 'no blur on pill content exit')
  assertNotIncludes(link, 'filter: sourceFilter', 'no filter dissolve on pill')

  assertIncludes(explorer, 'role="tablist"', 'accessible tablist')
  assertIncludes(explorer, 'role="tab"', 'accessible tabs')
  assertIncludes(explorer, 'role="tabpanel"', 'accessible tabpanel')
  assertIncludes(explorer, 'ArrowRight', 'keyboard arrow navigation')
  assertIncludes(explorer, 'DEFAULT_WORKFLOW_FEATURE', 'default feature constant')
  assertIncludes(explorer, "useState<WorkflowFeatureKey>(DEFAULT_WORKFLOW_FEATURE)", 'click state only')
  assertNotIncludes(explorer, 'useScroll', 'tabs not scroll-driven')
  assertNotIncludes(explorer, 'setInterval', 'no autoplay')
  assertIncludes(explorerData, "key: 'contract'", 'Umowa feature')
  assertIncludes(explorerData, "label: 'Umowa'", 'Umowa label')
  assertIncludes(explorerData, "label: 'Płatności'", 'Płatności label')
  assertIncludes(explorerData, "label: 'Ankiety'", 'Ankiety label')
  assertIncludes(explorerData, "label: 'Plan dnia'", 'Plan dnia label')
  assertIncludes(explorerData, "label: 'Zadania'", 'Zadania label')
  assertIncludes(explorerData, "label: 'Kalendarz'", 'Kalendarz label')
  assertIncludes(explorerData, "label: 'Logistyka'", 'Logistyka label')
  assertIncludes(explorerData, "label: 'Realizacja'", 'Realizacja label')
  assertIncludes(explorerData, "label: 'Studio'", 'Studio label')
  assertIncludes(explorerData, "DEFAULT_WORKFLOW_FEATURE: WorkflowFeatureKey = 'contract'", 'default Umowa')
  {
    const orderMatch = explorerData.match(
      /WORKFLOW_FEATURE_ORDER[^=]*=\s*\[([\s\S]*?)\]\s*as const/,
    )
    assert(Boolean(orderMatch), 'feature order array present')
    const order = orderMatch![1]
      .split(',')
      .map((s) => s.replace(/['"\s]/g, ''))
      .filter(Boolean)
    assertEq(order.length, 9, 'exactly 9 workflow features')
    assertEq(
      order.join(','),
      'contract,payments,questionnaires,day-plan,tasks,calendar,logistics,execution,studio',
      'exact feature order',
    )
  }
  assertIncludes(
    explorerData,
    'Umowa gotowa w kilka sekund.',
    'Umowa headline copy',
  )
  assertIncludes(
    read('src/features/landing-v2/lifecycle-story/workflow/WorkflowFeatureVisuals.tsx'),
    'Wygeneruj umowę',
    'contract visual action',
  )
  assertNotIncludes(
    read('src/features/landing-v2/lifecycle-story/workflow/WorkflowFeatureVisuals.tsx'),
    'HeroPhoneFrame',
    'no phone device in workflow visuals',
  )
  assertNotIncludes(
    read('src/features/landing-v2/lifecycle-story/workflow/WorkflowFeatureVisuals.tsx'),
    'HeroTabletFrame',
    'no tablet device in workflow visuals',
  )

  assertIncludes(productStory, 'lifecycleExitMv', 'Product exit unchanged hook')
  assertNotIncludes(handoffClock, 'lifecycle', 'Scene 07 handoff independent')
  assertIncludes(heroTablet, 'data-testid="lv2-hero-tablet"', 'Hero tablet unchanged marker')
  assertIncludes(problem, 'data-testid="lv2-problem-story"', 'Problem Story unchanged marker')
  assertIncludes(
    read('src/features/landing-v2/product-story/ProductStoryWorkspace.tsx'),
    'Przegląd',
    'Product overview tab untouched',
  )
  assertIncludes(
    read('src/features/landing-v2/product-story/ProductStoryWorkspace.tsx'),
    'Logistyka',
    'Product logistics tab untouched',
  )

  assert(
    !exists('src/features/landing-v2/lifecycle-story/LifecycleQuestionnaire.tsx'),
    'rejected questionnaire component removed',
  )
  assert(
    !exists('src/features/landing-v2/lifecycle-story/LifecyclePhone.tsx'),
    'rejected small phone component removed',
  )

  console.log('PASS  lifecycle story chapter')
}

/* —— Features grid —— */
{
  const features = read(
    'src/features/landing-v2/features-grid/LandingV2FeaturesGrid.tsx',
  )
  const featuresCss = read(
    'src/features/landing-v2/features-grid/LandingV2FeaturesGrid.module.css',
  )
  const featuresData = read(
    'src/features/landing-v2/features-grid/featuresData.ts',
  )
  const mini = read(
    'src/features/landing-v2/features-grid/FeatureMiniUis.tsx',
  )

  assertIncludes(features, 'data-testid="lv2-features-grid"', 'features section test id')
  assertIncludes(features, 'data-feature=', 'addressable feature cards')
  assertIncludes(features, 'FEATURE_CARDS', 'feature catalog')
  assertIncludes(features, 'useScroll', 'scroll-linked reveal')
  assertIncludes(features, 'useTransform', 'progressive transform entrance')
  assertIncludes(features, 'Kilka funkcji, które ułatwią Ci pracę', 'features heading')
  assertIncludes(
    features,
    'Wszystko, czego potrzebujesz do prowadzenia zleceń — w jednym miejscu.',
    'features lead',
  )
  assertIncludes(
    features,
    "offset: ['start 0.6', 'start 0.4']",
    'grid module reveal offset frozen',
  )
  assertIncludes(
    features,
    "offset: ['start 0.92', 'start 0.5']",
    'headline reveal starts earlier than grid (handoff continuity)',
  )
  assertIncludes(features, 'headerReveal', 'headline uses separate earlier reveal clock')
  assertIncludes(features, 'headingOp = useTransform(headerReveal', 'heading opacity from header clock')
  assertIncludes(features, 'reveal={reveal}', 'atlas modules still use grid reveal clock')
  assertIncludes(
    features,
    '[0.1, 0.36]',
    'first module window unchanged',
  )
  assertIncludes(
    features,
    '[0.26, 0.52]',
    'last module window unchanged',
  )
  assertIncludes(
    featuresCss,
    '--fg-chapter-pad-top: clamp(1.25rem, 2.5vw, 2.25rem)',
    'restrained inter-section top pad after explorer',
  )
  assertNotIncludes(
    featuresCss,
    '--fg-chapter-pad-top: clamp(2.5rem, 4vw, 4rem)',
    'previous oversized chapter pad removed',
  )
  assertNotIncludes(
    features,
    'Kilka rzeczy, które zdejmą Ci z głowy',
    'old awkward heading removed',
  )
  assertNotIncludes(features, 'useSectionReveal', 'no binary section reveal toggle')
  assertNotIncludes(featuresCss, '--fg-overlap', 'no sticky underlap after morph-only lifecycle')
  assertNotIncludes(featuresCss, '--fg-available', 'no viewport-height chapter compression')
  assertNotIncludes(featuresCss, 'grid-template-rows: repeat(4, minmax(0, 1fr))', 'no fr row viewport fit')
  assertIncludes(featuresCss, 'grid-auto-rows: auto', 'content-driven atlas rows')
  assertIncludes(featuresCss, 'min-height: 320px', 'protected module minimum height')
  assertIncludes(featuresCss, 'margin-top: 0', 'features follow lifecycle in normal document flow')
  assertIncludes(featuresCss, 'calc(100vw - 72px)', 'substantial atlas container width')
  assert(
    !/\.module\[data-feature='[^']+'\]:hover\s*\{[^}]*scale\(/.test(featuresCss),
    'no outer module scale hover on module selector itself',
  )
  assertNotIncludes(featuresCss, 'scale(1.0', 'no scale-up hover')
  // FEATURE HOVER MUST NEVER CHANGE OUTER MODULE GEOMETRY — Powiadomienia guard (Phase 4C.3)
  assertIncludes(featuresCss, 'inboxInstrument', 'notification geometry-locked viewport')
  assertIncludes(featuresCss, 'position: absolute', 'internal hover stack out of document flow')
  assertIncludes(featuresCss, 'box-sizing: border-box', 'notification rows include padding in track sizing')
  assertIncludes(featuresCss, 'repeat(3, minmax(0, 1fr))', 'three-row feed reserved at rest')
  assertIncludes(featuresCss, 'inboxItem > div', 'Safari min-height guard on notification body')
  assertIncludes(featuresCss, 'inboxFeed', 'notification inbox panel')
  assertIncludes(featuresCss, 'inboxItemEnter', 'incoming notification row')
  assertNotIncludes(
    featuresCss,
    'grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0fr)',
    'no hover-driven third-row height expansion',
  )
  assertIncludes(featuresData, 'Przypomnienia o bieżących sprawach', 'powiadomienia copy')
  assertIncludes(mini, '2 nowe', 'powiadomienia rest counter')
  assertIncludes(mini, '3 nowe', 'powiadomienia hover counter')
  assertIncludes(mini, 'Julia i Maksymilian', 'incoming umowa notification')
  assertIncludes(mini, '27.08.2027', 'powiadomienia dated timestamp')
  assertIncludes(mini, '28.08.2027', 'incoming umowa date')
  assertNotIncludes(mini, 'inboxDotFresh', 'no green freshness dot')
  assertIncludes(featuresCss, 'financeLedger', 'season finance ledger')
  assertIncludes(featuresCss, 'financeChart', 'season finance chart hover')
  assertIncludes(featuresCss, 'objSurface', 'dominant nested product surface')
  assertIncludes(featuresCss, ':focus-within', 'keyboard focus-within instrument states')
  assertIncludes(mini, 'Gotowa do wygenerowania', 'umowy rest status')
  assertIncludes(mini, 'Umowa wygenerowana', 'umowy hover status')
  assertIncludes(mini, 'umowyVar5', 'umowy miejsce source field')
  assertIncludes(mini, 'umowyVar6', 'umowy zaliczka source field')
  assertIncludes(mini, 'Warszawa', 'umowy miejsce value')
  assertIncludes(mini, '2 500 zł', 'umowy zaliczka value')
  assertIncludes(mini, 'umowyDocPage', 'umowy document page skeleton')
  assertIncludes(mini, 'umowyDocHeading', 'umowy document title')
  assertIncludes(mini, 'umowyDocSign', 'umowy signature area')
  assertIncludes(featuresCss, 'umowyResolved', 'umowy line resolution layer')
  assertIncludes(featuresCss, 'umowyVar6', 'six source variables on hover')
  assertNotIncludes(mini, 'umowyDocSkeleton', 'legacy two-line skeleton removed')
  assertNotIncludes(mini, 'umowyDocBody', 'legacy document body overlay removed')
  assertNotIncludes(mini, 'umowyMeta', 'no secondary umowy metadata row')
  assertNotIncludes(mini, 'Następne', 'no umowy następne block')
  assertIncludes(mini, 'Wyślij ankietę przedślubną', 'sluby hover next step')
  assertIncludes(mini, '12 / 14', 'ankiety rest progress')
  assertIncludes(mini, 'data-mini="pakiety"', 'pakiety mini UI')
  assertIncludes(mini, 'Podstawowy', 'podstawowy package')
  assertIncludes(mini, 'Standard', 'standard package')
  assertIncludes(mini, 'Premium', 'premium package')
  assertIncludes(mini, '7 900 zł', 'podstawowy price')
  assertIncludes(mini, '10 900 zł', 'standard price')
  assertIncludes(mini, '14 900 zł', 'premium price')
  assertIncludes(mini, '250 zdjęć', 'podstawowy detail')
  assertIncludes(mini, '500 zdjęć', 'standard detail')
  assertIncludes(mini, '600 zdjęć', 'premium detail')
  assertIncludes(mini, 'Film 15 minut', 'premium film detail')
  assertIncludes(mini, 'Sesja w dniu ślubu', 'podstawowy session detail')
  assertIncludes(mini, 'Sesja w innym dniu', 'standard/premium session detail')
  assertIncludes(mini, 'pkgDetailLine', 'package detail rows')
  assertIncludes(mini, 'pkgDetailR1', 'package detail row 1')
  assertIncludes(featuresCss, 'pkgInstrument', 'pakiety geometry-locked instrument')
  assertNotIncludes(mini, 'pkgRowSelected', 'no selected package row')
  assertNotIncludes(mini, 'pkgSelectMark', 'no selection mark')
  assertNotIncludes(mini, 'pkgExtrasPanel', 'no extras panel')
  assertNotIncludes(mini, '12 300 zł', 'no animated price')
  assertNotIncludes(mini, 'Film ślubny · Teaser', 'no rest package descriptions')
  assertNotIncludes(mini, 'Teledysk', 'no teledysk extra in pakiety')
  const pakietyMini = mini.slice(mini.indexOf('export function AtlasPakiety'), mini.indexOf('export function AtlasSluby'))
  assertNotIncludes(pakietyMini, 'Essential', 'old essential name removed from pakiety')
  assertNotIncludes(pakietyMini, 'Signature', 'old signature name removed from pakiety')
  assertNotIncludes(pakietyMini, 'pkgRowSelected', 'no selected package in pakiety component')
  assertIncludes(mini, 'data-mini="kalendarz"', 'kalendarz mini UI')
  assertIncludes(mini, 'Sierpień 2027', 'august month rest')
  assertIncludes(mini, '09–15 sierpnia', 'august week range rest')
  assertIncludes(mini, 'Wrzesień 2027', 'september month hover layer')
  assertIncludes(mini, '13–19 września', 'september week range hover layer')
  assertIncludes(mini, 'calHeadAug', 'august heading layer')
  assertIncludes(mini, 'calHeadSep', 'september heading layer')
  assertIncludes(mini, 'calEventAug', 'august event layer')
  assertIncludes(mini, 'calEventSep', 'september event layer')
  assertIncludes(mini, 'Anna i Michał', 'august spotkanie couple')
  assertIncludes(mini, 'Sesja narzeczeńska', 'september engagement session')
  assertIncludes(mini, 'Poznań', 'september wedding location')
  assertIncludes(featuresCss, 'calHeadSlot', 'calendar heading slot')
  assertIncludes(featuresCss, 'calDayNumSlot', 'calendar day number slot')
  assertIncludes(featuresCss, 'calEventSlot', 'calendar event slot')
  assertNotIncludes(mini, 'calConflictLine', 'no conflict footer')
  assertNotIncludes(mini, 'Brak konfliktów', 'no conflict copy')
  assertNotIncludes(mini, 'calEventDrop', 'no drop-in event hover')
  assertIncludes(
    featuresData,
    'Śluby i sesje w jednym spokojnym terminarzu.',
    'kalendarz copy',
  )
  assertIncludes(
    featuresData,
    'Sesje i dodatkowe terminy w tym samym systemie.',
    'sesje copy',
  )
  assertIncludes(mini, 'data-mini="sesje"', 'sesje mini UI')
  assertIncludes(mini, 'sesTimeline', 'session timeline instrument')
  assertIncludes(mini, 'sesGoldenHour', 'golden hour region')
  assertIncludes(mini, 'sesSessionRest', 'rest session block')
  assertIncludes(mini, 'sesSessionHover', 'hover session block layer')
  assertIncludes(mini, 'Złota godzina', 'golden hour label')
  assertIncludes(mini, 'Zachód 19:11', 'sunset marker label')
  assertIncludes(mini, 'Park Cytadela — Poznań', 'session location')
  assertNotIncludes(mini, 'Dojazd', 'no travel metadata')
  assertNotIncludes(mini, '18 min', 'no travel duration')
  assertNotIncludes(mini, 'sesNote', 'no status footer')
  assertNotIncludes(mini, 'sesReason', 'no reason copy')
  assertNotIncludes(mini, 'sesNoteLabel', 'no confirmation label')
  assertNotIncludes(mini, 'Godzina zaktualizowana', 'no update confirmation')
  assertNotIncludes(mini, 'Lepsze światło', 'no light reason copy')
  assertNotIncludes(mini, 'sesDayRail', 'legacy day rail removed')
  assertNotIncludes(mini, 'sesDayTrack', 'legacy thick track removed')
  assertIncludes(featuresCss, 'sesTimelineInstrument', 'sesje timeline instrument css')
  assertIncludes(featuresCss, 'translateX(50%)', 'session block proportional slide')
  assertNotIncludes(mini, 'profileReveal', 'no klienci hover reveal')
  assertNotIncludes(mini, 'Aktywne zlecenie', 'no klienci profile copy')
  assertNotIncludes(mini, 'data-mini="klienci"', 'klienci mini UI removed')
  assertIncludes(featuresData, "id: 'finanse'", 'finanse card')
  assertIncludes(
    featuresData,
    'Przychody, wpłaty i pozostałe rozliczenia całego sezonu.',
    'season-level finanse copy',
  )
  assertIncludes(featuresData, 'ATLAS_MODULES', 'atlas module catalog')
  assertIncludes(features, 'ATLAS_MODULES', 'atlas modules mounted')
  assertIncludes(featuresData, "id: 'powiadomienia'", 'powiadomienia card')
  assertIncludes(featuresData, "id: 'zadania'", 'zadania card')
  assertIncludes(featuresData, "id: 'umowy'", 'umowy card')
  assertIncludes(featuresData, "id: 'pakiety'", 'pakiety card')
  assertIncludes(featuresData, 'Ustal pakiety i wykorzystaj w zleceniach', 'pakiety copy')
  assertNotIncludes(featuresData, "id: 'klienci'", 'klienci card removed')
  assertIncludes(featuresData, "id: 'sluby'", 'sluby card')
  assertIncludes(featuresData, "id: 'sesje'", 'sesje card')
  assertIncludes(featuresData, "id: 'kalendarz'", 'kalendarz card')
  assertIncludes(featuresData, "id: 'ankiety'", 'ankiety card')
  assertEq(
    (featuresData.match(/id: '/g) || []).length,
    9,
    'exactly nine feature cards',
  )
  assertIncludes(mini, 'data-mini="finanse"', 'finanse mini UI')
  assertIncludes(mini, 'Sezon 2027', 'season label')
  assertIncludes(mini, 'financeLedger', 'finance ledger object')
  assertIncludes(mini, 'Zadatek', 'ledger payment kind')
  assertIncludes(mini, 'financeChart', 'finance season chart')
  assertNotIncludes(mini, 'financeBarVal', 'no bar amount labels')
  assertNotIncludes(mini, 'financeFootHover', 'no hover finance footer')
  assertNotIncludes(mini, '16.2k', 'no bar value labels')
  assertNotIncludes(mini, 'finLedger', 'legacy finance ledger removed')
  assertIncludes(mini, 'data-mini="ankiety"', 'ankiety mini UI')
  assertIncludes(mini, 'formInstrument', 'ankiety fixed instrument')
  assertIncludes(mini, 'formSecondaryZone', 'ankiety reserved secondary zone')
  assertIncludes(mini, 'formAnswerSlot1', 'left final answer slot')
  assertIncludes(mini, 'formAnswerSlot2', 'right final answer slot')
  assertIncludes(mini, '2 odpowiedzi brakują', 'missing answers rest copy')
  assertIncludes(mini, 'Sesja w dniu ślubu', 'final answer left title')
  assertIncludes(mini, 'Ważne momenty', 'final answer right title')
  assertIncludes(mini, 'Rodzice · pierwszy taniec · podziękowania', 'final answer right value')
  assertNotIncludes(mini, 'formComplete', 'no completion footer block')
  assertNotIncludes(mini, 'Ankieta kompletna', 'no completion headline')
  assertNotIncludes(mini, 'Dane są już w zleceniu', 'no completion message')
  assertNotIncludes(mini, 'formGroupMuted', 'legacy muted cards removed')
  assertNotIncludes(mini, 'formLineResolve', 'legacy line resolve removed')
  assertIncludes(featuresCss, 'formSecondaryZone', 'ankiety secondary zone css')
  assertIncludes(featuresCss, 'formAnswerSlot', 'ankiety answer slot css')
  assertNotIncludes(
    featuresCss,
    ".module[data-feature='ankiety']:hover .formResolve",
    'no hover max-height resolve expansion',
  )
  assertNotIncludes(mini, '8 400', 'no single-wedding remain amount')
  assertNotIncludes(mini, '.png', 'no raster images in mini UIs')
  assertNotIncludes(mini, '<img', 'no img tags in mini UIs')
  assertNotIncludes(featuresCss, 'heart', 'no wedding cliché heart styling')
  assertIncludes(featuresCss, 'grid-template-columns: repeat(12', 'desktop 12-column atlas')
  assertIncludes(featuresCss, 'prefers-reduced-motion', 'reduced motion hover disable')
  assertIncludes(featuresCss, ".module[data-feature='finanse']:hover", 'finanse hover micro')
  assertIncludes(featuresCss, ".module[data-feature='ankiety']:hover", 'ankiety hover micro')
  assertIncludes(featuresCss, "grid-column: span 7", 'asymmetric atlas spans')
  assertNotIncludes(features, 'setInterval', 'no timer animation loops')
  assertNotIncludes(features, 'requestAnimationFrame', 'no rAF loops in features')
  assertNotIncludes(features, 'useState', 'no React hover state')
  assertNotIncludes(mini, 'useState', 'no React state in mini UIs')
  assertIncludes(mini, '4 zadania', 'zadania rest task count header')
  assertNotIncludes(mini, 'Następne', 'no zadania następne block copy')
  assertNotIncludes(mini, 'taskNextPanel', 'no zadania następne panel markup')
  assertNotIncludes(mini, '3 pozostałe', 'no zadania hover count swap')
  assertNotIncludes(mini, 'taskTarget', 'no legacy zadania target row')
  assertNotIncludes(mini, 'taskCircle', 'no legacy zadania circle markup')
  assertIncludes(mini, 'taskMark', 'unified zadania checkbox mark')
  assertIncludes(featuresCss, 'taskMarkIcon path', 'zadania checkmark stroke target')
  assertIncludes(featuresCss, 'stroke-dashoffset', 'zadania checkmark stroke animation')
  assertIncludes(
    featuresCss,
    ".module[data-feature='zadania']:hover .taskStack li:nth-child(2)",
    'staggered zadania task 2 hover completion',
  )
  assertIncludes(
    featuresCss,
    ".module[data-feature='zadania']:hover .taskStack li:nth-child(4)",
    'staggered zadania task 4 hover completion',
  )
  assertNotIncludes(featuresCss, 'line-through', 'no zadania strikethrough styling')

  /* —— Mobile Features flow (compact) —— */
  assertIncludes(features, 'useLandingCompactViewport', 'Features uses shared compact viewport hook')
  assertIncludes(
    features,
    "data-features-layout={isCompactViewport ? 'compact' : 'desktop'}",
    'explicit compact/desktop layout marker',
  )
  assertIncludes(features, 'whileInView', 'compact cards use local viewport reveal')
  assertIncludes(
    features,
    "data-feature-reveal={compactMotion ? 'viewport' : 'atlas'}",
    'compact reveal is viewport-local; desktop keeps atlas clock',
  )
  assertIncludes(features, 'data-features-intro-motion="dom"', 'compact intro uses plain DOM opacity bind')
  assertIncludes(features, 'compactHeadingRef', 'compact heading DOM ref')
  assertIncludes(
    features,
    'headingTravel = isCompactViewport ? 0 : 28',
    'compact heading uses opacity-only (no y travel / soft GPU text)',
  )
  assertIncludes(
    features,
    'leadTravel = isCompactViewport ? 0 : 22',
    'compact lead uses opacity-only',
  )
  assertIncludes(features, 'HEADER_OFFSET_COMPACT', 'compact header reveal starts earlier')
  assertIncludes(features, "['start 1.12', 'start 0.72']", 'compact intro offset earlier than desktop')
  assertIncludes(features, "{ filter: 'none' }", 'compact cards force filter none (no atlas blur residue)')
  assertIncludes(
    features,
    "whileInView={compactMotion ? { opacity: 1, y: 0, filter: 'none' } : undefined}",
    'compact whileInView resolves without blur',
  )
  assertIncludes(
    features,
    'compactMotion = compact && !reduced',
    'card entrance motion gated off under reduced motion',
  )
  assertIncludes(
    features,
    'viewport={',
    'IntersectionObserver-backed whileInView viewport config',
  )
  assertNotIncludes(features, 'position: sticky', 'no sticky Features heading in TSX')
  assert(
    !/\.header\s*\{[^}]*position:\s*sticky/.test(featuresCss),
    'Features header is not sticky',
  )
  assertIncludes(
    featuresCss,
    'grid-template-columns: repeat(2, minmax(0, 1fr))',
    'tablet keeps intentional 2-column board',
  )
  assertIncludes(
    featuresCss,
    '@media (max-width: 640px)',
    'phone single-column Features breakpoint',
  )
  assertIncludes(
    featuresCss,
    'grid-template-columns: minmax(0, 1fr)',
    'phone Features is single-column stack',
  )
  assertIncludes(
    featuresCss,
    'calc(100vw - 1.75rem)',
    'phone near-full-width cards with ~28px gutters',
  )
  assertIncludes(featuresCss, '--fg-atlas-gap: 1rem', 'shared phone card stack rhythm')
  assertIncludes(
    featuresCss,
    "section[data-features-layout='compact'] .module",
    'compact module CSS clears inherited/residue blur',
  )
  assertIncludes(featuresCss, 'filter: none !important', 'compact cards resolve to no blur')
  assertIncludes(
    features,
    "filter: 'none'",
    'compact intro/cards force filter none (not blur(0px))',
  )
  assertIncludes(features, 'data-features-heading=', 'features heading marker')
  assertIncludes(features, 'data-feature-hover-surface="module"', 'whole module is hover ownership surface')
  assertIncludes(
    featuresCss,
    'pointer-events: none',
    'decorative moduleScene does not steal card hover',
  )
  assertIncludes(
    featuresCss,
    '@media (hover: hover) and (pointer: fine)',
    'hover gated by pointer capability not compact width',
  )
  assertIncludes(
    featuresCss,
    "module[data-feature-hover-surface='module']:hover",
    'explicit module hover-surface selector',
  )
  assert(
    !/@media \(max-width: 1100px\)[\s\S]{0,400}hover:\s*none/.test(
      featuresCss.replace(/\/\*[\s\S]*?\*\//g, ''),
    ),
    'compact width must not disable hover media',
  )
  assertIncludes(featuresCss, 'min-height: 360px', 'Pakiety dedicated compact height token present')
  assertIncludes(featuresCss, 'min-height: 380px', 'Kalendarz dedicated compact height token present')
  {
    const phoneStart = featuresCss.indexOf('@media (max-width: 640px)')
    const phoneEnd = featuresCss.indexOf('@media (prefers-reduced-motion: reduce)', phoneStart)
    const phoneBlock = featuresCss.slice(phoneStart, phoneEnd > phoneStart ? phoneEnd : phoneStart + 1)
    assert(phoneBlock.includes('.calWeek'), 'phone block targets calWeek')
    assert(
      /overflow(?:-x|-y)?:\s*hidden/.test(phoneBlock),
      'Kalendarz compact week preview has no internal scroll (overflow hidden)',
    )
    assert(
      !/\.calWeek\s*\{[^}]*overflow-x:\s*auto/.test(phoneBlock),
      'Kalendarz compact does not keep overflow-x auto',
    )
    assert(
      phoneBlock.includes(".module[data-feature='pakiety']") &&
        phoneBlock.includes('min-height: 360px'),
      'Pakiety taller height is phone-scoped only',
    )
  }
  {
    const phoneStart = featuresCss.indexOf('@media (max-width: 640px)')
    const phoneEnd = featuresCss.indexOf('@media (prefers-reduced-motion: reduce)', phoneStart)
    const phoneBlock = featuresCss.slice(phoneStart, phoneEnd > phoneStart ? phoneEnd : phoneStart + 1)
    assert(phoneBlock.includes('grid-template-columns: minmax(0, 1fr)'), 'phone block is single-column')
    assert(
      !/\.module[^{]*\{[^}]*opacity:\s*0/.test(phoneBlock),
      'no compact CSS rule hides modules at opacity 0 forever',
    )
    const tabletStart = featuresCss.indexOf('@media (max-width: 1100px)')
    const tabletEnd = featuresCss.indexOf('@media (max-width: 640px)', tabletStart)
    const tabletBlock = featuresCss.slice(
      tabletStart,
      tabletEnd > tabletStart ? tabletEnd : tabletStart + 1,
    )
    assert(
      !/\.module[^{]*\{[^}]*opacity:\s*0/.test(tabletBlock),
      'no tablet CSS rule hides modules at opacity 0 forever',
    )
  }
  assertIncludes(featuresCss, 'grid-template-columns: repeat(12', 'desktop asymmetric atlas preserved')
  assertIncludes(featuresCss, "grid-column: span 7", 'desktop asymmetric spans preserved')
  assertIncludes(features, "offset: ['start 0.6', 'start 0.4']", 'desktop module clock frozen')
  assertIncludes(features, "offset: ['start 0.92', 'start 0.5']", 'desktop header clock frozen')
  /* Canonical mobile order = ATLAS_MODULES order */
  {
    const order = [
      'finanse',
      'powiadomienia',
      'zadania',
      'umowy',
      'pakiety',
      'sluby',
      'kalendarz',
      'sesje',
      'ankiety',
    ]
    let cursor = 0
    for (const id of order) {
      const next = featuresData.indexOf(`id: '${id}'`, cursor)
      assert(next > cursor - 1 && next >= 0, `atlas order includes ${id}`)
      cursor = next + 1
    }
  }
  assertIncludes(features, 'MODULES.map', 'all atlas modules rendered in catalog order')
  assertNotIncludes(features, 'swiper', 'no carousel')
  assertNotIncludes(features, 'embla', 'no swipe carousel lib')
  assertNotIncludes(featuresCss, 'masonry', 'no masonry on Features')

  console.log('PASS  features grid')
}

function testMobileStory() {
  const page = read('src/features/landing-v2/LandingV2Page.tsx')
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const mobileCss = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  const mobileProgress = read('src/features/landing-v2/mobile-story/mobileStoryProgress.ts')
  const exitShell = read('src/features/landing-v2/mobile-story/FeaturesExitShell.tsx')
  const phone = read('src/features/landing-v2/mobile-story/device/HeroPhoneFrame.tsx')
  const phoneCss = read('src/features/landing-v2/mobile-story/device/HeroPhoneFrame.module.css')
  const lifecycle = read('src/features/landing-v2/lifecycle-story/LandingV2LifecycleStory.tsx')
  const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
  const features = read('src/features/landing-v2/features-grid/LandingV2FeaturesGrid.tsx')

  assertIncludes(page, 'FeaturesExitShell', 'features exit shell mounted')
  assertIncludes(page, 'LandingV2MobileStory', 'mobile story mounted')
  assert(
    page.indexOf('<LandingV2FeaturesGrid />') < page.indexOf('<LandingV2MobileStory />') &&
      page.indexOf('<LandingV2MobileStory />') < page.indexOf('<LandingV2SecurityHistoryStory />') &&
      page.indexOf('id="jak-dziala"') < page.indexOf('<LandingV2MobileStory />'),
    'jak-dziala features before mobile; security-history after mobile',
  )

  assertNotIncludes(lifecycle, 'LandingV2MobileStory', 'lifecycle unchanged by mobile story')
  assertNotIncludes(hero, 'LandingV2MobileStory', 'hero unchanged by mobile story')
  assertNotIncludes(features, 'mobileStory', 'features grid internals unchanged')
  assertNotIncludes(features, 'FeaturesExitShell', 'features grid file unchanged')

  assertIncludes(mobile, 'useMotionValue', 'mobile scroll MotionValue')
  assertIncludes(mobile, 'useTransform', 'mobile compositor transforms')
  assertIncludes(mobile, 'publishMobileStoryProgress', 'mobile progress clock')
  assertIncludes(mobile, 'requestAnimationFrame', 'scroll-linked rAF measurement')
  assertNotIncludes(mobile, 'setInterval', 'no timer loops')
  assertIncludes(mobile, 'Wszystko zostaje z Tobą.', 'mobile headline line 1')
  assertIncludes(mobile, 'Gdziekolwiek pracujesz.', 'mobile headline line 2')
  assertIncludes(mobile, 'data-mobile-device-settled', 'settled phone QA marker')
  assertIncludes(mobile, 'HeroPhoneFrame', 'css phone frame')
  assertIncludes(mobile, 'MobileOurWedApp', 'in-phone OurWed app prototype')
  assertNotIncludes(mobile, '@supabase', 'mobile story no supabase')

  const exitShellCss = read('src/features/landing-v2/mobile-story/FeaturesExitShell.module.css')
  assertIncludes(exitShell, 'featuresOpacityAt', 'keyframed features exit opacity')
  assertIncludes(exitShell, 'mobileStoryProgressMv', 'features exit reads mobile clock')
  assertIncludes(exitShell, 'useTransform', 'features exit compositor transforms')
  assertIncludes(exitShell, 'motionLayer', 'features motion on inner content layer')
  assertIncludes(exitShell, 'useLandingCompactViewport', 'exit shell knows compact viewport')
  assertIncludes(
    exitShell,
    'bypassExitRef.current ? 1 : featuresOpacityAt(p)',
    'compact/PRM bypass keeps Features visible when Mobile Story parks progress at 1',
  )
  assertIncludes(exitShell, 'data-features-exit-bypass=', 'explicit exit-bypass marker')
  assertIncludes(exitShell, 'motionLayerStatic', 'compact uses static layer without filter MotionValues')
  assertIncludes(exitShell, "data-features-exit-layer=\"static\"", 'static exit layer marker')
  assertIncludes(
    exitShellCss,
    "shell[data-features-exit-bypass='true']",
    'compact Features pulls under Lifecycle sticky for handoff',
  )
  assertIncludes(exitShellCss, '--fg-handoff-overlap', 'documented compact handoff overlap token')
  assertIncludes(exitShellCss, 'motionLayerStatic', 'static layer CSS clears filter')
  assertNotIncludes(exitShell, 'useState', 'no React state in features exit shell')
  assertIncludes(exitShellCss, 'background: transparent', 'features exit shell transparent')
  assertIncludes(exitShellCss, 'motionLayer', 'inner motion layer')
  assertIncludes(exitShellCss, 'z-index: 4', 'features below lifecycle, above mobile underlay')
  assertEq(MOBILE_RANGES.headlineSep.start, 0.34, 'mobile headline sep start frozen')
  assertEq(MOBILE_RANGES.phoneIn.start, 0.42, 'mobile phone in start frozen')
  assertEq(MOBILE_RANGES.phoneHold.start, 0.74, 'mobile phone hold start frozen')

  assertIncludes(mobileCss, '--mobile-track-pre-svh', 'dynamic pre track budget')
  assertIncludes(mobileCss, '--mobile-track-dash-svh', 'dynamic dash track budget')
  assertIncludes(mobileCss, '--mobile-track-post-svh', 'dynamic post track budget')
  assertNotIncludes(mobileCss, '700svh', 'no hardcoded 700svh track')
  assertIncludes(mobileCss, '-0.78', 'stronger features overlap')
  assertIncludes(mobileCss, 'stageCenter', 'shared stage center wrapper')
  assertIncludes(mobileCss, 'white-space: nowrap', 'headline lines do not wrap on desktop')
  assertNotIncludes(mobileCss, 'max-width: 16ch', 'no narrow headline constraint')
  assertNotIncludes(mobileCss, 'grid-template-rows: repeat(4', 'no viewport atlas fit')
  assertIncludes(mobileCss, 'prefers-reduced-motion', 'reduced motion static fallback')
  assertIncludes(mobile, 'data-mobile-stage-center', 'stage center QA marker')
  assertIncludes(mobile, 'data-mobile-headline', 'headline QA marker')
  assertIncludes(mobile, 'data-mobile-phone', 'phone QA marker')
  assertIncludes(mobile, 'data-mobile-theater="static"', 'static fallback marker')

  assertIncludes(mobileProgress, 'featuresOpacityAt', 'keyframed features opacity')
  assertIncludes(mobileProgress, 'headlineCompositeOpacityAt', 'composite headline opacity')
  assertIncludes(mobileProgress, 'headlineExitBlurPxAt', 'headline exit blur')
  assertIncludes(mobileProgress, 'isHandoffDeadZone', 'dead zone guard helper')
  assertIncludes(mobileProgress, 'featuresExit', 'features exit range')
  assertIncludes(mobileProgress, 'headlineIn', 'headline entrance range')
  assertIncludes(mobileProgress, 'headlineHold', 'headline hold range')
  assertIncludes(mobileProgress, 'headlineSep', 'headline separation range')
  assertIncludes(mobileProgress, 'headlineExit', 'headline exit range')
  assertIncludes(mobileProgress, 'phoneIn', 'phone entrance range')
  assertIncludes(mobileProgress, 'phoneHold', 'phone hold range')
  assertIncludes(mobileCss, 'background: transparent', 'mobile sticky stage transparent')
  assertNotIncludes(mobileCss, 'overflow: hidden', 'no sticky clipping boundary')

  const appData = read('src/features/landing-v2/mobile-story/app/data/mobileOurWedDemoData.ts')
  const appProgress = read('src/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress.ts')
  const appShell = read('src/features/landing-v2/mobile-story/app/MobileOurWedApp.tsx')
  assertIncludes(appData, 'juliaMaksymilian', 'app demo derives from V2 SoT')
  assertIncludes(appData, 'HERO_MODERN_DEMO', 'app demo reuses hero Marta dashboard fiction')
  assertIncludes(appData, 'ownerFirstName', 'Marta via studio owner')
  assertIncludes(appData, 'Dostępny offline', 'offline brief status')
  assertIncludes(appData, 'Nawiguj', 'nawiguj CTA')
  assertIncludes(appData, 'reception.place', 'reception place from SoT')
  assertNotIncludes(appData, 'Julia i Adrian', 'no V3 Adrian fiction')
  assertNotIncludes(appData, '@supabase', 'app demo data no supabase')
  assertIncludes(appData, 'coupleName: w.coupleName', 'couple from SoT wedding')
  assertIncludes(read('src/features/landing-v2/narrative/juliaMaksymilian.ts'), "coupleName: 'Julia i Maksymilian'", 'SoT couple identity')
  assertIncludes(read('src/features/landing-v2/narrative/juliaMaksymilian.ts'), "ownerFirstName: 'Marta'", 'SoT Marta identity')
  assertIncludes(appProgress, 'dashScroll', 'dashboard internal scroll range')
  assertIncludes(appProgress, 'dashEndHold', 'dashboard end hold after measured max scroll')
  assertIncludes(appProgress, 'handoff', 'dashboard↔wedding-day overlapping handoff')
  assertNotIncludes(appProgress, 'DASH_SCROLL_PX', 'no hardcoded dashboard scroll px')
  assertIncludes(appProgress, 'dashScrollYAt', 'dashboard Y helper')
  assertIncludes(appProgress, 'return -t * max', 'linear dash Y (no easeOut on content)')
  assertEq(MOBILE_APP_RANGES.dashBreath.end, 0.03, 'breath before dash scroll')
  assertEq(MOBILE_APP_RANGES.dashScroll.start, 0.03, 'dash scroll starts after breath')
  assertEq(MOBILE_APP_RANGES.dashScroll.end, 0.52, 'dash scroll ends before end-hold')
  assertEq(MOBILE_APP_RANGES.dashEndHold.start, 0.52, 'end-hold starts at scroll end')
  assertEq(MOBILE_APP_RANGES.dashEndHold.end, 0.56, 'end-hold meets handoff')
  assertEq(MOBILE_APP_RANGES.handoff.start, 0.56, 'handoff after end-hold')
  assertEq(MOBILE_APP_RANGES.handoff.end, 0.66, 'handoff completes before day hold')
  assertEq(DASHBOARD_BOTTOM_INSET_PX, 20, 'canonical dashboard bottom inset')
  assertEq(MOBILE_TRACK_PRE_SVH, 260, 'pre track preserves Features→phone settle')
  assertEq(MOBILE_TRACK_POST_SVH, 220, 'post track for Wedding Day→Brief tightened')
  assert(MOBILE_TRACK_DASH_SVH_FALLBACK >= 100, 'dash track fallback before measure')
  assertIncludes(appProgress, 'routeTravel', 'route travel range')
  assertIncludes(appProgress, 'navMapReadableAppProgress', 'readable-map progress helper')
  assertIncludes(appProgress, 'dayEndHold', 'short day end hold before nav')
  assertIncludes(appProgress, 'navRest', 'short nav rest before travel')
  assert(NAV_STORY_OUTER_PX >= 800, 'nav outer budget keeps travel luxurious')
  assertEq(MOBILE_APP_RANGES.mapIn.start, MOBILE_APP_RANGES.dayEndHold.end, 'mapIn starts after day end hold')
  assert(
    MOBILE_APP_RANGES.mapIn.end - MOBILE_APP_RANGES.mapIn.start <= 0.025,
    'mapIn crossfade compressed',
  )
  assert(
    MOBILE_APP_RANGES.routeTravel.end - MOBILE_APP_RANGES.routeTravel.start >= 0.08,
    'route travel keeps luxurious local range',
  )
  assertEq(NAV_PATH_END, 1, 'marker ends at destination path end')
  {
    const enterPx = NAV_ENTER_OUTER_PX
    assert(enterPx <= 180, `nav enter budget ${enterPx} <= 180`)
    assert(DAY_END_HOLD_OUTER_PX <= 100, `day end hold ${DAY_END_HOLD_OUTER_PX} <= 100`)
    assert(NAV_REST_OUTER_PX <= 70, `nav rest ${NAV_REST_OUTER_PX} <= 70`)
    assert(NAV_TRAVEL_OUTER_PX >= 580, `nav travel ${NAV_TRAVEL_OUTER_PX} >= 580`)
  }
  assertIncludes(appProgress, 'briefEnter', 'brief enter after nav arrival')
  assertIncludes(appProgress, 'BRIEF_SETTLE_OUTER_PX', 'brief settle hold constant')
  assertIncludes(appProgress, 'NO Brief-internal scroll', '6H no brief document scroll')
  assertIncludes(appProgress, 'NO Wedding Day return after Navigation', '6G no day return documented')
  assertEq(MOBILE_APP_RANGES.arriveHold.end, MOBILE_APP_RANGES.briefEnter.start, 'brief follows arrival')
  assertEq(MOBILE_APP_RANGES.briefScroll.start, MOBILE_APP_RANGES.briefScroll.end, 'briefScroll zero-length')
  assertEq(MOBILE_APP_RANGES.dayScrollPost.start, MOBILE_APP_RANGES.dayScrollPost.end, 'dayScrollPost zero-length')
  assert(NAV_ARRIVAL_OUTER_PX >= 60 && NAV_ARRIVAL_OUTER_PX <= 110, 'arrival hold 60–110')
  assert(BRIEF_ENTER_OUTER_PX >= 140 && BRIEF_ENTER_OUTER_PX <= 220, 'brief enter 140–220')
  assertEq(BRIEF_SETTLE_OUTER_PX, 4, 'brief settle 4px (near-instant morph)')
  assertEq(briefScrollYAt(0.99, 400), 0, 'brief Y always 0')
  assertNotIncludes(appProgress, 'if (rem <= holdPad)', 'no pre-day holdPad dead zone')
  assertIncludes(appProgress, 'NO leftover holdPad', 'split documents holdPad removal')
  assertIncludes(appShell, 'MobileDashboardDemo', 'dashboard screen')
  assertIncludes(appShell, 'MobileWeddingDayDemo', 'wedding day screen')
  assertIncludes(appShell, 'MobileNavigationDemo', 'navigation screen')
  assertIncludes(appShell, 'MobileOfflineBriefDemo', 'offline brief screen')
  assertIncludes(appShell, 'dashHandoffYAt', 'dashboard handoff micro-Y')
  assertIncludes(appShell, 'dayHandoffYAt', 'wedding-day handoff micro-Y')
  assertIncludes(appShell, 'data-mobile-app-shell', 'shared mobile app shell')
  assertIncludes(appShell, 'data-mobile-app-topbar', 'mobile app top bar')
  assertIncludes(appShell, 'data-mobile-app-viewport', 'mobile app viewport')
  assertIncludes(appShell, 'MobileCompactAssignmentBar', 'production compact glass bar')
  assertIncludes(appShell, 'data-mobile-shell-header', 'sticky shell header marker')
  assertIncludes(appShell, 'data-mobile-greeting', 'greeting in shell header')
  assertNotIncludes(appShell, 'useWeddingDayCockpitData', 'no production cockpit hook')
  assertNotIncludes(appShell, '@tanstack/react-query', 'no react-query in phone app')

  {
    // Phase 6D unit — linear scroll + overlapping handoff coverage
    const M = 400
    for (const pct of [0.25, 0.5, 0.75] as const) {
      const app =
        MOBILE_APP_RANGES.dashScroll.start +
        pct * (MOBILE_APP_RANGES.dashScroll.end - MOBILE_APP_RANGES.dashScroll.start)
      const y = Math.abs(dashScrollYAt(app, M))
      const expected = pct * M
      assert(
        Math.abs(y - expected) <= M * 0.03,
        `linear dash Y at ${pct * 100}%: got ${y.toFixed(1)} want ~${expected.toFixed(1)}`,
      )
    }
    assert(Math.abs(dashScrollYAt(0, M)) <= 0.01, 'Y=0 before scroll (phone entrance)')
    assert(Math.abs(dashScrollYAt(MOBILE_APP_RANGES.dashBreath.end - 0.001, M)) <= 0.01, 'Y=0 through breath')
    assert(dashOpacityAt(0) >= 0.99, 'dashboard fully opaque during phone entrance')
    assert(dashOpacityAt(MOBILE_APP_RANGES.dashScroll.end) >= 0.99, 'dashboard opaque through scroll')
    assert(dayOpacityAt(MOBILE_APP_RANGES.dashEndHold.end - 0.001) <= 0.02, 'wedding day hidden before handoff')

    for (const sample of [0, 0.25, 0.5, 0.75, 1] as const) {
      const app =
        MOBILE_APP_RANGES.handoff.start +
        sample * (MOBILE_APP_RANGES.handoff.end - MOBILE_APP_RANGES.handoff.start)
      const d = dashOpacityAt(app)
      const day = dayOpacityAt(app)
      assert(
        !(d < 0.1 && day < 0.1),
        `no blank handoff at t=${sample}: dash=${d.toFixed(2)} day=${day.toFixed(2)}`,
      )
      assert(d + day >= 0.95, `handoff coverage at t=${sample}: sum=${(d + day).toFixed(2)}`)
    }
    const midApp = (MOBILE_APP_RANGES.handoff.start + MOBILE_APP_RANGES.handoff.end) / 2
    assert(dashOpacityAt(midApp) >= 0.4 && dashOpacityAt(midApp) <= 0.6, 'mid handoff dash ~0.5')
    assert(dayOpacityAt(midApp) >= 0.4 && dayOpacityAt(midApp) <= 0.7, 'mid handoff day ~0.55')
    assert(Math.abs(dashHandoffYAt(MOBILE_APP_RANGES.handoff.end) + 8) <= 0.5, 'dash handoff Y end -8')
    assert(Math.abs(dayHandoffYAt(MOBILE_APP_RANGES.handoff.end)) <= 0.5, 'day handoff Y end 0')
    assert(handoffLinearT(MOBILE_APP_RANGES.handoff.start) === 0, 'handoff linear start')
    assert(handoffLinearT(MOBILE_APP_RANGES.handoff.end) === 1, 'handoff linear end')
    const outer = dashPhaseOuterPxFromMaxScroll(M)
    assert(outer > M, 'dash phase outer includes breath/hold/handoff beyond content')

    // Phase 6F.3 — Wedding Day full linear scroll before Navigation (same grammar as Dashboard)
    assertEq(DAY_RETURN_FRACTION, 1, 'full day scroll before Navigation (6F.3)')
    assertEq(WEDDING_DAY_BOTTOM_INSET_PX, 16, 'wedding day bottom inset')
    assertNotIncludes(appProgress, 'DAY_SCROLL_PX', 'no hardcoded wedding-day scroll px')
    assertIncludes(appProgress, 'dayScroll', 'wedding day full scroll range')
    assertIncludes(appProgress, 'dayEndHold', 'wedding day end hold')
    assertNotIncludes(appProgress, 'if (rem <= holdPad)', 'no pre-day holdPad dead zone')
    const dayM = 500
    for (const pct of [0.25, 0.5, 0.75] as const) {
      const app =
        MOBILE_APP_RANGES.dayScroll.start +
        pct * (MOBILE_APP_RANGES.dayScroll.end - MOBILE_APP_RANGES.dayScroll.start)
      const y = Math.abs(dayScrollYAt(app, dayM))
      const expected = pct * dayM
      assert(
        Math.abs(y - expected) <= dayM * 0.03,
        `linear day Y at ${pct * 100}%: got ${y.toFixed(1)} want ~${expected.toFixed(1)}`,
      )
    }
    assert(
      Math.abs(dayScrollYAt(MOBILE_APP_RANGES.dayScroll.end, dayM) + dayM) <= 1,
      'day Y at -maxScroll when day scroll completes',
    )
    assert(
      Math.abs(dayScrollYAt(MOBILE_APP_RANGES.mapIn.start, dayM) + dayM) <= 1,
      'day Y held at bottom during navigation',
    )
    assert(
      Math.abs(dayScrollYAt(MOBILE_APP_RANGES.briefOpen.start, dayM) + dayM) <= 1,
      'day Y stays at bottom through brief',
    )
    assertEq(dayReturnScrollPx(dayM), dayM, 'dayReturnScrollPx is full max in 6F.3')

    // Phase 6G — no Wedding Day return; Navigation → Brief directly
    assert(dayOpacityAt(MOBILE_APP_RANGES.arriveHold.start) <= 0.01, 'day hidden at arrival')
    assert(dayOpacityAt(MOBILE_APP_RANGES.briefEnter.start) <= 0.01, 'day hidden at brief enter')
    assert(dayOpacityAt(MOBILE_APP_RANGES.briefEnter.end) <= 0.01, 'day stays hidden through brief')
    assert(mapLayerOpacityAt(MOBILE_APP_RANGES.arriveHold.end) >= 0.99, 'nav fully visible through arrival')
    for (const sample of [0, 0.2, 0.4, 0.6, 0.8, 1] as const) {
      const app =
        MOBILE_APP_RANGES.briefEnter.start +
        sample * (MOBILE_APP_RANGES.briefEnter.end - MOBILE_APP_RANGES.briefEnter.start)
      const nav = mapLayerOpacityAt(app)
      const br = briefOpenAt(app)
      assert(nav + br >= 0.95, `nav→brief coverage t=${sample}: ${(nav + br).toFixed(2)}`)
      assert(dayOpacityAt(app) <= 0.02, `no day flash during brief enter t=${sample}`)
    }

    {
      const budgets = postPhaseBudgetsFromDayMax(dayM)
      assert(budgets.navArrivalOuter >= 60 && budgets.navArrivalOuter <= 110, 'arrival budget')
      assert(budgets.briefEnterOuter >= 140 && budgets.briefEnterOuter <= 220, 'brief enter budget')
      assertEq(budgets.briefScrollOuter, 0, 'no brief scroll budget (6H)')
      assertEq(budgets.briefSettleOuter, 4, 'brief settle budget 4px near-instant')
      assertEq(budgets.dayPostOuter, 0, 'no post-nav day budget')

      const settle = 1000
      const dashSpan = 800
      const dayTopSettle = 8
      const toRouteEnd =
        settle +
        dashSpan +
        dayTopSettle +
        budgets.dayScrollOuter +
        budgets.dayEndHoldOuter +
        budgets.navEnterOuter +
        budgets.navRestOuter +
        budgets.navTravelOuter
      const sample = (outer: number) => {
        const { app } = splitMobileMasterProgress(outer, 20000, settle / 0.74, dashSpan, budgets)
        return {
          app,
          dayOp: dayOpacityAt(app),
          navOp: mapLayerOpacityAt(app),
          briefOp: briefOpenAt(app),
          travel: travelProgressAt(app),
          briefY: briefScrollYAt(app, 400),
        }
      }
      const atArrive = sample(toRouteEnd)
      assert(atArrive.travel >= 0.999, 'unit: travel complete at route end')
      assert(atArrive.navOp >= 0.99, 'unit: nav opaque at route end')
      assert(atArrive.briefOp <= 0.02, 'unit: brief still 0 at route end')
      assert(atArrive.dayOp <= 0.01, 'unit: day not returned at route end')

      const findBrief = (target: number) => {
        for (let d = 0; d <= budgets.navArrivalOuter + budgets.briefEnterOuter + 40; d++) {
          if (sample(toRouteEnd + d).briefOp >= target) return d
        }
        return -1
      }
      const b10 = findBrief(0.1)
      const b50 = findBrief(0.5)
      const b90 = findBrief(0.9)
      assert(b10 >= 0 && b10 <= 100, `unit route→brief0.10 ${b10} <= 100`)
      assert(b50 >= 0 && b50 <= 170, `unit route→brief0.50 ${b50} <= 170`)
      assert(b90 >= 0 && b90 <= 240, `unit route→brief0.90 ${b90} <= 240`)

      const briefTop =
        toRouteEnd + budgets.navArrivalOuter + budgets.briefEnterOuter
      const atTop = sample(briefTop)
      assert(atTop.briefOp >= 0.99, 'unit: brief full at enter end')
      assert(Math.abs(atTop.briefY) <= 0.5, 'unit: brief Y stays 0 (no internal scroll)')
      const midHold = sample(briefTop + budgets.briefSettleOuter * 0.5)
      assert(Math.abs(midHold.briefY) <= 0.5, 'unit: brief Y still 0 during settle')
    }

    // Phase 6F.3 — physical post budgets + no dead scroll after day bottom
    {
      const budgets = postPhaseBudgetsFromDayMax(dayM)
      assertEq(budgets.dayScrollOuter, dayM, 'day scroll outer ≈ measured max')
      assert(budgets.dayEndHoldOuter >= 40 && budgets.dayEndHoldOuter <= 100, 'day end hold 40–100')
      assert(budgets.navEnterOuter >= 120 && budgets.navEnterOuter <= 180, 'nav enter 120–180')
      assert(budgets.navRestOuter >= 30 && budgets.navRestOuter <= 70, 'nav rest 30–70')
      assertEq(budgets.dayPostOuter, 0, 'no post-nav day scroll budget')

      const settle = 1000
      const dashSpan = 800
      const dayTopSettle = 8
      const dayBottomDist = settle + dashSpan + dayTopSettle + budgets.dayScrollOuter
      const sampleVisual = (outer: number) => {
        const { app } = splitMobileMasterProgress(
          outer,
          10000,
          settle / 0.74,
          dashSpan,
          budgets,
        )
        return {
          app,
          dayOp: dayOpacityAt(app),
          navOp: mapLayerOpacityAt(app),
          dayY: dayScrollYAt(app, dayM),
          travel: travelProgressAt(app),
        }
      }

      const atBottom = sampleVisual(dayBottomDist)
      assert(Math.abs(atBottom.dayY + dayM) <= 1, 'unit: day at bottom')
      assert(atBottom.navOp <= 0.02, 'unit: nav still 0 at day bottom')
      assert(atBottom.travel <= 0.001, 'unit: travel 0 at day bottom')

      const findOuterForNav = (target: number) => {
        for (let d = 0; d <= budgets.dayEndHoldOuter + budgets.navEnterOuter + 40; d++) {
          const s = sampleVisual(dayBottomDist + d)
          if (s.navOp >= target) return d
        }
        return -1
      }
      const to10 = findOuterForNav(0.1)
      const to50 = findOuterForNav(0.5)
      const to90 = findOuterForNav(0.9)
      assert(to10 >= 0 && to10 <= 80, `unit bottom→nav0.10 ${to10} <= 80`)
      assert(to50 >= 0 && to50 <= 130, `unit bottom→nav0.50 ${to50} <= 130`)
      assert(to90 >= 0 && to90 <= 190, `unit bottom→nav0.90 ${to90} <= 190`)

      const readableOuter = dayBottomDist + to90
      let longestDead = 0
      let deadRun = 0
      let holdBlocks = 0
      let inHold = false
      let prev = sampleVisual(dayBottomDist)
      for (let d = 20; d <= to90 + 20; d += 20) {
        const cur = sampleVisual(dayBottomDist + d)
        const dayOpΔ = Math.abs(cur.dayOp - prev.dayOp)
        const navOpΔ = Math.abs(cur.navOp - prev.navOp)
        const dayYΔ = Math.abs(cur.dayY - prev.dayY)
        const material =
          dayOpΔ >= 0.015 || navOpΔ >= 0.015 || dayYΔ >= 0.5
        if (!material) {
          deadRun += 20
          if (!inHold) {
            holdBlocks += 1
            inHold = true
          }
          longestDead = Math.max(longestDead, deadRun)
        } else {
          deadRun = 0
          inHold = false
        }
        // coverage during enter
        if (cur.navOp > 0.02) {
          assert(cur.dayOp + cur.navOp >= 0.95, `unit coverage at +${d}`)
        }
        if (cur.navOp >= 0.25) assert(cur.navOp >= 0.2, 'map coupled at 0.25')
        if (cur.navOp >= 0.5) assert(cur.navOp >= 0.45, 'map coupled at 0.5')
        if (cur.navOp >= 0.9) assert(cur.navOp >= 0.85, 'map coupled at 0.9')
        prev = cur
      }
      assert(holdBlocks <= 1, `unit at most one hold block (got ${holdBlocks})`)
      assert(longestDead <= 80, `unit longest dead ${longestDead} <= 80`)

      // nav 0.9 → travel start
      const atReadable = sampleVisual(readableOuter)
      assert(atReadable.travel <= 0.001, 'travel still 0 when nav readable')
      let travelStart = -1
      for (let d = to90; d <= to90 + budgets.navRestOuter + 40; d++) {
        if (sampleVisual(dayBottomDist + d).travel > 0.001) {
          travelStart = d - to90
          break
        }
      }
      assert(
        travelStart >= 30 && travelStart <= 70,
        `unit nav0.9→travel ${travelStart} in 30–70`,
      )

      // day scroll sensitivity ~1:1 over 100px mid-scroll
      const midBase = settle + dashSpan + dayTopSettle + dayM * 0.3
      const y0 = sampleVisual(midBase).dayY
      const y1 = sampleVisual(midBase + 100).dayY
      const ratio = Math.abs(y1 - y0) / 100
      assert(ratio >= 0.9 && ratio <= 1.15, `unit day sensitivity ratio ${ratio.toFixed(3)}`)
    }
  }

  const appShellCss = read('src/features/landing-v2/mobile-story/app/MobileOurWedApp.module.css')
  const dashDemo = read('src/features/landing-v2/mobile-story/app/screens/MobileDashboardDemo.tsx')
  const dashCss = read('src/features/landing-v2/mobile-story/app/screens/MobileDashboardDemo.module.css')
  const compactBar = read(
    'src/features/landing-v2/mobile-story/app/screens/MobileCompactAssignmentBar.tsx',
  )
  const compactCss = read(
    'src/features/landing-v2/mobile-story/app/screens/MobileCompactAssignmentBar.module.css',
  )
  const collapse = read(
    'src/features/landing-v2/mobile-story/app/motion/mobileDashboardCollapse.ts',
  )
  const dayDemo = read('src/features/landing-v2/mobile-story/app/screens/MobileWeddingDayDemo.tsx')
  const dayCss = read('src/features/landing-v2/mobile-story/app/screens/MobileWeddingDayDemo.module.css')
  const navDemo = read('src/features/landing-v2/mobile-story/app/screens/MobileNavigationDemo.tsx')
  const briefDemo = read('src/features/landing-v2/mobile-story/app/screens/MobileOfflineBriefDemo.tsx')
  assertIncludes(appShellCss, 'container-type: size', 'phone-internal size container queries (6H height density)')
  assertIncludes(appShellCss, 'container-name: ow-mobile-app', 'named phone container for brief density')
  assertIncludes(appShellCss, '--ow-bg: #f5f2ed', 'classic page background token')
  assertIncludes(appShellCss, '--ow-safe-top', 'dynamic island safe area')
  assertIncludes(dashDemo, 'data-mobile-wedding-card', 'nearest wedding card')
  assertIncludes(dashDemo, 'data-mobile-tasks', 'tasks section')
  assertIncludes(dashDemo, 'data-mobile-notifications', 'notifications section')
  assertIncludes(dashDemo, 'data-dashboard-order="hero,upcoming,inquiries,today,deadlines,notifications"', 'production mobile section order')
  assertIncludes(dashDemo, 'data-mobile-dashboard-hero', 'hero marker')
  assertIncludes(dashDemo, 'data-mobile-dashboard-upcoming', 'upcoming marker')
  assertIncludes(dashDemo, 'data-mobile-dashboard-inquiries', 'inquiries marker')
  assertIncludes(dashDemo, 'data-mobile-dashboard-today', 'today marker')
  assertIncludes(dashDemo, 'data-mobile-dashboard-deadlines', 'deadlines marker')
  assertIncludes(dashDemo, 'data-mobile-dashboard-notifications', 'notifications marker')
  assertIncludes(dashDemo, 'data-dashboard-section="hero"', 'hero section marker')
  assertIncludes(dashDemo, 'data-dashboard-section="upcoming"', 'upcoming section marker')
  assertIncludes(dashDemo, 'data-dashboard-section="inquiries"', 'inquiries section marker')
  assertIncludes(dashDemo, 'data-dashboard-section="deadlines"', 'deadlines section marker')
  const heroIdx = dashDemo.indexOf('data-dashboard-section="hero"')
  const upcomingIdx = dashDemo.indexOf('data-dashboard-section="upcoming"')
  const inquiriesIdx = dashDemo.indexOf('data-dashboard-section="inquiries"')
  const todayIdx = dashDemo.indexOf('data-dashboard-section="today"')
  const deadlinesIdx = dashDemo.indexOf('data-dashboard-section="deadlines"')
  const notesIdx = dashDemo.indexOf('data-dashboard-section="notifications"')
  assert(heroIdx >= 0 && upcomingIdx > heroIdx, 'Upcoming follows nearest hero in DOM')
  assert(inquiriesIdx > upcomingIdx, 'Inquiries follow Upcoming')
  assert(todayIdx > inquiriesIdx, 'Today follows Inquiries')
  assert(deadlinesIdx > todayIdx, 'Deadlines follow Today')
  assert(notesIdx > deadlinesIdx, 'Notifications follow Deadlines')
  assertIncludes(appData, 'Nowe zgłoszenia', 'inquiries section title')
  assertIncludes(appData, 'Terminy oddania', 'deadlines section title')
  assertIncludes(appData, 'Aleksandra i Michał', 'inquiry fixture couple')
  assertIncludes(appData, 'Anna i Michał', 'deadline fixture couple')
  assertIncludes(appData, 'inquiries:', 'inquiries fixture array')
  assertIncludes(appData, 'deadlines:', 'deadlines fixture array')
  assertNotIncludes(appData, 'Pałac Mała Wieś', 'inquiries omit venue (not in production row)')
  assertNotIncludes(appData, 'Film ślubny', 'deadlines omit deliverable type (not in production row)')
  assertIncludes(dashCss, 'countdownMobile', 'V3 mobile countdown placement')
  assertIncludes(dashCss, 'min-height: 164px', 'production mobile hero height')
  assertIncludes(compactBar, 'compactAssignmentMonogram', 'reuses production monogram helper')
  assertIncludes(compactCss, 'backdrop-filter: blur(10px) saturate(1.06)', 'production glass blur')
  assertIncludes(compactCss, '-webkit-backdrop-filter: blur(10px) saturate(1.06)', 'safari glass')
  assertIncludes(collapse, 'DASH_COMPACT_ENTER_PX', 'compact enter threshold')
  assertIncludes(collapse, 'compactBarOpacityAt', 'progress-driven compact opacity')
  const scrollGeo = read(
    'src/features/landing-v2/mobile-story/app/motion/mobileDashboardScrollGeometry.ts',
  )
  assertIncludes(scrollGeo, 'measureDashboardScrollGeometry', 'derived max-scroll measure')
  assertIncludes(scrollGeo, 'DASHBOARD_BOTTOM_INSET_PX', 'bottom inset constant')
  assertIncludes(appShell, 'ResizeObserver', 'viewport/content ResizeObserver for max scroll')
  assertIncludes(appShell, 'data-mobile-dashboard-viewport', 'dashboard viewport marker')
  assertIncludes(dashDemo, 'data-mobile-dashboard-content', 'dashboard content marker')
  assertIncludes(dashDemo, 'data-mobile-dashboard-last-section', 'final section marker')
  assertIncludes(dayDemo, 'data-mobile-next-point', 'cockpit next-point block')
  assertIncludes(dayDemo, 'data-mobile-nawiguj', 'navigation action')
  assertIncludes(dayDemo, 'data-mobile-brief-card', 'brief action card')
  assertIncludes(dayDemo, 'data-mobile-contacts', 'contacts section')
  assertIncludes(dayDemo, 'data-mobile-critical', 'nie przegap section')
  assertIncludes(dayDemo, 'data-mobile-wedding-day-content', 'wedding day content marker')
  assertIncludes(dayDemo, 'data-mobile-wedding-day-last-section', 'wedding day last section marker')
  assertIncludes(appData, 'Zdjęcie grupowe', 'critical note fixture')
  assertIncludes(appData, 'Chcemy pod kościołem', 'critical note content')
  assertIncludes(appData, 'Czytania bliskich', 'ceremony note')
  assertIncludes(appData, 'U Panny Młodej', 'blessing note')
  assertIncludes(appData, 'Dostępny offline', 'brief offline support')
  assertIncludes(appData, "name: 'Julia'", 'julia contact')
  assertIncludes(appData, "name: 'Maksymilian'", 'maksymilian contact')
  assertNotIncludes(dayCss, 'border-left:', 'no active vertical rail on plan stops')
  assertIncludes(appData, "nowLabel: 'Następny punkt'", 'production cockpit eyebrow')
  assertIncludes(navDemo, 'data-mobile-route-map', 'route map clipped in screen')
  assertIncludes(navDemo, 'data-mobile-map-roads-primary', 'primary road layer')
  assertIncludes(navDemo, 'data-mobile-map-roads-secondary', 'secondary road layer')
  assertIncludes(navDemo, 'data-mobile-map-roads-minor', 'minor road layer')
  assertIncludes(navDemo, 'data-mobile-nav-map', 'nav map occupancy marker')
  assertIncludes(navDemo, 'data-mobile-route-underlay', 'route casing underlay')
  assertIncludes(navDemo, 'data-mobile-route-remaining', 'muted full remaining route')
  assertIncludes(navDemo, 'data-mobile-route-travelled', 'dark travelled route')
  assertIncludes(navDemo, 'data-mobile-route-start', 'explicit START marker')
  assertIncludes(navDemo, 'data-mobile-route-dest', 'explicit destination marker')
  assertIncludes(navDemo, 'Ceremonia', 'ceremony destination label on map')
  assertIncludes(navDemo, 'Start', 'start label on map')
  assertIncludes(navDemo, 'travelPathProgressAt', 'canonical path progress for marker+travelled')
  assertIncludes(navDemo, 'travelProgressAt', 'canonical travel progress')
  assertIncludes(navDemo, 'C ', 'curved route / road geometry (cubic)')
  assertIncludes(navDemo, 'S ', 'smooth curve road commands')
  assertNotIncludes(navDemo, 'googleapis', 'no google maps API')
  assertNotIncludes(navDemo, 'mapbox', 'no mapbox')
  assertNotIncludes(navDemo, 'Villa Love', 'nav scene is not reception')
  assertNotIncludes(navDemo, 'Izdebnik', 'nav scene is not reception city')
  assertIncludes(appData, 'routeLegs[1]', 'nav travel from ceremony incoming leg')
  assertIncludes(appData, 'ceremony.place', 'nav destination from ceremony place')
  assertIncludes(appData, "role: ceremony.label", 'nav destination role is ceremony')
  assertNotIncludes(
    appData.slice(appData.indexOf('navigation:'), appData.indexOf('brief:')),
    'reception.place',
    'navigation block must not use reception place',
  )
  assertIncludes(briefDemo, 'data-mobile-brief-paper', 'document paper structure')
  assertIncludes(briefDemo, 'data-mobile-brief-meta', 'brief status row')
  assertIncludes(briefDemo, 'data-mobile-brief-content', 'brief document content')
  assertIncludes(briefDemo, 'HARMONOGRAM', 'brief schedule section')
  assertIncludes(briefDemo, 'KLUCZOWE INFORMACJE', 'brief facts section')
  assertIncludes(briefDemo, 'primaryGrid', 'facts | nie przegap two-column grid')
  assertIncludes(briefDemo, 'peopleGrid', 'contacts | key people two-column grid')
  assertIncludes(briefDemo, 'kvTable', 'key-value facts table (not 2×2 cards)')
  assertIncludes(briefDemo, 'KONTAKTY', 'brief contacts section')
  assertIncludes(briefDemo, 'OSOBY KLUCZOWE', 'brief key people section')
  assertIncludes(briefDemo, 'LOGISTYKA', 'brief logistics section')
  assertIncludes(briefDemo, 'crewNoteLines', 'crew note lines wired')
  assertIncludes(briefDemo, 'b.brand', 'brief brand mark wired')
  assertIncludes(briefDemo, 'criticalLabel', 'brief critical section wired')
  assertNotIncludes(briefDemo, 'factsGrid', 'old 2×2 facts grid removed')
  assertNotIncludes(briefDemo, 'BRIEF PDF OFFLINE', 'no duplicate BRIEF PDF OFFLINE')
  assertNotIncludes(briefDemo, 'BRIEF ŚLUBNY', 'no duplicate BRIEF ŚLUBNY')
  assertNotIncludes(briefDemo, 'fileLabel', 'fileLabel not rendered')
  assertNotIncludes(briefDemo, 'docTitle', 'docTitle not rendered')
  assertIncludes(appData, "brand: 'OURWED'", 'brief brand mark')
  assertIncludes(appData, "criticalLabel: 'NIE PRZEGAP'", 'brief critical label')
  assertIncludes(appData, 'contacts:', 'brief contacts fixture')
  assertIncludes(appData, 'keyPeople:', 'brief key people fixture')
  assertIncludes(appData, 'logistics:', 'brief logistics fixture')
  assertIncludes(appData, 'crewNoteLines:', 'brief crew note lines fixture')
  assertIncludes(appData, '+48 512 340 118', 'Julia contact phone')
  assertIncludes(appData, 'Aleksandra Nowak', 'świadkowa name')
  assertIncludes(appData, 'Phase 6H.3', '6H.3 call-sheet recomposition documented')
  const briefCss = read(
    'src/features/landing-v2/mobile-story/app/screens/MobileOfflineBriefDemo.module.css',
  )
  assertIncludes(briefCss, '--brief-title:', 'brief typography tokens')
  assertNotIncludes(briefCss, 'transform: scale(', 'no brief content scale')
  assertNotIncludes(briefCss, 'zoom:', 'no brief zoom')
  assertIncludes(briefCss, 'container-name: ow-brief-sheet', 'brief queries own overlay height')
  assertIncludes(briefCss, '@container ow-brief-sheet (max-height: 700px)', 'single compact density tier')
  assertIncludes(briefCss, '@container ow-brief-sheet (max-height: 580px)', 'short-phone schedule collapse')
  assertIncludes(briefCss, 'clamp(', 'compact uses fluid cqh clamps')
  assertNotIncludes(briefCss, 'max-height: 680px)', 'no mid-height discrete shrink ladder')
  assertNotIncludes(briefCss, 'max-height: 640px)', 'no multi-tier micro shrink')
  assertNotIncludes(briefCss, 'max-height: 620px', 'no multi-tier micro shrink')
  assertNotIncludes(briefCss, 'max-height: 600px', 'no multi-tier micro shrink')
  assertNotIncludes(briefCss, 'max-height: 570px)', 'no extra short compact ladder')
  assertNotIncludes(briefCss, 'max-height: 560px)', 'no extra short compact ladder')
  assertNotIncludes(briefCss, 'max-height: 720px)', 'no mid-height discrete shrink ladder')
  assertIncludes(appProgress, 'briefScrollYAt', 'brief Y helper (always 0)')
  assertIncludes(appProgress, 'NO Wedding Day return after Navigation', '6G no day return documented')
  assertIncludes(appProgress, 'NO Brief-internal scroll', '6H no brief scroll documented')
  assertIncludes(appData, 'Za ${w.countdown.value} dni', 'production relative countdown casing')

  {
    // Unit continuity with a representative measured max (not a production magic constant).
    const sampleMax = 220
    const enter = compactEnterPxForMaxScroll(sampleMax)
    let gapHits = 0
    for (let i = 0; i <= 10; i++) {
      const app =
        MOBILE_APP_RANGES.dashScroll.start +
        (i / 10) * (MOBILE_APP_RANGES.dashScroll.end - MOBILE_APP_RANGES.dashScroll.start)
      const scrolled = Math.abs(dashScrollYAt(app, sampleMax))
      const compact = compactBarOpacityAt(app, sampleMax)
      const heroStillInView = scrolled < 164
      if (compact < 0.2 && !heroStillInView) gapHits += 1
      if (scrolled >= enter && compact < 0.85) {
        throw new Error(
          `compact bar should be settled at scroll=${scrolled.toFixed(0)} op=${compact.toFixed(2)}`,
        )
      }
    }
    assert(gapHits === 0, 'no hero/compact visibility gap across dashScroll samples')
    const yEnd = dashScrollYAt(MOBILE_APP_RANGES.dashScroll.end, sampleMax)
    const yHold = dashScrollYAt(MOBILE_APP_RANGES.dashEndHold.end - 0.001, sampleMax)
    const yAfter = dashScrollYAt(MOBILE_APP_RANGES.dashScroll.end + 0.03, sampleMax)
    assert(Math.abs(yEnd + sampleMax) <= 0.5, 'Y equals -maxScroll at scroll end')
    assert(Math.abs(yHold - yEnd) <= 0.5, 'Y frozen through end-hold')
    assert(Math.abs(yAfter - yEnd) <= 0.5, 'Y does not overscroll past maxScroll')
    assert(
      measureDashboardScrollGeometry(
        { clientHeight: 500 } as HTMLElement,
        {} as HTMLElement,
        { offsetTop: 400, offsetHeight: 120 } as HTMLElement,
      ).maxScroll === 400 + 120 + DASHBOARD_BOTTOM_INSET_PX - 500,
      'maxScroll formula: lastExtent + inset - viewport',
    )
  }

  assertIncludes(phone, 'data-mobile-phone', 'phone frame marker')
  assertNotIncludes(phone, 'data-lifecycle-phone', 'not lifecycle phone marker')
  assertIncludes(phoneCss, '--phone-ratio: 430 / 932', 'canonical phone ratio')
  assertIncludes(phoneCss, 'aspect-ratio: var(--phone-ratio)', 'height follows width')
  assertNotIncludes(phoneCss, 'background-image', 'no raster phone image')
  assertIncludes(phoneCss, 'btnSilent', 'silent switch hardware')
  assertIncludes(phoneCss, 'btnPower', 'power button hardware')
  assertIncludes(phoneCss, 'island', 'dynamic island')
  assertIncludes(phoneCss, 'screenPlaceholder', 'neutral screen placeholder')

  console.log('PASS  mobile story')
}

testMobileStory()

{
  const story = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx',
  )
  const storyCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const claims = read(
    'src/features/landing-v2/security-history/securityHistoryClaims.ts',
  )
  const histProgress = read(
    'src/features/landing-v2/security-history/securityHistoryProgress.ts',
  )
  const postBrief = read(
    'src/features/landing-v2/mobile-story/postBriefSecurityProgress.ts',
  )
  const clock = read(
    'src/features/landing-v2/security-history/mobilePhoneExitClock.ts',
  )
  const lock = read(
    'src/features/landing-v2/security-history/SecurityLockGraphic.tsx',
  )
  const phone = read(
    'src/features/landing-v2/mobile-story/device/HeroPhoneFrame.tsx',
  )
  const phoneCss = read(
    'src/features/landing-v2/mobile-story/device/HeroPhoneFrame.module.css',
  )
  const brief = read(
    'src/features/landing-v2/mobile-story/app/screens/MobileOfflineBriefDemo.tsx',
  )
  const briefCss = read(
    'src/features/landing-v2/mobile-story/app/screens/MobileOfflineBriefDemo.module.css',
  )
  const mobile = read(
    'src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx',
  )
  const mobileCss = read(
    'src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css',
  )
  const page = read('src/features/landing-v2/LandingV2Page.tsx')
  const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
  const product = read(
    'src/features/landing-v2/product-story/LandingV2ProductStory.tsx',
  )
  const explorer = read(
    'src/features/landing-v2/lifecycle-story/workflow/WorkflowExplorer.tsx',
  )
  const features = read(
    'src/features/landing-v2/features-grid/LandingV2FeaturesGrid.tsx',
  )

  assertIncludes(page, '<LandingV2SecurityHistoryStory />', 'history mounted after mobile')
  assert(
    page.indexOf('<LandingV2MobileStory />') <
      page.indexOf('<LandingV2SecurityHistoryStory />'),
    'mobile before history',
  )

  /* —— Mobile owns phone→lock —— */
  assertIncludes(mobile, 'data-mobile-post-brief-owner="true"', 'Mobile owns post-Brief morph')
  assertIncludes(mobile, 'data-mobile-phone-lock-owner="true"', 'Mobile owns phone through lock')
  assertIncludes(mobile, 'postBriefProgress', 'Mobile postBriefProgress MotionValue')
  assertIncludes(mobile, 'MOBILE_TRACK_POST_BRIEF_SVH', 'post-Brief tail constant')
  assertIncludes(mobile, 'postBriefShrinkScaleAt', 'LINEAR shrink from Mobile timeline')
  assertIncludes(mobile, 'budgetsFrozenRef', 'track budgets freeze during morph')
  assertIncludes(mobile, 'frozenTravelRef', 'travel mapping freeze during morph')
  assertIncludes(mobile, 'data-mobile-track-budgets-frozen', 'frozen budget diagnostic attr')
  assertIncludes(
    mobile,
    'if (budgetsFrozenRef.current) return',
    'maxScroll subscribers ignored while frozen',
  )
  assertIncludes(mobile, 'data-phone-transform-owner="phoneSystem"', 'one transform owner')
  assertIncludes(mobile, 'data-security-copy=""', 'security copy lives in Mobile sticky')
  assertIncludes(mobile, 'LV2_SECURITY_COPY', 'verified security copy in Mobile')
  assertNotIncludes(mobile, 'phoneSecurityLeaveMv', 'no leave MV on phone path')
  assertNotIncludes(mobile, 'mobilePhoneExitMv', 'no exit MV on phone path')
  assertNotIncludes(mobile, 'lockMorphActive', 'no threshold remount gate')
  assertNotIncludes(mobile, 'setLockMorphActive', 'no morph React gate')
  assertIncludes(mobileCss, '--mobile-track-post-brief-svh', 'post-Brief CSS track budget')
  assertIncludes(mobileCss, '--security-lock-copy-gap', 'bounded lock→copy gap token')
  assertIncludes(mobileCss, 'clamp(2.5rem, 4vh, 3.25rem)', 'responsive lock→copy gap ~52px')
  assertNotIncludes(mobileCss, 'top: 72%', 'copy no longer parked at far 72%')
  assertNotIncludes(mobileCss, '--mobile-track-lock-svh', 'old dual-clock lock svh removed')

  /* —— HeroPhoneFrame always mounts morph primitives —— */
  assertIncludes(phone, 'lockMorph: PhoneLockMorphValues', 'lockMorph required prop')
  assertIncludes(phone, 'LockShackle', 'shackle always in phone')
  assertIncludes(phone, 'LockKeyhole', 'keyhole always in phone')
  assertIncludes(phone, 'data-phone-chassis', 'chassis marker')
  assertIncludes(phone, 'data-security-lock-chassis', 'chassis is lock body')
  assertNotIncludes(phone, 'lockMorphActive', 'no remount gate in phone')
  assertIncludes(phone, 'style={{ aspectRatio }}', 'aspect always motion-driven at identity until compress')
  assertIncludes(phoneCss, 'margin-bottom: -14px', 'closed shackle legs tuck into body')
  assertIncludes(phoneCss, 'background: #1a1614', 'screen merge black')
  assertNotIncludes(phone, 'frozenScreenCanvas', 'no frozen Brief canvas (freeze experiment rolled back)')
  assertNotIncludes(phoneCss, '.frozenScreenCanvas', 'no frozen canvas CSS')
  assertNotIncludes(phone, 'data-phone-frozen-canvas', 'no frozen canvas marker')

  /* —— Security History disconnected from phone; scroll chapter absorbed —— */
  assertIncludes(story, 'data-security-history-role="studio-history-only"', 'history-only role')
  assertIncludes(story, 'data-security-theater="absorbed"', 'scroll history absorbed into Mobile')
  assertNotIncludes(story, 'publishPhoneSecurityMorph(', 'history does not publish morph')
  assertNotIncludes(story, 'phoneSecuritySnapshotAt', 'no phone snapshot publish')
  assertNotIncludes(story, 'morphRoot', 'no surrogate morphRoot')
  assertNotIncludes(story, 'LockShackle', 'history does not mount morph shackle')
  assertNotIncludes(story, 'LockKeyhole', 'history does not mount morph keyhole')
  assertNotIncludes(story, 'LV2_SECURITY_COPY', 'security copy moved to Mobile')
  assertNotIncludes(story, 'SecurityLockGraphic', 'no second lock graphic in history story')
  assertNotIncludes(storyCss, '200svh', 'no competing 200svh history sticky')
  assertNotIncludes(storyCss, '.morphRoot', 'no morphRoot CSS')
  assertIncludes(mobile, 'StudioHistoryReveal', 'studio history reveal owned by Mobile')
  assertIncludes(mobile, 'StudioImportReveal', 'season import reveal owned by Mobile')
  assertNotIncludes(mobile, 'FounderStoryReveal', 'Founder not dual-owned inside Mobile sticky')
  assertNotIncludes(read('src/features/landing-v2/mobile-story/StudioImportReveal.tsx'), 'Season2027Bridge', 'no 2027 FLIP bridge on import path')
  assertNotIncludes(mobile, 'Season2027Bridge', 'MobileStory does not mount Season2027Bridge')
  assertIncludes(mobile, 'studioProgress', 'Mobile studioProgress MotionValue')
  assertIncludes(mobile, 'importProgress', 'Mobile importProgress MotionValue')
  assertNotIncludes(mobile, 'founderProgress', 'no founderProgress MotionValue (single-owner Founder)')
  assertIncludes(mobile, 'data-studio-lock=""', 'same lock marked as studio lock')
  assertIncludes(mobileCss, '--mobile-track-studio-history-svh', 'studio history CSS track budget')
  assertIncludes(mobileCss, '--mobile-track-season-import-svh', 'season import CSS track budget')
  assertIncludes(mobileCss, '--mobile-track-import-cover-hold-svh', 'Import cover-hold runway CSS budget')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH, 145, 'studio history 145svh')
  assertEq(MOBILE_TRACK_SEASON_IMPORT_SVH, 150, 'season import 150svh')
  assertEq(MOBILE_TRACK_IMPORT_COVER_HOLD_SVH, 100, 'Import cover-hold is one viewport')
  assertEq(MOBILE_TRACK_FOUNDER_SVH, MOBILE_TRACK_IMPORT_COVER_HOLD_SVH, 'legacy founder alias = cover hold')
  assertEq(MOBILE_TRACK_FOUNDER_COVER_SVH, MOBILE_TRACK_IMPORT_COVER_HOLD_SVH, 'cover alias = cover hold')
  assertEq(MOBILE_TRACK_FOUNDER_STORY_SVH, 0, 'no synthetic Founder story budget')

  assertIncludes(clock, 'disconnected', 'morph publish disconnected')
  assertIncludes(clock, 'leave must not hide', 'leave path disabled')

  assertIncludes(postBrief, 'MOBILE_TRACK_POST_BRIEF_SVH = 112', 'post-Brief svh tightened')
  assertIncludes(postBrief, 'POST_BRIEF_MORPH_START', 'shared morph start constant')
  assertIncludes(postBrief, 'phoneShrink:', 'shrink range')
  assertIncludes(postBrief, 'LINEAR', 'linear spatial motion documented')
  assertIncludes(postBrief, 'postBriefOuterOpacityAt', 'opacity invariant helper')
  assertIncludes(postBrief, 'POST_BRIEF_SHRINK_END = 0.48', 'shrink end scale')
  assertIncludes(postBrief, 'SAME start as shrink', 'synchronized morph start documented')
  assertNotIncludes(postBrief, 'easeOutCubic(phoneShrink', 'shrink not easeOut-amplified')
  assertNotIncludes(histProgress, 'phoneShrink:', 'history progress has no phone shrink')
  assertNotIncludes(histProgress, 'phoneLeaveAt', 'history has no phone leave')
  assertNotIncludes(histProgress, 'lockToStudio', 'lockToStudio removed from history clock')

  {
    const r = POST_BRIEF_RANGES
    assert(POST_BRIEF_MORPH_START < 0.015, 'morph starts almost immediately')
    assert(r.phoneShrink.start === POST_BRIEF_MORPH_START, 'shrink starts at shared morph start')
    assert(r.screenFade.start === POST_BRIEF_MORPH_START, 'Brief fade starts with shrink')
    assert(r.screenMerge.start === POST_BRIEF_MORPH_START, 'black merge starts with shrink')
    assert(r.bodyCompress.start > r.screenFade.end, 'body morph delayed: starts after Brief is unreadable')
    assert(r.bodyCompress.start >= 0.22 && r.bodyCompress.start <= 0.30, 'body morph start in valid delayed range')
    assert(r.shackle.start > r.bodyCompress.start, 'shackle starts after body morph begins')
    assert(r.shackle.start < r.bodyCompress.end, 'shackle starts before body morph ends')
    assert(postBriefShrinkScaleAt(0) === 1, 'hold starts at scale 1')
    assert(postBriefShrinkScaleAt(r.briefHold.end) === 1, 'hold end still scale 1')
    assert(r.briefHold.end <= 0.015, 'no perceptible Brief hold')
    assert(MOBILE_TRACK_POST_BRIEF_SVH < 145, 'tail shorter than prior 145svh')
    assert(MOBILE_TRACK_POST_BRIEF_SVH >= 105 && MOBILE_TRACK_POST_BRIEF_SVH <= 120, 'tail in 105–120svh')
    assert(
      Math.abs(postBriefShrinkScaleAt(r.phoneShrink.end) - 0.48) < 0.001,
      'LINEAR shrink ends at 0.48',
    )
    const mid = (r.phoneShrink.start + r.phoneShrink.end) / 2
    const expectedMid = 1 - 0.5 * (1 - 0.48)
    assert(
      Math.abs(postBriefShrinkScaleAt(mid) - expectedMid) < 0.001,
      'LINEAR shrink midpoint',
    )
    /* Synchronized start invariant at p=0.03 */
    const early = 0.03
    assert(postBriefShrinkScaleAt(early) < 0.98, 'scale already moving at 0.03')
    assert(postBriefContentOpAt(early) < 0.98, 'Brief already fading at 0.03')
    assert(postBriefScreenMergeAt(early) > 0.02, 'black merge already active at 0.03')
    assert(postBriefCompressAt(early) === 0, 'body morph is 0 at 0.03 (Brief still readable — Stage 1 only)')
    assert(postBriefCompressAt(r.bodyCompress.start) === 0, 'bodyCompress exactly 0 at its own start threshold')
    assert(postBriefCompressAt(r.bodyCompress.start + 0.01) > 0, 'bodyCompress starts moving just after threshold')
    assert(postBriefShackleAt(0.35) > 0.1, 'shackle underway mid-morph')
    assert(r.securityCopy.start >= 0.55 && r.securityCopy.start <= 0.70, 'copy enters once lock is recognizable')
    for (const p of [0, 0.08, 0.2, 0.34, 0.43, 0.52, 0.62, 0.73, 0.82, 0.9, 1]) {
      assert(postBriefOuterOpacityAt(p) === 1, `outer opacity 1 at ${p}`)
      const label = postBriefPerceptAt(p)
      assert(
        !['BLANK', 'RECTANGLE', 'SECOND PHONE', 'OPEN LOCK', 'PHONE MISSING'].includes(label),
        `percept ok at ${p}: ${label}`,
      )
    }
    assert(postBriefPerceptAt(0) === 'PHONE', '0.00 PHONE')
    assert(postBriefPerceptAt(0.1) === 'SMALL PHONE', '0.10 SMALL PHONE')
    assert(postBriefPerceptAt(0.35) === 'PHONE→LOCK', '0.35 PHONE→LOCK')
    assert(postBriefPerceptAt(0.56) === 'LOCK', '0.56 LOCK')
    assert(postBriefPerceptAt(0.63) === 'LOCK + COPY', '0.63 LOCK + COPY')
    assertEq(MOBILE_TRACK_POST_BRIEF_SVH, 112, 'post-Brief budget 112svh')
    assertEq(POST_BRIEF_MORPH_START, 0.001, 'shared morph start 0.001')
    {
      const morphDeadPx1440 = POST_BRIEF_MORPH_START * (MOBILE_TRACK_POST_BRIEF_SVH / 100) * 900
      const physicalDeadPx = BRIEF_SETTLE_OUTER_PX + morphDeadPx1440
      assert(physicalDeadPx >= 3 && physicalDeadPx <= 8, `physical dead scroll 3–8px (got ${physicalDeadPx.toFixed(1)})`)
    }
  }

  {
    /* Runtime-style monotonic sample: 64 forward postBrief steps must never regress PHONE↔LOCK. */
    const samples: MorphSample[] = []
    for (let i = 0; i <= 63; i++) {
      const postBrief = i / 63
      const aspect = postBriefAspectRatioAt(postBrief)
      const screen = postBriefContentOpAt(postBrief)
      const shackle = postBriefShackleAt(postBrief)
      samples.push({
        postBrief,
        aspect,
        screen,
        shackle,
        classification: classifyMorph(aspect, screen, shackle),
      })
    }
    const hits = findForwardMorphOscillations(samples)
    assert(
      hits.length === 0,
      `no forward morph oscillation, hits=${JSON.stringify(hits.slice(0, 5))}`,
    )
    let sawLock = false
    for (const s of samples) {
      if (s.classification === 'LOCK') sawLock = true
      if (sawLock) {
        assert(
          s.classification !== 'PHONE',
          `once LOCK, never PHONE again at pb=${s.postBrief}`,
        )
      }
    }
    /* Guard detects the classic alternating pattern if it reappears. */
    const oscillating: MorphSample[] = []
    for (let i = 0; i < 12; i++) {
      const postBrief = 0.45 + i * 0.02
      const lockish = i % 2 === 0
      oscillating.push({
        postBrief,
        aspect: lockish ? 0.55 : 430 / 932,
        screen: lockish ? 0.1 : 1,
        shackle: lockish ? 0.8 : 0,
        classification: lockish ? 'LOCK' : 'PHONE',
      })
    }
    assert(
      findForwardMorphOscillations(oscillating).length > 0,
      'guard fails closed on alternating PHONE/LOCK samples',
    )
  }

  assertIncludes(lock, 'data-security-lock-open="false"', 'lock never opens')
  assertIncludes(lock, 'data-security-lock-shackle-closed="true"', 'closed shackle')
  assertNotIncludes(lock, 'rotate(', 'no shackle rotation')
  assertNotIncludes(lock, 'unlock', 'no unlock semantic')

  assertIncludes(claims, 'Dane Twojego studia', 'security headline line 1')
  assertIncludes(claims, 'zostają w Twoim koncie.', 'security headline line 2')
  assertIncludes(claims, 'Dostęp tylko po zalogowaniu', 'verified auth micro-point')
  assertIncludes(claims, 'Umowy, dane klientów, płatności', 'concrete data classes in body')
  assertIncludes(claims, 'Dokumenty przypisane do Twojego studia', 'documents proof point')
  assertIncludes(claims, 'Dane oddzielone między konta', 'isolation proof point')
  assertIncludes(claims, 'Cała historia Twojego studia.', 'history headline line 1')
  assertIncludes(claims, 'Sezon po sezonie.', 'history headline line 2')
  assertIncludes(claims, 'year: 2026', 'season 2026')
  assertIncludes(claims, 'year: 2027', 'season 2027')
  assertIncludes(claims, 'year: 2028', 'season 2028')
  assertNotIncludes(claims, 'year: 2029', 'season 2029 must not exist')
  assertEq(LV2_HISTORY_SEASONS.length, 3, 'exactly three seasons')
  assertEq(LV2_HISTORY_SEASONS[0]?.year, 2026, 'first season 2026')
  assertEq(LV2_HISTORY_SEASONS[1]?.year, 2027, 'second season 2027')
  assertEq(LV2_HISTORY_SEASONS[2]?.year, 2028, 'third season 2028')
  for (const season of LV2_HISTORY_SEASONS) {
    assertEq(season.records.length, 6, `${season.year} has exactly 6 client rows`)
  }
  assertEq(LV2_HISTORY_SEASONS[0]?.footer, 'i 8 innych zleceń', '2026 additional count unchanged')
  assertEq(LV2_HISTORY_SEASONS[1]?.footer, 'i 9 innych zleceń', '2027 additional count unchanged')
  assertEq(LV2_HISTORY_SEASONS[2]?.footer, 'i 11 innych zleceń', '2028 additional count unchanged')
  assertEq(
    LV2_HISTORY_SEASONS[0]?.records.map((r) => r.couple).join('|'),
    'Julia i Maksymilian|Karolina i Jan|Zuzanna i Kamil|Alicja i Tomasz|Magdalena i Piotr|Weronika i Michał',
    '2026 couple names',
  )
  assertEq(
    LV2_HISTORY_SEASONS[1]?.records.map((r) => r.couple).join('|'),
    'Natalia i Filip|Anna i Michał|Oliwia i Jan|Paulina i Szymon|Ewa i Bartek|Klaudia i Jakub',
    '2027 couple names',
  )
  assertEq(
    LV2_HISTORY_SEASONS[2]?.records.map((r) => r.couple).join('|'),
    'Marta i Kamil|Julia i Adam|Lena i Filip|Dominika i Adrian|Patrycja i Wojciech|Izabela i Maciej',
    '2028 couple names',
  )
  for (const banned of [
    'end-to-end',
    'bank-grade',
    'military-grade',
    'SOC 2',
    'SOC2',
    'ISO 27001',
    'GDPR certified',
  ]) {
    assertIncludes(claims, `'${banned}'`, `banned token listed: ${banned}`)
  }
  assertNotIncludes(brief, 'security-history', 'Brief untouched')
  assertNotIncludes(briefCss, 'security-history', 'Brief CSS untouched')
  assertNotIncludes(hero, 'SecurityHistory', 'Hero unchanged')
  assertNotIncludes(product, 'SecurityHistory', 'Product Story unchanged')
  assertNotIncludes(explorer, 'SecurityHistory', 'Workflow Explorer unchanged')
  assertNotIncludes(features, 'postBrief', 'Features grid untouched by post-Brief')

  console.log('PASS  security + studio history story')
}

{
  assertEq(PRO_PLAN.monthly.amountPln, 49, 'monthly 49')
  assertEq(PRO_PLAN.annual.amountPln, 490, 'annual 490')
  assertEq(PRO_PLAN.trialDays, 30, 'trial 30')
  console.log('PASS  plan catalog')
}

{
  const v2Root = resolve(process.cwd(), 'src/features/landing-v2')
  const forbidden = [
    '@supabase',
    '@/lib/api',
    '@tanstack/react-query',
    'AuthProvider',
    'ThemeProvider',
    'AppearanceProvider',
    'AppLayout',
    'ModernWeddingDetailWorkspace',
    'ModernWeddingIdentityHero',
    'modern-detail/',
    "from 'gsap'",
    'ScrollTrigger',
    'ChaosCalm',
    'orbit',
    'unsplash',
    'pexels',
    'Zofia i Mikołaj',
  ]
  for (const file of walkTs(v2Root)) {
    if (file.endsWith('landingV2Acceptance.test.ts')) continue
    const src = readFileSync(file, 'utf8')
    for (const needle of forbidden) {
      assertNotIncludes(src, needle, `${file}`)
    }
  }

  console.log('PASS  isolation')
}

/** Keep mobile handoff at progress 0 while bringing a feature module into hover reach. */
async function scrollFeatureModuleForHover(page: import('playwright').Page, featureId: string) {
  await page.evaluate((id) => {
    document.querySelector(`[data-feature="${id}"]`)?.scrollIntoView({ block: 'center' })
  }, featureId)
  await page.waitForTimeout(200)
  await page.evaluate((id) => {
    const navH =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lv3-nav-h')) || 68
    /* Lifecycle no longer underlaps features — keep mobile story progress at 0. */
    document.querySelector(`[data-feature="${id}"]`)?.scrollIntoView({ block: 'center' })
    const track = document.querySelector('[data-testid="lv2-mobile-story"]') as HTMLElement | null
    if (!track) return
    for (let i = 0; i < 48; i++) {
      const rect = track.getBoundingClientRect()
      if (rect.top > navH + 1) break
      window.scrollBy(0, -28)
    }
  }, featureId)
  await page.waitForTimeout(350)
}

async function testPowiadomieniaHoverFit() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1728, 1080],
    [1512, 982],
    [1440, 900],
    [1280, 800],
  ] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-feature="powiadomienia"]', { timeout: 5000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(250)
      await scrollFeatureModuleForHover(page, 'powiadomienia')

      const rest = await page.locator('[data-feature="powiadomienia"]').boundingBox()
      assert(rest != null, `powiadomienia rest box @ ${vw}x${vh}`)

      const box = rest
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(650)

      const hover = await page.locator('[data-feature="powiadomienia"]').boundingBox()
      assert(hover != null, `powiadomienia hover box @ ${vw}x${vh}`)

      assertEq(Math.round(hover.x - rest.x), 0, `powiadomienia dx @ ${vw}x${vh}`)
      assertEq(Math.round(hover.y - rest.y), 0, `powiadomienia dy @ ${vw}x${vh}`)
      assertEq(Math.round(hover.width - rest.width), 0, `powiadomienia dw @ ${vw}x${vh}`)
      assertEq(Math.round(hover.height - rest.height), 0, `powiadomienia dh @ ${vw}x${vh}`)

      const fit = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="powiadomienia"]')
        const instrument = module?.querySelector('[class*="inboxInstrument"]')
        const items = module ? Array.from(module.querySelectorAll('article')) : []
        const instrumentRect = instrument?.getBoundingClientRect()
        if (!instrumentRect || items.length < 3) return { ok: false, reason: 'missing nodes' }

        const firstRect = items[0].getBoundingClientRect()
        const thirdRect = items[2].getBoundingClientRect()
        const thirdDate = items[2].querySelector('time')?.getBoundingClientRect()

        return {
          ok:
            firstRect.top >= instrumentRect.top - 0.5 &&
            thirdRect.bottom <= instrumentRect.bottom + 0.5 &&
            (thirdDate ? thirdDate.bottom <= instrumentRect.bottom + 0.5 : false),
        }
      })

      assert(fit.ok, `powiadomienia third row inside instrument @ ${vw}x${vh}`)
      await page.mouse.move(0, 0)
      await page.waitForTimeout(150)
    }

    console.log('PASS  powiadomienia hover fit geometry')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  powiadomienia hover fit geometry (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testPowiadomieniaHoverFit()

async function testZadaniaHoverCompletion() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1728, 1080],
    [1512, 982],
    [1440, 900],
    [1280, 800],
  ] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const readTaskStates = () =>
    page.evaluate(() => {
      const module = document.querySelector('[data-feature="zadania"]')
      const items = module ? Array.from(module.querySelectorAll('li')) : []
      return items.map((li, index) => {
        const icon = li.querySelector('svg')
        const path = icon?.querySelector('path')
        const iconOpacity = icon ? parseFloat(getComputedStyle(icon).opacity || '0') : 0
        const dashOffset = path
          ? parseFloat(getComputedStyle(path).strokeDashoffset || '999')
          : 999
        const doneClass = li.className.includes('taskDone')
        const rect = li.getBoundingClientRect()
        const checked = doneClass || (iconOpacity > 0.92 && dashOffset < 1.5)
        return {
          index: index + 1,
          checked,
          transitioning: !checked && (iconOpacity > 0.02 || dashOffset < 21),
          top: Math.round(rect.top),
          height: Math.round(rect.height),
        }
      })
    })

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-feature="zadania"]', { timeout: 5000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(250)
      await scrollFeatureModuleForHover(page, 'zadania')

      const hasNextPanel = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="zadania"]')
        return module?.textContent?.includes('Następne') ?? false
      })
      assertEq(hasNextPanel, false, `zadania no następne panel @ ${vw}x${vh}`)

      const restBox = await page.locator('[data-feature="zadania"]').boundingBox()
      assert(restBox != null, `zadania rest box @ ${vw}x${vh}`)

      const restStates = await readTaskStates()
      assert(restStates[0]?.checked, `zadania task 1 checked at rest @ ${vw}x${vh}`)
      assert(!restStates[1]?.checked, `zadania task 2 unchecked at rest @ ${vw}x${vh}`)
      assert(!restStates[2]?.checked, `zadania task 3 unchecked at rest @ ${vw}x${vh}`)
      assert(!restStates[3]?.checked, `zadania task 4 unchecked at rest @ ${vw}x${vh}`)

      const restPositions = restStates.map((item) => ({ top: item.top, height: item.height }))

      await page.mouse.move(restBox.x + restBox.width / 2, restBox.y + restBox.height / 2)
      await page.waitForTimeout(170)
      const at150 = await readTaskStates()
      assert(
        at150[1]?.checked || at150[1]?.transitioning,
        `zadania task 2 animating ~170ms @ ${vw}x${vh}`,
      )
      assert(!at150[2]?.checked, `zadania task 3 still unchecked ~150ms @ ${vw}x${vh}`)
      assert(!at150[3]?.checked, `zadania task 4 still unchecked ~150ms @ ${vw}x${vh}`)

      await page.waitForTimeout(110)
      const at260 = await readTaskStates()
      assert(at260[1]?.checked, `zadania task 2 checked ~260ms @ ${vw}x${vh}`)
      assert(
        at260[2]?.checked || at260[2]?.transitioning,
        `zadania task 3 animating ~260ms @ ${vw}x${vh}`,
      )
      assert(!at260[3]?.checked, `zadania task 4 still unchecked ~260ms @ ${vw}x${vh}`)

      await page.waitForTimeout(120)
      const at380 = await readTaskStates()
      assert(at380[1]?.checked, `zadania task 2 checked ~380ms @ ${vw}x${vh}`)
      assert(at380[2]?.checked, `zadania task 3 checked ~380ms @ ${vw}x${vh}`)
      assert(
        at380[3]?.checked || at380[3]?.transitioning,
        `zadania task 4 animating ~380ms @ ${vw}x${vh}`,
      )

      await page.waitForTimeout(150)
      const settled = await readTaskStates()
      assert(settled.every((item) => item.checked), `zadania all tasks checked settled @ ${vw}x${vh}`)

      const hoverBox = await page.locator('[data-feature="zadania"]').boundingBox()
      assert(hoverBox != null, `zadania hover box @ ${vw}x${vh}`)
      assertEq(Math.round(hoverBox.x - restBox.x), 0, `zadania dx @ ${vw}x${vh}`)
      assertEq(Math.round(hoverBox.y - restBox.y), 0, `zadania dy @ ${vw}x${vh}`)
      assertEq(Math.round(hoverBox.width - restBox.width), 0, `zadania dw @ ${vw}x${vh}`)
      assertEq(Math.round(hoverBox.height - restBox.height), 0, `zadania dh @ ${vw}x${vh}`)

      settled.forEach((item, index) => {
        assertEq(item.top, restPositions[index]?.top ?? -1, `zadania row ${index + 1} top stable @ ${vw}x${vh}`)
        assertEq(item.height, restPositions[index]?.height ?? -1, `zadania row ${index + 1} height stable @ ${vw}x${vh}`)
      })

      await page.mouse.move(0, 0)
      await page.waitForTimeout(400)
      const afterLeave = await readTaskStates()
      assert(afterLeave[0]?.checked, `zadania task 1 stays checked after leave @ ${vw}x${vh}`)
      assert(!afterLeave[1]?.checked, `zadania task 2 unchecked after leave @ ${vw}x${vh}`)
      assert(!afterLeave[2]?.checked, `zadania task 3 unchecked after leave @ ${vw}x${vh}`)
      assert(!afterLeave[3]?.checked, `zadania task 4 unchecked after leave @ ${vw}x${vh}`)
      await page.waitForTimeout(150)
    }

    console.log('PASS  zadania hover completion')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  zadania hover completion (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testZadaniaHoverCompletion()

async function testUmowyHoverGeometry() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1728, 1080],
    [1512, 982],
    [1440, 900],
    [1280, 800],
  ] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-feature="umowy"]', { timeout: 5000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(250)
      await scrollFeatureModuleForHover(page, 'umowy')

      const restBox = await page.locator('[data-feature="umowy"]').boundingBox()
      assert(restBox != null, `umowy rest box @ ${vw}x${vh}`)

      await page.mouse.move(restBox.x + restBox.width / 2, restBox.y + restBox.height / 2)
      await page.waitForTimeout(850)

      const hoverBox = await page.locator('[data-feature="umowy"]').boundingBox()
      assert(hoverBox != null, `umowy hover box @ ${vw}x${vh}`)

      assertEq(Math.round(hoverBox.x - restBox.x), 0, `umowy dx @ ${vw}x${vh}`)
      assertEq(Math.round(hoverBox.y - restBox.y), 0, `umowy dy @ ${vw}x${vh}`)
      assertEq(Math.round(hoverBox.width - restBox.width), 0, `umowy dw @ ${vw}x${vh}`)
      assertEq(Math.round(hoverBox.height - restBox.height), 0, `umowy dh @ ${vw}x${vh}`)

      const fit = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="umowy"]')
        const doc = module?.querySelector('[class*="umowyDocPage"]')
        const source = module?.querySelector('[class*="umowySource"]')
        const docRect = doc?.getBoundingClientRect()
        const sourceRect = source?.getBoundingClientRect()
        const moduleRect = module?.getBoundingClientRect()
        if (!docRect || !sourceRect || !moduleRect) return { ok: false }

        const overflow =
          docRect.bottom > moduleRect.bottom + 1 || sourceRect.bottom > moduleRect.bottom + 1

        return {
          ok: !overflow,
          sourceFields: source?.querySelectorAll('dl > div').length ?? 0,
          resolvedLines: Array.from(
            module?.querySelectorAll('[class*="umowyResolved"]') ?? [],
          ).filter((el) => parseFloat(getComputedStyle(el).opacity || '0') > 0.9).length,
        }
      })

      assert(fit.ok, `umowy no clipping @ ${vw}x${vh}`)
      assertEq(fit.sourceFields, 6, `umowy six source fields @ ${vw}x${vh}`)
      assert(fit.resolvedLines >= 5, `umowy resolved document lines @ ${vw}x${vh}`)

      const status = await page.evaluate(() => {
        const hover = document.querySelector('[data-feature="umowy"] [class*="umowyStatusHover"]')
        return (hover?.textContent ?? '').trim()
      })
      assert(status.toLowerCase().includes('umowa wygenerowana'), `umowy hover status @ ${vw}x${vh}`)

      await page.mouse.move(0, 0)
      await page.waitForTimeout(200)
    }

    console.log('PASS  umowy hover geometry')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  umowy hover geometry (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testUmowyHoverGeometry()

async function testFinanseHoverGeometry() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1728, 1080],
    [1512, 982],
    [1440, 900],
    [1366, 768],
    [1280, 800],
  ] as const
  const siblings = [
    'powiadomienia',
    'zadania',
    'umowy',
    'pakiety',
    'sluby',
    'kalendarz',
    'sesje',
    'ankiety',
  ] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-feature="finanse"]', { timeout: 5000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(250)
      await scrollFeatureModuleForHover(page, 'finanse')

      const restState = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="finanse"]')
        const moduleRect = module?.getBoundingClientRect()
        return moduleRect
          ? {
              x: Math.round(moduleRect.x),
              y: Math.round(moduleRect.y),
              w: Math.round(moduleRect.width),
              h: Math.round(moduleRect.height),
            }
          : null
      })
      assert(restState != null, `finanse rest box @ ${vw}x${vh}`)

      const siblingRest = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      const finanseRestBox = await page.locator('[data-feature="finanse"]').boundingBox()
      assert(finanseRestBox != null, `finanse rest box for hover @ ${vw}x${vh}`)
      await page.mouse.move(
        finanseRestBox.x + finanseRestBox.width / 2,
        finanseRestBox.y + finanseRestBox.height / 2,
      )
      await page.waitForTimeout(950)

      const settledState = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="finanse"]')
        const moduleRect = module?.getBoundingClientRect()
        const instrument = module?.querySelector('[class*="financeInstrument"]')
        const instrumentRect = instrument?.getBoundingClientRect()
        const chart = module?.querySelector('[class*="financeChart"]')
        const ledger = module?.querySelector('[class*="financeLedger"]')
        const footRest = module?.querySelector('[class*="financeFootRest"]')
        const footHover = module?.querySelector('[class*="financeFootHover"]')
        const bars = Array.from(module?.querySelectorAll('[class*="financeBarTrack"] > span') ?? [])
        const months = Array.from(module?.querySelectorAll('[class*="financeBarCol"] [class*="financeMonth"]') ?? [])
        const barValues = Array.from(module?.querySelectorAll('[class*="financeBarValue"]') ?? [])

        const chartOpacity = chart ? parseFloat(getComputedStyle(chart).opacity || '0') : 0
        const ledgerOpacity = ledger ? parseFloat(getComputedStyle(ledger).opacity || '1') : 1
        const footRestOpacity = footRest ? parseFloat(getComputedStyle(footRest).opacity || '1') : 1

        const visibleBars = bars.filter((bar) => {
          const style = getComputedStyle(bar)
          if (style.display === 'none' || style.visibility === 'hidden') return false
          const opacity = parseFloat(style.opacity || '0')
          if (opacity < 0.4) return false
          const parentCol = bar.closest('[class*="financeBarCol"]')
          if (parentCol && getComputedStyle(parentCol).display === 'none') return false
          const transform = style.transform || 'none'
          let scaleY = 1
          if (transform !== 'none') {
            const scaleMatch = transform.match(/scaleY\(([^)]+)\)/)
            if (scaleMatch) scaleY = parseFloat(scaleMatch[1])
            else {
              const matrixMatch = transform.match(/matrix\(([^)]+)\)/)
              if (matrixMatch) {
                const parts = matrixMatch[1].split(',').map((s) => parseFloat(s.trim()))
                if (parts.length >= 4) scaleY = parts[3]
              } else {
                scaleY = 0
              }
            }
          }
          return scaleY > 0.08
        })

        const visibleMonths = months.filter((el) => {
          const style = getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden') return false
          const parentCol = el.closest('[class*="financeBarCol"]')
          if (parentCol && getComputedStyle(parentCol).display === 'none') return false
          return parseFloat(style.opacity || '0') > 0.85
        })

        const bounds = instrumentRect ?? moduleRect
        let overflow = false
        if (bounds) {
          const checkEls = [...bars, ...months]
          for (const el of checkEls) {
            const style = getComputedStyle(el)
            if (style.display === 'none' || parseFloat(style.opacity || '0') < 0.4) continue
            const r = el.getBoundingClientRect()
            if (
              r.left < bounds.left - 1 ||
              r.right > bounds.right + 1 ||
              r.top < bounds.top - 1 ||
              r.bottom > bounds.bottom + 1
            ) {
              overflow = true
            }
          }
        }

        const chartPlot = module?.querySelector('[class*="financeChartPlot"]')
        const plotText = (chartPlot?.textContent ?? '').replace(/\s+/g, ' ').trim()
        const plotHasCurrency = /zł|\d[\d\s]*,\d{2}/.test(plotText)

        return {
          module: moduleRect
            ? {
                x: Math.round(moduleRect.x),
                y: Math.round(moduleRect.y),
                w: Math.round(moduleRect.width),
                h: Math.round(moduleRect.height),
              }
            : null,
          chartOpacity,
          ledgerOpacity,
          footRestOpacity,
          visibleBars: visibleBars.length,
          visibleMonths: visibleMonths.length,
          overflow,
          clipped: module ? module.scrollHeight > module.clientHeight + 1 : false,
          hasFootHover: footHover != null,
          barValueCount: barValues.length,
          plotHasCurrency,
        }
      })

      assert(settledState.module != null, `finanse hover box @ ${vw}x${vh}`)

      const restBox = restState
      const hoverBox = settledState.module!
      assertEq(hoverBox.x - restBox.x, 0, `finanse dx @ ${vw}x${vh}`)
      assertEq(hoverBox.y - restBox.y, 0, `finanse dy @ ${vw}x${vh}`)
      assertEq(hoverBox.w - restBox.w, 0, `finanse dw @ ${vw}x${vh}`)
      assertEq(hoverBox.h - restBox.h, 0, `finanse dh @ ${vw}x${vh}`)

      assert(settledState.chartOpacity > 0.9, `finanse chart visible settled @ ${vw}x${vh}`)
      assert(settledState.ledgerOpacity < 0.12, `finanse ledger hidden settled @ ${vw}x${vh}`)
      assert(settledState.footRestOpacity < 0.12, `finanse footer hidden settled @ ${vw}x${vh}`)
      assert(settledState.visibleBars === 8, `finanse eight bars visible @ ${vw}x${vh}`)
      assert(settledState.visibleMonths === 8, `finanse eight month labels visible @ ${vw}x${vh}`)
      assert(!settledState.overflow, `finanse chart inside instrument @ ${vw}x${vh}`)
      assert(!settledState.clipped, `finanse no outer clipping @ ${vw}x${vh}`)
      assert(!settledState.hasFootHover, `finanse no duplicate hover footer @ ${vw}x${vh}`)
      assertEq(settledState.barValueCount, 0, `finanse no bar values @ ${vw}x${vh}`)
      assert(!settledState.plotHasCurrency, `finanse no amounts in chart plot @ ${vw}x${vh}`)

      const siblingHover = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      for (const id of siblings) {
        const r = siblingRest[id]
        const h = siblingHover[id]
        assert(r != null && h != null, `sibling ${id} present @ ${vw}x${vh}`)
        assertEq(h.x - r.x, 0, `sibling ${id} dx @ ${vw}x${vh}`)
        assertEq(h.y - r.y, 0, `sibling ${id} dy @ ${vw}x${vh}`)
        assertEq(h.w - r.w, 0, `sibling ${id} dw @ ${vw}x${vh}`)
        assertEq(h.h - r.h, 0, `sibling ${id} dh @ ${vw}x${vh}`)
      }

      await page.mouse.move(0, 0)
      await page.waitForTimeout(200)
    }

    console.log('PASS  finanse hover geometry')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  finanse hover geometry (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testFinanseHoverGeometry()

async function testPakietyHoverGeometry() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1728, 1080],
    [1512, 982],
    [1440, 900],
    [1280, 800],
  ] as const
  const siblings = ['finanse', 'zadania', 'umowy'] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-feature="pakiety"]', { timeout: 5000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(250)
      await scrollFeatureModuleForHover(page, 'pakiety')

      const restState = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="pakiety"]')
        const moduleRect = module?.getBoundingClientRect()
        const rows = Array.from(module?.querySelectorAll('[class*="pkgStack"] > article') ?? [])
        const rowRects = rows.map((row) => {
          const r = row.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        })
        const detailLines = Array.from(module?.querySelectorAll('[class*="pkgDetailLine"]') ?? [])
        const allHiddenAtRest = detailLines.every((el) => parseFloat(getComputedStyle(el).opacity || '1') < 0.1)
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          rowRects,
          allHiddenAtRest,
        }
      })
      assert(restState.module != null, `pakiety rest box @ ${vw}x${vh}`)
      assert(restState.allHiddenAtRest, `pakiety details hidden at rest @ ${vw}x${vh}`)
      assertEq(restState.rowRects.length, 3, `pakiety three inner cards rest @ ${vw}x${vh}`)

      const siblingRest = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      const pakietyRestBox = await page.locator('[data-feature="pakiety"]').boundingBox()
      assert(pakietyRestBox != null, `pakiety rest box for hover @ ${vw}x${vh}`)
      await page.mouse.move(
        pakietyRestBox.x + pakietyRestBox.width / 2,
        pakietyRestBox.y + pakietyRestBox.height / 2,
      )
      await page.waitForTimeout(200)

      const midState = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="pakiety"]')
        const moduleRect = module?.getBoundingClientRect()
        const rows = Array.from(module?.querySelectorAll('[class*="pkgStack"] > article') ?? [])
        const rowRects = rows.map((row) => {
          const r = row.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        })
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          rowRects,
        }
      })
      assert(midState.module != null, `pakiety mid-hover box @ ${vw}x${vh}`)

      await page.waitForTimeout(350)
      const settledState = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="pakiety"]')
        const moduleRect = module?.getBoundingClientRect()
        const rows = Array.from(module?.querySelectorAll('[class*="pkgStack"] > article') ?? [])
        const rowRects = rows.map((row) => {
          const r = row.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        })
        const detailLines = Array.from(module?.querySelectorAll('[class*="pkgDetailLine"]') ?? [])
        const allVisible = detailLines.every((el) => parseFloat(getComputedStyle(el).opacity || '0') > 0.9)
        const prices = Array.from(module?.querySelectorAll('[class*="pkgPrice"]') ?? []).map((el) => (el.textContent ?? '').trim())
        const rects: Array<{ top: number; bottom: number }> = []
        module?.querySelectorAll('[class*="pkgRowMain"], [class*="pkgDetailLine"]').forEach((el) => {
          const r = el.getBoundingClientRect()
          if (parseFloat(getComputedStyle(el).opacity || '1') > 0.4) {
            rects.push({ top: r.top, bottom: r.bottom })
          }
        })
        let overlap = false
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i]
            const b = rects[j]
            if (a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap = true
          }
        }
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          rowRects,
          allVisible,
          prices,
          overlap,
          clipped: module ? module.scrollHeight > module.clientHeight + 1 : false,
        }
      })
      assert(settledState.module != null, `pakiety settled box @ ${vw}x${vh}`)

      const restBox = restState.module!
      for (const [label, box] of [
        ['mid', midState.module],
        ['settled', settledState.module],
      ] as const) {
        assertEq(box!.x - restBox.x, 0, `pakiety dx ${label} @ ${vw}x${vh}`)
        assertEq(box!.y - restBox.y, 0, `pakiety dy ${label} @ ${vw}x${vh}`)
        assertEq(box!.w - restBox.w, 0, `pakiety dw ${label} @ ${vw}x${vh}`)
        assertEq(box!.h - restBox.h, 0, `pakiety dh ${label} @ ${vw}x${vh}`)
      }

      for (let i = 0; i < 3; i++) {
        const restRow = restState.rowRects[i]
        for (const [label, rows] of [
          ['mid', midState.rowRects],
          ['settled', settledState.rowRects],
        ] as const) {
          const row = rows[i]
          assertEq(row.x - restRow.x, 0, `pakiety inner ${i} dx ${label} @ ${vw}x${vh}`)
          assertEq(row.y - restRow.y, 0, `pakiety inner ${i} dy ${label} @ ${vw}x${vh}`)
          assertEq(row.w - restRow.w, 0, `pakiety inner ${i} dw ${label} @ ${vw}x${vh}`)
          assertEq(row.h - restRow.h, 0, `pakiety inner ${i} dh ${label} @ ${vw}x${vh}`)
        }
      }

      assert(settledState.allVisible, `pakiety all detail lines visible settled @ ${vw}x${vh}`)
      assert(settledState.prices.includes('7 900 zł'), `pakiety podstawowy price stable @ ${vw}x${vh}`)
      assert(settledState.prices.includes('10 900 zł'), `pakiety standard price stable @ ${vw}x${vh}`)
      assert(settledState.prices.includes('14 900 zł'), `pakiety premium price stable @ ${vw}x${vh}`)
      assert(!settledState.overlap, `pakiety no text overlap @ ${vw}x${vh}`)
      assert(!settledState.clipped, `pakiety no clipping @ ${vw}x${vh}`)

      const siblingHover = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      for (const id of siblings) {
        const r = siblingRest[id]
        const h = siblingHover[id]
        assertEq(h.x - r.x, 0, `sibling ${id} dx @ ${vw}x${vh}`)
        assertEq(h.y - r.y, 0, `sibling ${id} dy @ ${vw}x${vh}`)
        assertEq(h.w - r.w, 0, `sibling ${id} dw @ ${vw}x${vh}`)
        assertEq(h.h - r.h, 0, `sibling ${id} dh @ ${vw}x${vh}`)
      }

      await page.mouse.move(0, 0)
      await page.waitForTimeout(200)
    }

    console.log('PASS  pakiety hover geometry')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  pakiety hover geometry (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testPakietyHoverGeometry()

async function testKalendarzHoverGeometry() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1728, 1080],
    [1512, 982],
    [1440, 900],
    [1280, 800],
  ] as const
  const siblings = ['sluby', 'sesje', 'ankiety'] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-feature="kalendarz"]', { timeout: 5000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(250)
      await scrollFeatureModuleForHover(page, 'kalendarz')

      const rest = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="kalendarz"]')
        const moduleRect = module?.getBoundingClientRect()
        const surface = module?.querySelector('[class*="objSurface"]')
        const surfaceRect = surface?.getBoundingClientRect()
        const augHead = module?.querySelector('[class*="calHeadAug"]')
        const sepHead = module?.querySelector('[class*="calHeadSep"]')
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          surface: surfaceRect
            ? { x: Math.round(surfaceRect.x), y: Math.round(surfaceRect.y), w: Math.round(surfaceRect.width), h: Math.round(surfaceRect.height) }
            : null,
          augustVisible: augHead ? parseFloat(getComputedStyle(augHead).opacity || '0') > 0.9 : false,
          septemberHidden: sepHead ? parseFloat(getComputedStyle(sepHead).opacity || '1') < 0.1 : false,
        }
      })
      assert(rest.module != null, `kalendarz rest box @ ${vw}x${vh}`)
      assert(rest.surface != null, `kalendarz inner surface rest @ ${vw}x${vh}`)
      assert(rest.augustVisible, `kalendarz august visible at rest @ ${vw}x${vh}`)
      assert(rest.septemberHidden, `kalendarz september hidden at rest @ ${vw}x${vh}`)

      const siblingRest = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      const kalendarzRestBox = await page.locator('[data-feature="kalendarz"]').boundingBox()
      assert(kalendarzRestBox != null, `kalendarz rest box for hover @ ${vw}x${vh}`)
      await page.mouse.move(
        kalendarzRestBox.x + kalendarzRestBox.width / 2,
        kalendarzRestBox.y + kalendarzRestBox.height / 2,
      )
      await page.waitForTimeout(300)

      const mid = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="kalendarz"]')
        const moduleRect = module?.getBoundingClientRect()
        return moduleRect
          ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
          : null
      })
      assert(mid != null, `kalendarz mid-hover box @ ${vw}x${vh}`)

      await page.waitForTimeout(400)

      const settled = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="kalendarz"]')
        const moduleRect = module?.getBoundingClientRect()
        const surface = module?.querySelector('[class*="objSurface"]')
        const surfaceRect = surface?.getBoundingClientRect()
        const sepHead = module?.querySelector('[class*="calHeadSep"]')
        const augEvents = Array.from(module?.querySelectorAll('[class*="calEventAug"]') ?? [])
        const sepEvents = Array.from(module?.querySelectorAll('[class*="calEventSep"]') ?? [])
        const visibleRects: Array<{ top: number; bottom: number; left: number; right: number }> = []
        module?.querySelectorAll('[class*="calEventBlock"]').forEach((el) => {
          if (parseFloat(getComputedStyle(el).opacity || '0') > 0.4) {
            const r = el.getBoundingClientRect()
            visibleRects.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })
          }
        })
        let overlap = false
        for (let i = 0; i < visibleRects.length; i++) {
          for (let j = i + 1; j < visibleRects.length; j++) {
            const a = visibleRects[i]
            const b = visibleRects[j]
            if (
              a.top < b.bottom - 1 &&
              b.top < a.bottom - 1 &&
              a.left < b.right - 1 &&
              b.left < a.right - 1
            ) {
              overlap = true
            }
          }
        }
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          surface: surfaceRect
            ? { x: Math.round(surfaceRect.x), y: Math.round(surfaceRect.y), w: Math.round(surfaceRect.width), h: Math.round(surfaceRect.height) }
            : null,
          septemberVisible: sepHead ? parseFloat(getComputedStyle(sepHead).opacity || '0') > 0.9 : false,
          augustHidden: augEvents.every((el) => parseFloat(getComputedStyle(el).opacity || '1') < 0.2),
          septemberVisibleEvents: sepEvents.filter((el) => parseFloat(getComputedStyle(el).opacity || '0') > 0.9).length,
          overlap,
          clipped: module ? module.scrollHeight > module.clientHeight + 1 : false,
          innerScroll: surface ? surface.scrollHeight > surface.clientHeight + 1 : false,
        }
      })
      assert(settled.module != null, `kalendarz settled box @ ${vw}x${vh}`)
      assert(settled.surface != null, `kalendarz inner surface settled @ ${vw}x${vh}`)

      const restBox = rest.module!
      for (const [label, box] of [
        ['mid', mid],
        ['settled', settled.module],
      ] as const) {
        assertEq(box!.x - restBox.x, 0, `kalendarz dx ${label} @ ${vw}x${vh}`)
        assertEq(box!.y - restBox.y, 0, `kalendarz dy ${label} @ ${vw}x${vh}`)
        assertEq(box!.w - restBox.w, 0, `kalendarz dw ${label} @ ${vw}x${vh}`)
        assertEq(box!.h - restBox.h, 0, `kalendarz dh ${label} @ ${vw}x${vh}`)
      }

      const restSurface = rest.surface!
      const settledSurface = settled.surface!
      assertEq(settledSurface.x - restSurface.x, 0, `kalendarz inner dx @ ${vw}x${vh}`)
      assertEq(settledSurface.y - restSurface.y, 0, `kalendarz inner dy @ ${vw}x${vh}`)
      assertEq(settledSurface.w - restSurface.w, 0, `kalendarz inner dw @ ${vw}x${vh}`)
      assertEq(settledSurface.h - restSurface.h, 0, `kalendarz inner dh @ ${vw}x${vh}`)

      assert(settled.septemberVisible, `kalendarz september heading settled @ ${vw}x${vh}`)
      assert(settled.augustHidden, `kalendarz august events hidden settled @ ${vw}x${vh}`)
      assertEq(settled.septemberVisibleEvents, 4, `kalendarz four september events @ ${vw}x${vh}`)
      assert(!settled.overlap, `kalendarz no event overlap @ ${vw}x${vh}`)
      assert(!settled.clipped, `kalendarz no outer clipping @ ${vw}x${vh}`)
      assert(!settled.innerScroll, `kalendarz no inner scrollbar @ ${vw}x${vh}`)

      const siblingHover = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      for (const id of siblings) {
        const r = siblingRest[id]
        const h = siblingHover[id]
        assertEq(h.x - r.x, 0, `sibling ${id} dx @ ${vw}x${vh}`)
        assertEq(h.y - r.y, 0, `sibling ${id} dy @ ${vw}x${vh}`)
        assertEq(h.w - r.w, 0, `sibling ${id} dw @ ${vw}x${vh}`)
        assertEq(h.h - r.h, 0, `sibling ${id} dh @ ${vw}x${vh}`)
      }

      await page.mouse.move(0, 0)
      await page.waitForTimeout(200)
    }

    console.log('PASS  kalendarz hover geometry')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  kalendarz hover geometry (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testKalendarzHoverGeometry()

async function testSesjeHoverGeometry() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1728, 1080],
    [1512, 982],
    [1440, 900],
    [1280, 800],
  ] as const
  const siblings = ['sluby', 'kalendarz', 'ankiety'] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-feature="sesje"]', { timeout: 5000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(250)
      await scrollFeatureModuleForHover(page, 'sesje')

      const rest = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="sesje"]')
        const moduleRect = module?.getBoundingClientRect()
        const timeline = module?.querySelector('[class*="sesTimeline"]')
        const timelineRect = timeline?.getBoundingClientRect()
        const restBlock = module?.querySelector('[class*="sesSessionRest"]')
        const hoverBlock = module?.querySelector('[class*="sesSessionHover"]')
        const restBlockRect = restBlock?.getBoundingClientRect()
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          timeline: timelineRect
            ? { x: Math.round(timelineRect.x), y: Math.round(timelineRect.y), w: Math.round(timelineRect.width), h: Math.round(timelineRect.height) }
            : null,
          restBlockW: restBlockRect ? Math.round(restBlockRect.width) : 0,
          restTimeVisible: module?.querySelector('[class*="sesTimeRest"]')
            ? parseFloat(getComputedStyle(module.querySelector('[class*="sesTimeRest"]')!).opacity || '0') > 0.9
            : false,
          hoverBlockHidden: hoverBlock
            ? parseFloat(getComputedStyle(hoverBlock).opacity || '1') < 0.1
            : false,
        }
      })
      assert(rest.module != null, `sesje rest box @ ${vw}x${vh}`)
      assert(rest.timeline != null, `sesje timeline rest @ ${vw}x${vh}`)
      assert(rest.restTimeVisible, `sesje rest time visible @ ${vw}x${vh}`)
      assert(rest.hoverBlockHidden, `sesje hover block hidden at rest @ ${vw}x${vh}`)

      const siblingRest = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      const sesjeRestBox = await page.locator('[data-feature="sesje"]').boundingBox()
      assert(sesjeRestBox != null, `sesje rest box for hover @ ${vw}x${vh}`)
      await page.mouse.move(
        sesjeRestBox.x + sesjeRestBox.width / 2,
        sesjeRestBox.y + sesjeRestBox.height / 2,
      )
      await page.waitForTimeout(300)

      const mid = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="sesje"]')
        const moduleRect = module?.getBoundingClientRect()
        const restBlock = module?.querySelector('[class*="sesSessionRest"]')
        const restBlockRect = restBlock?.getBoundingClientRect()
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          restBlockW: restBlockRect ? Math.round(restBlockRect.width) : 0,
        }
      })
      assert(mid.module != null, `sesje mid-hover box @ ${vw}x${vh}`)

      await page.waitForTimeout(350)

      const settled = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="sesje"]')
        const moduleRect = module?.getBoundingClientRect()
        const timeline = module?.querySelector('[class*="sesTimeline"]')
        const timelineRect = timeline?.getBoundingClientRect()
        const restBlock = module?.querySelector('[class*="sesSessionRest"]')
        const hoverBlock = module?.querySelector('[class*="sesSessionHover"]')
        const restBlockRect = restBlock?.getBoundingClientRect()
        const hoverBlockRect = hoverBlock?.getBoundingClientRect()
        const hoverTime = module?.querySelector('[class*="sesTimeHover"]')
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          timeline: timelineRect
            ? { x: Math.round(timelineRect.x), y: Math.round(timelineRect.y), w: Math.round(timelineRect.width), h: Math.round(timelineRect.height) }
            : null,
          restBlockW: restBlockRect ? Math.round(restBlockRect.width) : 0,
          hoverBlockW: hoverBlockRect ? Math.round(hoverBlockRect.width) : 0,
          hoverTimeVisible: hoverTime ? parseFloat(getComputedStyle(hoverTime).opacity || '0') > 0.9 : false,
          clipped: module ? module.scrollHeight > module.clientHeight + 1 : false,
          innerScroll: timeline ? timeline.scrollHeight > timeline.clientHeight + 1 : false,
        }
      })
      assert(settled.module != null, `sesje settled box @ ${vw}x${vh}`)
      assert(settled.timeline != null, `sesje timeline settled @ ${vw}x${vh}`)

      const restBox = rest.module!
      for (const [label, box] of [
        ['mid', mid.module],
        ['settled', settled.module],
      ] as const) {
        assertEq(box!.x - restBox.x, 0, `sesje dx ${label} @ ${vw}x${vh}`)
        assertEq(box!.y - restBox.y, 0, `sesje dy ${label} @ ${vw}x${vh}`)
        assertEq(box!.w - restBox.w, 0, `sesje dw ${label} @ ${vw}x${vh}`)
        assertEq(box!.h - restBox.h, 0, `sesje dh ${label} @ ${vw}x${vh}`)
      }

      const restTimeline = rest.timeline!
      const settledTimeline = settled.timeline!
      assertEq(settledTimeline.x - restTimeline.x, 0, `sesje timeline dx @ ${vw}x${vh}`)
      assertEq(settledTimeline.y - restTimeline.y, 0, `sesje timeline dy @ ${vw}x${vh}`)
      assertEq(settledTimeline.w - restTimeline.w, 0, `sesje timeline dw @ ${vw}x${vh}`)
      assertEq(settledTimeline.h - restTimeline.h, 0, `sesje timeline dh @ ${vw}x${vh}`)

      assertEq(settled.restBlockW, rest.restBlockW, `sesje session block width stable @ ${vw}x${vh}`)
      assertEq(settled.hoverBlockW, rest.restBlockW, `sesje hover block same width @ ${vw}x${vh}`)
      assertEq(mid.restBlockW, rest.restBlockW, `sesje session block width mid stable @ ${vw}x${vh}`)
      assert(settled.hoverTimeVisible, `sesje hover time visible settled @ ${vw}x${vh}`)
      assert(!settled.clipped, `sesje no outer clipping @ ${vw}x${vh}`)
      assert(!settled.innerScroll, `sesje no inner scrollbar @ ${vw}x${vh}`)

      const siblingHover = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      for (const id of siblings) {
        const r = siblingRest[id]
        const h = siblingHover[id]
        assertEq(h.x - r.x, 0, `sibling ${id} dx @ ${vw}x${vh}`)
        assertEq(h.y - r.y, 0, `sibling ${id} dy @ ${vw}x${vh}`)
        assertEq(h.w - r.w, 0, `sibling ${id} dw @ ${vw}x${vh}`)
        assertEq(h.h - r.h, 0, `sibling ${id} dh @ ${vw}x${vh}`)
      }

      await page.mouse.move(0, 0)
      await page.waitForTimeout(200)
    }

    console.log('PASS  sesje hover geometry')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  sesje hover geometry (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testSesjeHoverGeometry()

async function testAnkietyHoverGeometry() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1728, 1080],
    [1512, 982],
    [1440, 900],
    [1280, 800],
  ] as const
  const siblings = ['kalendarz', 'sesje', 'finanse'] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-feature="ankiety"]', { timeout: 5000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(250)
      await scrollFeatureModuleForHover(page, 'ankiety')

      const hoverCapable = await page.evaluate(
        () => window.matchMedia('(hover: hover) and (pointer: fine)').matches,
      )

      const rest = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="ankiety"]')
        const moduleRect = module?.getBoundingClientRect()
        const instrument = module?.querySelector('[class*="formInstrument"]')
        const instrumentRect = instrument?.getBoundingClientRect()
        const groups = Array.from(module?.querySelectorAll('[class*="formGroups"] > section') ?? [])
        const groupRects = groups.map((el) => {
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        })
        const slots = Array.from(
          module?.querySelectorAll('[class*="formAnswerSlot1"], [class*="formAnswerSlot2"]') ?? [],
        )
        const slotRects = slots.map((el) => {
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        })
        const progRest = module?.querySelector('[class*="formProgRest"]')
        const progRect = progRest?.getBoundingClientRect()
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          instrument: instrumentRect
            ? { x: Math.round(instrumentRect.x), y: Math.round(instrumentRect.y), w: Math.round(instrumentRect.width), h: Math.round(instrumentRect.height) }
            : null,
          groupRects,
          slotRects,
          progRight: progRect ? Math.round(progRect.right) : 0,
          missingVisible: module?.querySelector('[class*="formMissingRest"]')
            ? parseFloat(getComputedStyle(module.querySelector('[class*="formMissingRest"]')!).opacity || '0') > 0.9
            : false,
          slotsHidden: slots.every((el) => parseFloat(getComputedStyle(el).opacity || '1') < 0.1),
        }
      })
      assert(rest.module != null, `ankiety rest box @ ${vw}x${vh}`)
      assert(rest.instrument != null, `ankiety instrument rest @ ${vw}x${vh}`)
      assert(rest.missingVisible, `ankiety missing label visible @ ${vw}x${vh}`)
      if (hoverCapable) {
        assert(rest.slotsHidden, `ankiety answer slots hidden at rest @ ${vw}x${vh}`)
      }
      assertEq(rest.groupRects.length, 3, `ankiety three primary cards @ ${vw}x${vh}`)
      assertEq(rest.slotRects.length, 2, `ankiety two answer slots @ ${vw}x${vh}`)

      const siblingRest = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      const ankietyRestBox = await page.locator('[data-feature="ankiety"]').boundingBox()
      assert(ankietyRestBox != null, `ankiety rest box for hover @ ${vw}x${vh}`)
      await page.mouse.move(
        ankietyRestBox.x + ankietyRestBox.width / 2,
        ankietyRestBox.y + ankietyRestBox.height / 2,
      )
      await page.waitForTimeout(250)

      const mid = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="ankiety"]')
        const moduleRect = module?.getBoundingClientRect()
        return moduleRect
          ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
          : null
      })
      assert(mid != null, `ankiety mid-hover box @ ${vw}x${vh}`)

      await page.waitForTimeout(400)

      const settled = await page.evaluate(() => {
        const module = document.querySelector('[data-feature="ankiety"]')
        const moduleRect = module?.getBoundingClientRect()
        const instrument = module?.querySelector('[class*="formInstrument"]')
        const instrumentRect = instrument?.getBoundingClientRect()
        const groups = Array.from(module?.querySelectorAll('[class*="formGroups"] > section') ?? [])
        const groupRects = groups.map((el) => {
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        })
        const slots = Array.from(
          module?.querySelectorAll('[class*="formAnswerSlot1"], [class*="formAnswerSlot2"]') ?? [],
        )
        const slotVisible = slots.filter((el) => parseFloat(getComputedStyle(el).opacity || '0') > 0.9)
        const progHover = module?.querySelector('[class*="formProgHover"]')
        const progRect = progHover?.getBoundingClientRect()
        return {
          module: moduleRect
            ? { x: Math.round(moduleRect.x), y: Math.round(moduleRect.y), w: Math.round(moduleRect.width), h: Math.round(moduleRect.height) }
            : null,
          instrument: instrumentRect
            ? { x: Math.round(instrumentRect.x), y: Math.round(instrumentRect.y), w: Math.round(instrumentRect.width), h: Math.round(instrumentRect.height) }
            : null,
          groupRects,
          progRight: progRect ? Math.round(progRect.right) : 0,
          slotsVisible: slotVisible.length,
          hoverProgVisible: progHover ? parseFloat(getComputedStyle(progHover).opacity || '0') > 0.9 : false,
          clipped: module ? module.scrollHeight > module.clientHeight + 1 : false,
        }
      })
      assert(settled.module != null, `ankiety settled box @ ${vw}x${vh}`)
      assert(settled.instrument != null, `ankiety instrument settled @ ${vw}x${vh}`)

      const restBox = rest.module!
      for (const [label, box] of [
        ['mid', mid],
        ['settled', settled.module],
      ] as const) {
        assertEq(box!.x - restBox.x, 0, `ankiety dx ${label} @ ${vw}x${vh}`)
        assertEq(box!.y - restBox.y, 0, `ankiety dy ${label} @ ${vw}x${vh}`)
        assertEq(box!.w - restBox.w, 0, `ankiety dw ${label} @ ${vw}x${vh}`)
        assertEq(box!.h - restBox.h, 0, `ankiety dh ${label} @ ${vw}x${vh}`)
      }

      const restInstrument = rest.instrument!
      const settledInstrument = settled.instrument!
      assertEq(settledInstrument.x - restInstrument.x, 0, `ankiety instrument dx @ ${vw}x${vh}`)
      assertEq(settledInstrument.y - restInstrument.y, 0, `ankiety instrument dy @ ${vw}x${vh}`)
      assertEq(settledInstrument.w - restInstrument.w, 0, `ankiety instrument dw @ ${vw}x${vh}`)
      assertEq(settledInstrument.h - restInstrument.h, 0, `ankiety instrument dh @ ${vw}x${vh}`)

      for (let i = 0; i < 3; i++) {
        const r = rest.groupRects[i]
        const s = settled.groupRects[i]
        assertEq(s.x - r.x, 0, `ankiety primary ${i} dx @ ${vw}x${vh}`)
        assertEq(s.y - r.y, 0, `ankiety primary ${i} dy @ ${vw}x${vh}`)
        assertEq(s.w - r.w, 0, `ankiety primary ${i} dw @ ${vw}x${vh}`)
        assertEq(s.h - r.h, 0, `ankiety primary ${i} dh @ ${vw}x${vh}`)
      }

      for (let i = 0; i < 2; i++) {
        const r = rest.slotRects[i]
        const sEl = await page.evaluate((idx) => {
          const sel = idx === 0 ? '[class*="formAnswerSlot1"]' : '[class*="formAnswerSlot2"]'
          const el = document.querySelector(`[data-feature="ankiety"] ${sel}`)
          const rect = el?.getBoundingClientRect()
          return rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null
        }, i)
        assert(sEl != null, `ankiety slot ${i} settled @ ${vw}x${vh}`)
        assertEq(sEl!.x - r.x, 0, `ankiety slot ${i} dx @ ${vw}x${vh}`)
        assertEq(sEl!.y - r.y, 0, `ankiety slot ${i} dy @ ${vw}x${vh}`)
        assertEq(sEl!.w - r.w, 0, `ankiety slot ${i} dw @ ${vw}x${vh}`)
        assertEq(sEl!.h - r.h, 0, `ankiety slot ${i} dh @ ${vw}x${vh}`)
      }

      assertEq(settled.progRight, rest.progRight, `ankiety counter anchor @ ${vw}x${vh}`)
      assertEq(settled.slotsVisible, 2, `ankiety both answer slots visible @ ${vw}x${vh}`)
      assert(settled.hoverProgVisible, `ankiety 14/14 counter visible @ ${vw}x${vh}`)
      assert(!settled.clipped, `ankiety no clipping @ ${vw}x${vh}`)

      const siblingHover = await page.evaluate((ids) => {
        const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
        for (const id of ids) {
          const r = document.querySelector(`[data-feature="${id}"]`)?.getBoundingClientRect()
          if (r) out[id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        }
        return out
      }, siblings)

      for (const id of siblings) {
        const r = siblingRest[id]
        const h = siblingHover[id]
        assertEq(h.x - r.x, 0, `sibling ${id} dx @ ${vw}x${vh}`)
        assertEq(h.y - r.y, 0, `sibling ${id} dy @ ${vw}x${vh}`)
        assertEq(h.w - r.w, 0, `sibling ${id} dw @ ${vw}x${vh}`)
        assertEq(h.h - r.h, 0, `sibling ${id} dh @ ${vw}x${vh}`)
      }

      await page.mouse.move(0, 0)
      await page.waitForTimeout(200)
    }

    console.log('PASS  ankiety hover geometry')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  ankiety hover geometry (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testAnkietyHoverGeometry()

async function scrollLifecycleProgress(page: import('playwright').Page, target: number) {
  for (let i = 0; i < 28; i++) {
    const state = await page.evaluate((targetProgress) => {
      const track = document.querySelector('[data-testid="lv2-lifecycle-story"]') as HTMLElement | null
      if (!track) return { done: true, progress: 0 }
      const navH =
        parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) ||
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lv3-nav-h')) ||
        68
      const rect = track.getBoundingClientRect()
      const travel = Math.max(1, track.offsetHeight - (window.innerHeight - navH))
      const progress =
        rect.top > navH + 0.5 ? 0 : Math.min(1, Math.max(0, (navH - rect.top) / travel))
      if (Math.abs(progress - targetProgress) < 0.012) {
        return { done: true, progress }
      }
      const desiredTop = navH - targetProgress * travel
      const delta = rect.top - desiredTop
      window.scrollBy(0, delta)
      return { done: false, progress }
    }, target)
    if (state.done) break
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(350)
}

async function readLifecycleProgress(page: import('playwright').Page) {
  return page.evaluate(() => {
    const sticky = document.querySelector('[data-lifecycle-sticky]') as HTMLElement | null
    return parseFloat(sticky?.getAttribute('data-lifecycle-progress') || '0')
  })
}

async function testLifecycleFeaturesHandoff() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1728, 1080],
    [1512, 982],
    [1440, 900],
  ] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-testid="lv2-lifecycle-story"]', { timeout: 8000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(200)

      await scrollLifecycleProgress(page, 0.99)
      const finalP = await readLifecycleProgress(page)
      const finalState = await page.evaluate(() => {
        const theater = document.querySelector('[data-lifecycle-theater-slot]') as HTMLElement | null
        const workspace = document.querySelector('[data-workflow-explorer]') as HTMLElement | null
        const exitShell = document.querySelector('[data-lv2-features-exit]') as HTMLElement | null
        const lifecycleSticky = document.querySelector('[data-lifecycle-sticky]') as HTMLElement | null
        const theaterOp = theater ? parseFloat(getComputedStyle(theater).opacity || '1') : 0
        const shellZ = exitShell ? parseInt(getComputedStyle(exitShell).zIndex || '0', 10) : 0
        const lifecycleZ = lifecycleSticky ? parseInt(getComputedStyle(lifecycleSticky).zIndex || '0', 10) : 0
        const shellBg = exitShell ? getComputedStyle(exitShell).backgroundColor : 'transparent'
        return {
          theaterOp,
          hasWorkspace: workspace != null,
          umowaSelected:
            workspace?.querySelector('[data-workflow-tab="contract"][data-active="true"]') != null,
          shellZ,
          lifecycleZ,
          shellTransparent:
            shellBg === 'rgba(0, 0, 0, 0)' || shellBg === 'transparent',
        }
      })

      assert(finalState.theaterOp >= 0.98, `lifecycle theater readable @ ${vw}x${vh} p=${finalP.toFixed(3)}`)
      assert(finalState.hasWorkspace, `workflow explorer present @ ${vw}x${vh}`)
      assert(finalState.umowaSelected, `Umowa default active @ ${vw}x${vh}`)
      assert(finalState.lifecycleZ > finalState.shellZ, `lifecycle z-index above features shell @ ${vw}x${vh}`)
      assert(finalState.shellTransparent, `features exit shell transparent @ ${vw}x${vh}`)

      await scrollLifecycleProgress(page, 0.99)
      await scrollLifecycleProgress(page, 0.55)
      const reverseP = await readLifecycleProgress(page)
      const reverse = await page.evaluate(() => {
        const theater = document.querySelector('[data-lifecycle-theater-slot]') as HTMLElement | null
        const link = document.querySelector('[data-lifecycle-link]') as HTMLElement | null
        return {
          lifecycleOp: theater ? parseFloat(getComputedStyle(theater).opacity || '1') : 0,
          hasLink: link != null,
        }
      })
      assert(reverse.lifecycleOp >= 0.9, `reverse lifecycle reconstruct @ ${vw}x${vh} p=${reverseP.toFixed(3)}`)
      assert(reverse.hasLink, `link pill reconstructs on reverse @ ${vw}x${vh}`)
    }

    assert(sceneExitOpacityAt(0.5) === 1, 'soft scene exit removed — opacity stays 1')
    assert(sceneExitOpacityAt(0.99) === 1, 'soft scene exit removed — opacity stays 1 near end')

    console.log('PASS  lifecycle features handoff')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  lifecycle features handoff (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testLifecycleFeaturesHandoff()

async function scrollMobileStoryProgress(page: import('playwright').Page, target: number) {
  for (let i = 0; i < 28; i++) {
    const state = await page.evaluate((targetProgress) => {
      const track = document.querySelector('[data-testid="lv2-mobile-story"]') as HTMLElement | null
      if (!track) return { done: true, progress: 0 }
      const navH =
        parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) ||
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lv3-nav-h')) ||
        68
      const cs = getComputedStyle(track)
      const preSvh = parseFloat(cs.getPropertyValue('--mobile-track-pre-svh')) || 260
      const dashSvh = parseFloat(cs.getPropertyValue('--mobile-track-dash-svh')) || 120
      const postSvh = parseFloat(cs.getPropertyValue('--mobile-track-post-svh')) || 300
      const postBriefSvh = parseFloat(cs.getPropertyValue('--mobile-track-post-brief-svh')) || 112
      const studioSvh = parseFloat(cs.getPropertyValue('--mobile-track-studio-history-svh')) || 0
      const importSvh = parseFloat(cs.getPropertyValue('--mobile-track-season-import-svh')) || 0
      const founderSvh = parseFloat(cs.getPropertyValue('--mobile-track-import-cover-hold-svh') || cs.getPropertyValue('--mobile-track-founder-svh')) || 0
      const mappingSvh = preSvh + dashSvh + postSvh + postBriefSvh
      const totalSvh = mappingSvh + studioSvh + importSvh + founderSvh
      const usable = window.innerHeight - navH
      const rect = track.getBoundingClientRect()
      const mappingHeight = track.offsetHeight * (mappingSvh / totalSvh)
      const preHeight = mappingHeight * (preSvh / mappingSvh)
      const preTravel = Math.max(1, preHeight - usable)
      const scrollDist =
        rect.top > navH + 0.5 ? 0 : Math.min(1e9, Math.max(0, navH - rect.top))
      const progress = Math.min(1, scrollDist / preTravel)
      if (Math.abs(progress - targetProgress) < 0.015) {
        return { done: true, progress }
      }
      const desiredTop = navH - targetProgress * preTravel
      const delta = rect.top - desiredTop
      window.scrollBy(0, delta)
      return { done: false, progress }
    }, target)
    if (state.done) break
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(350)
}

async function scrollMobileAppProgress(page: import('playwright').Page, target: number) {
  const budgets = {
    dayEndHold: DAY_END_HOLD_OUTER_PX,
    navEnter: NAV_ENTER_OUTER_PX,
    navRest: NAV_REST_OUTER_PX,
    navTravel: NAV_TRAVEL_OUTER_PX,
    navArrival: NAV_ARRIVAL_OUTER_PX,
    briefEnter: BRIEF_ENTER_OUTER_PX,
    briefSettle: BRIEF_SETTLE_OUTER_PX,
    ranges: {
      handoffEnd: MOBILE_APP_RANGES.handoff.end,
      dayHoldStart: MOBILE_APP_RANGES.dayHold.start,
      dayHoldEnd: MOBILE_APP_RANGES.dayHold.end,
      dayScrollStart: MOBILE_APP_RANGES.dayScroll.start,
      dayScrollEnd: MOBILE_APP_RANGES.dayScroll.end,
      dayEndHoldStart: MOBILE_APP_RANGES.dayEndHold.start,
      dayEndHoldEnd: MOBILE_APP_RANGES.dayEndHold.end,
      mapInStart: MOBILE_APP_RANGES.mapIn.start,
      mapInEnd: MOBILE_APP_RANGES.mapIn.end,
      navRestStart: MOBILE_APP_RANGES.navRest.start,
      navRestEnd: MOBILE_APP_RANGES.navRest.end,
      routeStart: MOBILE_APP_RANGES.routeTravel.start,
      routeEnd: MOBILE_APP_RANGES.routeTravel.end,
      arriveStart: MOBILE_APP_RANGES.arriveHold.start,
      arriveEnd: MOBILE_APP_RANGES.arriveHold.end,
      briefEnterStart: MOBILE_APP_RANGES.briefEnter.start,
      briefEnterEnd: MOBILE_APP_RANGES.briefEnter.end,
      briefHoldStart: MOBILE_APP_RANGES.briefHold.start,
    },
  }
  const scrollFn = new Function(
    'payload',
    `const targetApp = payload.targetApp;
const b = payload.budgets;
const track = document.querySelector('[data-testid="lv2-mobile-story"]');
if (!track) return { done: true, app: 0 };
const navH =
  parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) ||
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lv3-nav-h')) ||
  68;
const cs = getComputedStyle(track);
const preSvh = parseFloat(cs.getPropertyValue('--mobile-track-pre-svh')) || 260;
const dashSvh = parseFloat(cs.getPropertyValue('--mobile-track-dash-svh')) || 120;
const postSvh = parseFloat(cs.getPropertyValue('--mobile-track-post-svh')) || 300;
const postBriefSvh = parseFloat(cs.getPropertyValue('--mobile-track-post-brief-svh')) || 112;
const studioSvh = parseFloat(cs.getPropertyValue('--mobile-track-studio-history-svh')) || 0;
const importSvh = parseFloat(cs.getPropertyValue('--mobile-track-season-import-svh')) || 0;
const founderSvh = parseFloat(cs.getPropertyValue('--mobile-track-import-cover-hold-svh') || cs.getPropertyValue('--mobile-track-founder-svh')) || 0;
const contentSvh = preSvh + dashSvh + postSvh;
const mappingSvh = contentSvh + postBriefSvh;
const totalSvh = mappingSvh + studioSvh + importSvh + founderSvh;
const usable = window.innerHeight - navH;
const rect = track.getBoundingClientRect();
const mappingHeight = track.offsetHeight * (mappingSvh / totalSvh);
const mappingTravel = Math.max(1, mappingHeight - usable);
const contentTravel = Math.max(1, mappingTravel * (contentSvh / mappingSvh));
const preHeight = mappingHeight * (preSvh / mappingSvh);
const preTravel = Math.max(1, preHeight - usable);
const settleDist = preTravel * 0.74;
const viewport = document.querySelector('[data-mobile-dashboard-viewport]');
const dashMax = parseFloat((viewport && viewport.dataset.dashboardMaxScroll) || '0');
const dayMax = parseFloat((viewport && viewport.dataset.weddingDayMaxScroll) || '0');
const handoffEnd = b.ranges.handoffEnd;
const scrollShare = (0.52 - 0.03) / handoffEnd;
const dashPhaseOuter =
  dashMax > 0 ? dashMax / Math.max(0.35, scrollShare) : (dashSvh / 100) * window.innerHeight;
const dayScrollOuter = Math.max(1, dayMax > 0 ? dayMax : 120);
const dayTopSettle = 8;
const scrollDist =
  rect.top > navH + 0.5 ? 0 : Math.min(contentTravel, Math.max(0, navH - rect.top));
const lerp = function (a, c, t) { return a + Math.min(1, Math.max(0, t)) * (c - a); };
const r = b.ranges;
let app = 0;
if (scrollDist > settleDist) {
  const afterSettle = scrollDist - settleDist;
  const dashSpan = Math.max(1, dashPhaseOuter);
  if (afterSettle <= dashSpan) {
    app = (afterSettle / dashSpan) * handoffEnd;
  } else {
    let rem = afterSettle - dashSpan;
    if (rem <= dayTopSettle) {
      app = lerp(r.dayHoldStart, r.dayHoldEnd, rem / dayTopSettle);
    } else {
      rem -= dayTopSettle;
      if (rem <= dayScrollOuter) {
        app = lerp(r.dayScrollStart, r.dayScrollEnd, rem / dayScrollOuter);
      } else {
        rem -= dayScrollOuter;
        if (rem <= b.dayEndHold) {
          app = lerp(r.dayEndHoldStart, r.dayEndHoldEnd, rem / b.dayEndHold);
        } else {
          rem -= b.dayEndHold;
          if (rem <= b.navEnter) {
            app = lerp(r.mapInStart, r.mapInEnd, rem / b.navEnter);
          } else {
            rem -= b.navEnter;
            if (rem <= b.navRest) {
              app = lerp(r.navRestStart, r.navRestEnd, rem / b.navRest);
            } else {
              rem -= b.navRest;
              if (rem <= b.navTravel) {
                app = lerp(r.routeStart, r.routeEnd, rem / b.navTravel);
              } else {
                rem -= b.navTravel;
                if (rem <= b.navArrival) {
                  app = lerp(r.arriveStart, r.arriveEnd, rem / b.navArrival);
                } else {
                  rem -= b.navArrival;
                  if (rem <= b.briefEnter) {
                    app = lerp(r.briefEnterStart, r.briefEnterEnd, rem / b.briefEnter);
                  } else {
                    rem -= b.briefEnter;
                    app = lerp(r.briefHoldStart, 1, rem / Math.max(1, b.briefSettle));
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
const stickyEl = document.querySelector('[data-mobile-owned]');
const stickyApp = parseFloat((stickyEl && stickyEl.getAttribute('data-mobile-app-progress')) || '0');
const liveApp = Number.isFinite(stickyApp) ? stickyApp : app;
if (Math.abs(liveApp - targetApp) < 0.01 || (targetApp >= 0.995 && liveApp >= 0.99)) {
  return { done: true, app: liveApp };
}
if (targetApp >= 0.99) {
  const desiredTop = navH - contentTravel;
  window.scrollBy(0, rect.top - desiredTop);
  return { done: false, app: liveApp };
}
let desiredDist;
const dashSpan = Math.max(1, dashPhaseOuter);
const baseAfterDash = settleDist + dashSpan + dayTopSettle + dayScrollOuter + b.dayEndHold + b.navEnter + b.navRest + b.navTravel;
if (targetApp <= handoffEnd) {
  desiredDist = settleDist + (targetApp / handoffEnd) * dashSpan;
} else if (targetApp <= r.dayHoldEnd) {
  const t = (targetApp - r.dayHoldStart) / Math.max(1e-6, r.dayHoldEnd - r.dayHoldStart);
  desiredDist = settleDist + dashSpan + t * dayTopSettle;
} else if (targetApp <= r.dayScrollEnd) {
  const t = (targetApp - r.dayScrollStart) / Math.max(1e-6, r.dayScrollEnd - r.dayScrollStart);
  desiredDist = settleDist + dashSpan + dayTopSettle + t * dayScrollOuter;
} else if (targetApp <= r.dayEndHoldEnd) {
  const t = (targetApp - r.dayEndHoldStart) / Math.max(1e-6, r.dayEndHoldEnd - r.dayEndHoldStart);
  desiredDist = settleDist + dashSpan + dayTopSettle + dayScrollOuter + t * b.dayEndHold;
} else if (targetApp <= r.mapInEnd) {
  const t = (targetApp - r.mapInStart) / Math.max(1e-6, r.mapInEnd - r.mapInStart);
  desiredDist = settleDist + dashSpan + dayTopSettle + dayScrollOuter + b.dayEndHold + t * b.navEnter;
} else if (targetApp <= r.navRestEnd) {
  const t = (targetApp - r.navRestStart) / Math.max(1e-6, r.navRestEnd - r.navRestStart);
  desiredDist = settleDist + dashSpan + dayTopSettle + dayScrollOuter + b.dayEndHold + b.navEnter + t * b.navRest;
} else if (targetApp <= r.routeEnd) {
  const t = (targetApp - r.routeStart) / Math.max(1e-6, r.routeEnd - r.routeStart);
  desiredDist = settleDist + dashSpan + dayTopSettle + dayScrollOuter + b.dayEndHold + b.navEnter + b.navRest + t * b.navTravel;
} else if (targetApp <= r.arriveEnd) {
  const t = (targetApp - r.arriveStart) / Math.max(1e-6, r.arriveEnd - r.arriveStart);
  desiredDist = baseAfterDash + t * b.navArrival;
} else if (targetApp <= r.briefEnterEnd) {
  const t = (targetApp - r.briefEnterStart) / Math.max(1e-6, r.briefEnterEnd - r.briefEnterStart);
  desiredDist = baseAfterDash + b.navArrival + t * b.briefEnter;
} else {
  const t = (targetApp - r.briefHoldStart) / Math.max(1e-6, 1 - r.briefHoldStart);
  desiredDist = baseAfterDash + b.navArrival + b.briefEnter + t * Math.max(1, b.briefSettle);
}
const desiredTop = navH - desiredDist;
window.scrollBy(0, rect.top - desiredTop);
return { done: false, app: liveApp };`,
  ) as (payload: { targetApp: number; budgets: typeof budgets }) => {
    done: boolean
    app: number
  }

  for (let i = 0; i < 56; i++) {
    const state = await page.evaluate(scrollFn, { targetApp: target, budgets })
    if (state.done) break
    await page.waitForTimeout(70)
  }
  await page.waitForTimeout(280)
}

async function readMobileProgress(page: import('playwright').Page) {
  return page.evaluate(() => {
    const sticky = document.querySelector('[data-mobile-owned]') as HTMLElement | null
    return parseFloat(sticky?.getAttribute('data-mobile-progress') || '0')
  })
}

async function testMobileStoryPhoneGeometry() {
  const { chromium } = await import('playwright')
  const viewports = [
    [1920, 1080],
    [1728, 1080],
    [1512, 982],
    [1440, 900],
    [1366, 768],
    [1280, 800],
  ] as const

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-testid="lv2-mobile-story"]', { timeout: 8000 })

    for (const [vw, vh] of viewports) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(200)

      for (const sampleP of [0.08, 0.12, 0.16, 0.2, 0.24, 0.28]) {
        await scrollMobileStoryProgress(page, sampleP)
        const progress = await readMobileProgress(page)
        const fOp = featuresOpacityAt(progress)
        const hOp = headlineCompositeOpacityAt(progress)
        assert(
          !isHandoffDeadZone(fOp, hOp),
          `no dead zone p≈${sampleP} actual=${progress.toFixed(3)} f=${fOp.toFixed(2)} h=${hOp.toFixed(2)} @ ${vw}x${vh}`,
        )
      }

      await scrollMobileStoryProgress(page, 0.22)
      const overlapP = await readMobileProgress(page)
      const overlapFOp = featuresOpacityAt(overlapP)
      const overlapHOp = headlineCompositeOpacityAt(overlapP)
      assert(overlapFOp > 0.4, `features visible in overlap @ ${vw}x${vh} p=${overlapP.toFixed(3)} f=${overlapFOp.toFixed(2)}`)
      assert(overlapHOp > 0.5, `headline visible in overlap @ ${vw}x${vh} p=${overlapP.toFixed(3)} h=${overlapHOp.toFixed(2)}`)

      await scrollMobileStoryProgress(page, 0.36)
      const splitP = await readMobileProgress(page)
      const splitY = headlineSepYAt(splitP)
      assert(splitY > 5, `headline separating by p≈0.36 @ ${vw}x${vh} y=${splitY.toFixed(1)}`)

      await scrollMobileStoryProgress(page, 0.3)
      const holdP = await readMobileProgress(page)
      assert(headlineCompositeOpacityAt(holdP) > 0.9, `headline hold progress @ ${vw}x${vh} p=${holdP.toFixed(3)}`)
      const headlineHold = await page.evaluate(() => {
        const lines = Array.from(document.querySelectorAll('[data-mobile-headline] [class*="headlineLine"]'))
        const line = lines[0] as HTMLElement | undefined
        const texts = lines.map((el) => (el.textContent ?? '').trim())
        const nowrap =
          lines.length > 0 &&
          lines.every((el) => getComputedStyle(el).whiteSpace === 'nowrap')
        const stage = document.querySelector('[data-mobile-stage-center]')?.getBoundingClientRect()
        const headline = document.querySelector('[data-mobile-headline]')?.getBoundingClientRect()
        const stageCx = stage ? stage.left + stage.width / 2 : 0
        const stageCy = stage ? stage.top + stage.height / 2 : 0
        const headCx = headline ? headline.left + headline.width / 2 : 0
        const headCy = headline ? headline.top + headline.height / 2 : 0
        const lineCenters = lines.map((el) => {
          const r = el.getBoundingClientRect()
          return Math.abs(r.left + r.width / 2 - stageCx)
        })
        const wrapCounts = lines.map((el) => el.getClientRects().length)
        return {
          sharp: line ? parseFloat(getComputedStyle(line).opacity || '0') > 0.05 : false,
          lineCount: lines.length,
          texts,
          nowrap,
          wrapCounts,
          line1CxDev: lineCenters[0] ?? 99,
          line2CxDev: lineCenters[1] ?? 99,
          headCxDev: Math.abs(headCx - stageCx),
          headCyDev: Math.abs(headCy - stageCy),
        }
      })
      assertEq(headlineHold.lineCount, 2, `two headline lines @ ${vw}x${vh}`)
      assert(headlineHold.texts[0]?.includes('Wszystko zostaje z Tobą.'), `headline line 1 text @ ${vw}x${vh}`)
      assert(headlineHold.texts[1]?.includes('Gdziekolwiek pracujesz.'), `headline line 2 text @ ${vw}x${vh}`)
      if (vw >= 1280) {
        assert(headlineHold.nowrap, `headline nowrap @ ${vw}x${vh}`)
        assertEq(headlineHold.wrapCounts[0], 1, `line 1 one visual line @ ${vw}x${vh}`)
        assertEq(headlineHold.wrapCounts[1], 1, `line 2 one visual line @ ${vw}x${vh}`)
      }
      assert(headlineHold.line1CxDev <= 2, `line 1 center X @ ${vw}x${vh} dev ${headlineHold.line1CxDev}`)
      assert(headlineHold.line2CxDev <= 2, `line 2 center X @ ${vw}x${vh} dev ${headlineHold.line2CxDev}`)
      assert(headlineHold.headCxDev <= 2, `headline stage center X @ ${vw}x${vh} dev ${headlineHold.headCxDev}`)
      assert(headlineHold.headCyDev <= 3, `headline stage center Y @ ${vw}x${vh} dev ${headlineHold.headCyDev}`)

      await scrollMobileStoryProgress(page, 0.92)
      const settled = await page.evaluate(() => {
        const sticky = document.querySelector('[data-mobile-device-settled="true"]')
        const jak = document.getElementById('jak-dziala')
        const pricing = document.getElementById('cennik')
        const phone = document.querySelector('[data-testid="lv2-mobile-phone"]') as HTMLElement | null
        const chassis = phone?.querySelector('[data-phone-chassis]') ?? phone
        const rect = (chassis as HTMLElement | null)?.getBoundingClientRect()
        const stage = document.querySelector('[data-mobile-stage-center]')?.getBoundingClientRect()
        const headlineLine = document.querySelector('[data-mobile-headline] [class*="headlineLine"]') as HTMLElement | null
        const exitShell = document.querySelector('[data-lv2-features-exit]') as HTMLElement | null
        const navH =
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lv3-nav-h')) || 68
        const jakRect = jak?.getBoundingClientRect()
        const pricingRect = pricing?.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const ratioDev = rect ? Math.abs(rect.width / rect.height - 430 / 932) / (430 / 932) : 1
        const stageCx = stage ? stage.left + stage.width / 2 : vw / 2
        const stageCy = stage ? stage.top + stage.height / 2 : navH + (vh - navH) / 2
        const phoneCx = rect ? rect.left + rect.width / 2 : 0
        const phoneCy = rect ? rect.top + rect.height / 2 : 0
        const shellBg = exitShell ? getComputedStyle(exitShell).backgroundColor : 'transparent'
        return {
          settled: sticky != null,
          ratioDev,
          phoneCxDev: Math.abs(phoneCx - stageCx),
          phoneCyDev: Math.abs(phoneCy - stageCy),
          headlineOp: headlineLine ? parseFloat(getComputedStyle(headlineLine).opacity || '0') : 0,
          shellTransparent:
            shellBg === 'rgba(0, 0, 0, 0)' || shellBg === 'transparent',
          fullyVisible: rect
            ? rect.top >= navH - 2 && rect.bottom <= vh + 2 && rect.left >= -2 && rect.right <= vw + 2
            : false,
          featuresPast: jakRect ? jakRect.bottom <= navH + 8 : true,
          pricingBelow: pricingRect ? pricingRect.top >= vh - 4 : true,
          overflowX: document.documentElement.scrollWidth > vw + 1,
          phoneW: rect?.width ?? 0,
          phoneH: rect?.height ?? 0,
        }
      })

      assert(settled.settled, `phone settled marker @ ${vw}x${vh}`)
      assert(settled.headlineOp <= 0.02, `headline gone at settled phone @ ${vw}x${vh} op=${settled.headlineOp}`)
      assert(settled.shellTransparent, `features exit shell transparent @ ${vw}x${vh}`)
      assert(settled.ratioDev <= 0.0015, `phone aspect ratio @ ${vw}x${vh} dev ${settled.ratioDev}`)
      assert(settled.phoneCxDev <= 2, `phone stage center X @ ${vw}x${vh} dev ${settled.phoneCxDev}`)
      assert(settled.phoneCyDev <= 3, `phone stage center Y @ ${vw}x${vh} dev ${settled.phoneCyDev}`)
      assert(settled.fullyVisible, `phone in viewport @ ${vw}x${vh}`)
      assert(settled.featuresPast, `features (jak-dziala) scrolled past @ ${vw}x${vh}`)
      assert(settled.pricingBelow, `pricing still below viewport @ ${vw}x${vh}`)
      assert(!settled.overflowX, `no horizontal overflow @ ${vw}x${vh}`)

      for (const holdP of [0.75, 0.82, 0.9, 1.0]) {
        await scrollMobileStoryProgress(page, holdP)
        const actualP = await readMobileProgress(page)
        assert(
          headlineCompositeOpacityAt(actualP) <= 0.02,
          `phone-only hold headline gone p≈${holdP} actual=${actualP.toFixed(3)} @ ${vw}x${vh}`,
        )
        assert(
          featuresOpacityAt(actualP) <= 0.02,
          `phone-only hold features gone p≈${holdP} @ ${vw}x${vh}`,
        )
        assert(
          phoneInT(actualP) >= 0.99,
          `phone-only hold phone full p≈${holdP} t=${phoneInT(actualP).toFixed(3)} @ ${vw}x${vh}`,
        )
      }

      await scrollMobileStoryProgress(page, 0.62)
      const fadeP = await readMobileProgress(page)
      assert(
        headlineCompositeOpacityAt(fadeP) <= 0.02,
        `headline gone by p≈0.62 actual=${fadeP.toFixed(3)} @ ${vw}x${vh}`,
      )

      await scrollMobileStoryProgress(page, 0.72)
      const phoneDominantP = await readMobileProgress(page)
      assert(
        headlineCompositeOpacityAt(phoneDominantP) <= 0.02,
        `headline gone at phone dominant p≈0.72 @ ${vw}x${vh}`,
      )
      assert(
        phoneInT(phoneDominantP) >= 0.95,
        `phone dominant at p≈0.72 t=${phoneInT(phoneDominantP).toFixed(3)} @ ${vw}x${vh}`,
      )

      // —— In-phone app story (after settle) ——
      // Phase 6D: Dashboard visible mid phone entrance, Y locked at 0
      await scrollMobileStoryProgress(page, 0.52)
      const entrance = await page.evaluate(() => {
        /* Opacity/scale owner is .phoneSystem — not the chassis root. */
        const phoneSystem = document.querySelector('[data-mobile-phone-system]') as HTMLElement | null
        const dashLayer = document.querySelector('[data-mobile-app-layer="dashboard"]') as HTMLElement | null
        const card = document.querySelector('[data-mobile-wedding-card]')
        const matrix = dashLayer ? new DOMMatrix(getComputedStyle(dashLayer).transform) : null
        return {
          phoneOp: phoneSystem ? parseFloat(getComputedStyle(phoneSystem).opacity || '0') : 0,
          dashOp: dashLayer ? parseFloat(getComputedStyle(dashLayer).opacity || '0') : 0,
          translateY: matrix?.m42 ?? 0,
          hasCard: card != null && (card.textContent ?? '').includes('Julia i Maksymilian'),
        }
      })
      assert(entrance.phoneOp > 0.4 && entrance.phoneOp < 0.95, `phone still entering @ ${vw}x${vh} op=${entrance.phoneOp}`)
      assert(entrance.dashOp > 0.95, `dashboard opaque during phone entrance @ ${vw}x${vh}`)
      assert(Math.abs(entrance.translateY) <= 1, `dashboard Y=0 during phone entrance @ ${vw}x${vh}`)
      assert(entrance.hasCard, `dashboard content during phone entrance @ ${vw}x${vh}`)

      await scrollMobileAppProgress(page, 0.02)
      const breathLock = await page.evaluate(() => {
        const layer = document.querySelector('[data-mobile-app-layer="dashboard"]') as HTMLElement | null
        return layer ? new DOMMatrix(getComputedStyle(layer).transform).m42 : 0
      })
      assert(Math.abs(breathLock) <= 1, `Y=0 at settle/breath @ ${vw}x${vh}`)

      await scrollMobileAppProgress(page, 0.08)
      const dash = await page.evaluate(() => {
        const phone = document.querySelector('[data-testid="lv2-mobile-phone"]') as HTMLElement | null
        const chassis = phone?.querySelector('[data-phone-chassis]') as HTMLElement | null
        const screen = phone?.querySelector('[data-phone-screen]') as HTMLElement | null
        const dashLayer = document.querySelector('[data-mobile-app-layer="dashboard"]') as HTMLElement | null
        const card = document.querySelector('[data-mobile-wedding-card]')
        const r0 = chassis?.getBoundingClientRect()
        return {
          phoneW: r0?.width ?? 0,
          phoneH: r0?.height ?? 0,
          phoneL: r0?.left ?? 0,
          phoneT: r0?.top ?? 0,
          hasDash: dashLayer != null,
          hasCard: card != null && (card.textContent ?? '').includes('Julia i Maksymilian'),
          screenClips: screen ? getComputedStyle(screen).overflow === 'hidden' : false,
          translateY: dashLayer ? new DOMMatrix(getComputedStyle(dashLayer).transform).m42 : 0,
        }
      })
      assert(dash.hasDash, `dashboard layer @ ${vw}x${vh}`)
      assert(dash.hasCard, `Julia & Maksymilian card @ ${vw}x${vh}`)
      assert(dash.screenClips, `phone screen clips @ ${vw}x${vh}`)
      assert(dash.translateY < -2, `dashboard scroll begun after settle @ ${vw}x${vh}`)
      const settledBox = { w: dash.phoneW, h: dash.phoneH, l: dash.phoneL, t: dash.phoneT }

      const orderCheck = await page.evaluate(() => {
        const root = document.querySelector('[data-mobile-app-screen="dashboard"]')
        const sections = Array.from(
          root?.querySelectorAll('[data-dashboard-section]') ?? [],
        ).map((el) => el.getAttribute('data-dashboard-section'))
        const upcoming = document.querySelector('[data-dashboard-section="upcoming"]')
        const hero = document.querySelector('[data-dashboard-section="hero"]')
        const inquiries = document.querySelector('[data-mobile-dashboard-inquiries]')
        const deadlines = document.querySelector('[data-mobile-dashboard-deadlines]')
        const heroBottom = hero?.getBoundingClientRect().bottom ?? 0
        const upTop = upcoming?.getBoundingClientRect().top ?? 0
        return {
          sections,
          gap: upTop - heroBottom,
          inquiryRows: inquiries?.querySelectorAll('li').length ?? 0,
          deadlineRows: deadlines?.querySelectorAll('li').length ?? 0,
        }
      })
      assert(
        orderCheck.sections.join(',') ===
          'hero,upcoming,inquiries,today,deadlines,notifications',
        `dashboard DOM order @ ${vw}x${vh}: ${orderCheck.sections.join(',')}`,
      )
      assert(orderCheck.gap >= -2 && orderCheck.gap < 80, `upcoming under hero gap=${orderCheck.gap} @ ${vw}x${vh}`)
      assert(orderCheck.inquiryRows >= 1, `inquiries non-empty @ ${vw}x${vh}`)
      assert(orderCheck.deadlineRows >= 1, `deadlines non-empty @ ${vw}x${vh}`)

      // Linearity samples at 25/50/75% of dashScroll
      const maxScrollForLinear = await page.evaluate(() => {
        const viewport = document.querySelector('[data-mobile-dashboard-viewport]') as HTMLElement | null
        return parseFloat(viewport?.dataset.dashboardMaxScroll || '0')
      })
      assert(maxScrollForLinear > 0, `measured dashboard maxScroll @ ${vw}x${vh}`)
      const linearSamples: Array<{ pct: number; y: number; outer: number }> = []
      for (const pct of [0.25, 0.5, 0.75]) {
        const app =
          MOBILE_APP_RANGES.dashScroll.start +
          pct * (MOBILE_APP_RANGES.dashScroll.end - MOBILE_APP_RANGES.dashScroll.start)
        await scrollMobileAppProgress(page, app)
        const sample = await page.evaluate(() => {
          const layer = document.querySelector('[data-mobile-app-layer="dashboard"]') as HTMLElement | null
          const track = document.querySelector('[data-testid="lv2-mobile-story"]') as HTMLElement | null
          const navH =
            parseFloat(getComputedStyle(track!).getPropertyValue('--lv2-nav-h')) || 68
          const rect = track!.getBoundingClientRect()
          const scrollDist = Math.max(0, navH - rect.top)
          return {
            y: layer ? Math.abs(new DOMMatrix(getComputedStyle(layer).transform).m42) : 0,
            scrollDist,
          }
        })
        const expected = pct * maxScrollForLinear
        assert(
          Math.abs(sample.y - expected) <= maxScrollForLinear * 0.05 + 2,
          `linear Y@${pct}: got ${sample.y.toFixed(1)} want ~${expected.toFixed(1)} @ ${vw}x${vh}`,
        )
        linearSamples.push({ pct, y: sample.y, outer: sample.scrollDist })
      }
      const outer01 = linearSamples[1].outer - linearSamples[0].outer
      const outer12 = linearSamples[2].outer - linearSamples[1].outer
      assert(
        Math.abs(outer01 - outer12) / Math.max(1, (outer01 + outer12) / 2) <= 0.35,
        `uniform outer intervals mid-dash @ ${vw}x${vh} d01=${outer01.toFixed(0)} d12=${outer12.toFixed(0)}`,
      )

      await scrollMobileAppProgress(page, 0.28)
      const scrolled = await page.evaluate(() => {
        const layer = document.querySelector('[data-mobile-app-layer="dashboard"]') as HTMLElement | null
        const compact = document.querySelector('[data-mobile-compact-bar]') as HTMLElement | null
        const t = layer ? getComputedStyle(layer).transform : 'none'
        const compactOp = compact ? parseFloat(getComputedStyle(compact).opacity || '0') : 0
        const chassis = document.querySelector('[data-phone-chassis]')?.getBoundingClientRect()
        const viewport = document.querySelector('[data-mobile-dashboard-viewport]') as HTMLElement | null
        return {
          moved: t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)',
          compactOp,
          maxScroll: parseFloat(viewport?.dataset.dashboardMaxScroll || '0'),
          phoneW: chassis?.width ?? 0,
          phoneH: chassis?.height ?? 0,
          phoneL: chassis?.left ?? 0,
          phoneT: chassis?.top ?? 0,
        }
      })
      assert(scrolled.moved, `dashboard internal Y motion @ ${vw}x${vh}`)
      assert(scrolled.maxScroll > 0, `measured dashboard maxScroll mid @ ${vw}x${vh}`)
      assert(scrolled.compactOp > 0.5, `compact glass bar visible mid-scroll @ ${vw}x${vh}`)
      assert(Math.abs(scrolled.phoneW - settledBox.w) <= 1, `phone W lock dash scroll @ ${vw}x${vh}`)
      assert(Math.abs(scrolled.phoneH - settledBox.h) <= 1, `phone H lock dash scroll @ ${vw}x${vh}`)
      assert(Math.abs(scrolled.phoneL - settledBox.l) <= 2, `phone X lock dash scroll @ ${vw}x${vh}`)
      assert(Math.abs(scrolled.phoneT - settledBox.t) <= 2, `phone Y lock dash scroll @ ${vw}x${vh}`)

      // Section visibility — each restored section must enter the viewport during dashScroll
      let inquiriesSeen = false
      let deadlinesSeen = false
      let compactWithInquiries = false
      let compactWithDeadlines = false
      for (const p of [0.18, 0.28, 0.38, 0.46, 0.5]) {
        await scrollMobileAppProgress(page, p)
        const hit = await page.evaluate(() => {
          const viewport = document.querySelector('[data-mobile-dashboard-viewport]') as HTMLElement | null
          const inquiries = document.querySelector('[data-mobile-dashboard-inquiries]') as HTMLElement | null
          const deadlines = document.querySelector('[data-mobile-dashboard-deadlines]') as HTMLElement | null
          const compact = document.querySelector('[data-mobile-compact-bar]') as HTMLElement | null
          if (!viewport) return { inq: false, dl: false, compactOp: 0 }
          const vr = viewport.getBoundingClientRect()
          const inqR = inquiries?.getBoundingClientRect()
          const dlR = deadlines?.getBoundingClientRect()
          const inq =
            !!inqR && inqR.bottom > vr.top + 12 && inqR.top < vr.bottom - 12
          const dl = !!dlR && dlR.bottom > vr.top + 12 && dlR.top < vr.bottom - 12
          return {
            inq,
            dl,
            compactOp: compact ? parseFloat(getComputedStyle(compact).opacity || '0') : 0,
          }
        })
        if (hit.inq) {
          inquiriesSeen = true
          if (hit.compactOp > 0.4) compactWithInquiries = true
        }
        if (hit.dl) {
          deadlinesSeen = true
          if (hit.compactOp > 0.4) compactWithDeadlines = true
        }
      }
      assert(inquiriesSeen, `Zgłoszenia visible during dash scroll @ ${vw}x${vh}`)
      assert(deadlinesSeen, `Terminy oddania visible during dash scroll @ ${vw}x${vh}`)
      assert(
        compactWithInquiries || compactWithDeadlines,
        `compact bar visible with lower sections @ ${vw}x${vh}`,
      )

      // Final Dashboard scroll end — no beige void below last section
      await scrollMobileAppProgress(page, MOBILE_APP_RANGES.dashScroll.end)
      const endGeo = await page.evaluate(() => {
        const viewport = document.querySelector('[data-mobile-dashboard-viewport]') as HTMLElement | null
        const last = document.querySelector('[data-mobile-dashboard-last-section]') as HTMLElement | null
        const layer = document.querySelector('[data-mobile-app-layer="dashboard"]') as HTMLElement | null
        if (!viewport || !last || !layer) return null
        const vr = viewport.getBoundingClientRect()
        const lr = last.getBoundingClientRect()
        const emptyBottomGap = vr.bottom - lr.bottom
        const matrix = new DOMMatrix(getComputedStyle(layer).transform)
        const maxScroll = parseFloat(viewport.dataset.dashboardMaxScroll || '0')
        return {
          emptyBottomGap,
          translateY: matrix.m42,
          maxScroll,
          lastVisible: lr.bottom > vr.top + 8 && lr.top < vr.bottom - 4,
        }
      })
      assert(endGeo != null, `dashboard end geometry @ ${vw}x${vh}`)
      assert(endGeo!.lastVisible, `last section still readable at end @ ${vw}x${vh}`)
      assert(
        endGeo!.emptyBottomGap >= 8 && endGeo!.emptyBottomGap <= 40,
        `final bottom gap ${endGeo!.emptyBottomGap.toFixed(1)}px (want 8–40) @ ${vw}x${vh}`,
      )
      assert(
        Math.abs(endGeo!.translateY + endGeo!.maxScroll) <= 1.5,
        `Y≈-maxScroll (${endGeo!.translateY} vs -${endGeo!.maxScroll}) @ ${vw}x${vh}`,
      )

      await scrollMobileAppProgress(page, 0.54)
      const holdY = await page.evaluate(() => {
        const layer = document.querySelector('[data-mobile-app-layer="dashboard"]') as HTMLElement | null
        return layer ? new DOMMatrix(getComputedStyle(layer).transform).m42 : 0
      })
      assert(Math.abs(holdY - endGeo!.translateY) <= 1.5, `Y frozen in end-hold @ ${vw}x${vh}`)

      // Overlapping handoff — never blank
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const app =
          MOBILE_APP_RANGES.handoff.start +
          t * (MOBILE_APP_RANGES.handoff.end - MOBILE_APP_RANGES.handoff.start)
        await scrollMobileAppProgress(page, app)
        const hand = await page.evaluate(() => {
          const dashLayer = document.querySelector('[data-mobile-app-layer="dashboard"]') as HTMLElement | null
          const dayLayer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
          const chassis = document.querySelector('[data-phone-chassis]')?.getBoundingClientRect()
          return {
            dashOp: dashLayer ? parseFloat(getComputedStyle(dashLayer).opacity || '0') : 0,
            dayOp: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') : 0,
            phoneW: chassis?.width ?? 0,
            phoneH: chassis?.height ?? 0,
            phoneL: chassis?.left ?? 0,
            phoneT: chassis?.top ?? 0,
          }
        })
        assert(
          !(hand.dashOp < 0.1 && hand.dayOp < 0.1),
          `no blank handoff t=${t} dash=${hand.dashOp.toFixed(2)} day=${hand.dayOp.toFixed(2)} @ ${vw}x${vh}`,
        )
        assert(Math.abs(hand.phoneW - settledBox.w) <= 1, `phone W lock handoff t=${t} @ ${vw}x${vh}`)
        assert(Math.abs(hand.phoneH - settledBox.h) <= 1, `phone H lock handoff t=${t} @ ${vw}x${vh}`)
        assert(Math.abs(hand.phoneL - settledBox.l) <= 2, `phone X lock handoff t=${t} @ ${vw}x${vh}`)
        assert(Math.abs(hand.phoneT - settledBox.t) <= 2, `phone Y lock handoff t=${t} @ ${vw}x${vh}`)
        if (t === 0.5) {
          assert(hand.dashOp >= 0.35 && hand.dashOp <= 0.65, `mid handoff dash @ ${vw}x${vh}`)
          assert(hand.dayOp >= 0.35 && hand.dayOp <= 0.75, `mid handoff day @ ${vw}x${vh}`)
        }
      }

      await scrollMobileAppProgress(page, MOBILE_APP_RANGES.dayHold.end)
      const day = await page.evaluate(() => {
        const dayLayer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
        const nawiguj = document.querySelector('[data-mobile-nawiguj]')
        const active = document.querySelector('[data-mobile-plan-stop="Ceremonia"]') as HTMLElement | null
        const chassis = document.querySelector('[data-phone-chassis]')?.getBoundingClientRect()
        const cs = active ? getComputedStyle(active) : null
        return {
          dayVisible: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') > 0.85 : false,
          hasNawiguj: nawiguj != null && (nawiguj.textContent ?? '').includes('Nawiguj'),
          activeBorderLeft: cs?.borderLeftWidth ?? '0px',
          phoneW: chassis?.width ?? 0,
          phoneH: chassis?.height ?? 0,
          phoneL: chassis?.left ?? 0,
          phoneT: chassis?.top ?? 0,
          dayMax: parseFloat(
            (document.querySelector('[data-mobile-dashboard-viewport]') as HTMLElement | null)
              ?.dataset.weddingDayMaxScroll || '0',
          ),
          dayY: dayLayer ? new DOMMatrix(getComputedStyle(dayLayer).transform).m42 : 0,
        }
      })
      assert(day.dayVisible, `wedding day visible @ ${vw}x${vh}`)
      assert(day.hasNawiguj, `Nawiguj CTA @ ${vw}x${vh}`)
      assert(day.activeBorderLeft === '0px', `no active vertical rail @ ${vw}x${vh}`)
      assert(Math.abs(day.dayY) <= 1.5, `day Y≈0 at top @ ${vw}x${vh}`)
      assert(day.dayMax > 0, `measured weddingDay maxScroll @ ${vw}x${vh}`)
      assert(Math.abs(day.phoneW - settledBox.w) <= 1, `phone W lock day @ ${vw}x${vh}`)
      assert(Math.abs(day.phoneH - settledBox.h) <= 1, `phone H lock day @ ${vw}x${vh}`)
      assert(Math.abs(day.phoneL - settledBox.l) <= 2, `phone X lock day @ ${vw}x${vh}`)
      assert(Math.abs(day.phoneT - settledBox.t) <= 2, `phone Y lock day @ ${vw}x${vh}`)

      // Wedding Day full linear scroll (≈1:1) before Navigation — Phase 6F.3
      const dayMax = day.dayMax
      const returnPx = dayMax
      for (const pct of [0.25, 0.5, 0.75]) {
        const app =
          MOBILE_APP_RANGES.dayScroll.start +
          pct * (MOBILE_APP_RANGES.dayScroll.end - MOBILE_APP_RANGES.dayScroll.start)
        await scrollMobileAppProgress(page, app)
        const y = await page.evaluate(() => {
          const layer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
          return layer ? Math.abs(new DOMMatrix(getComputedStyle(layer).transform).m42) : 0
        })
        const expected = pct * returnPx
        assert(
          Math.abs(y - expected) <= dayMax * 0.05 + 2,
          `day linear @${pct}: got ${y.toFixed(1)} want ~${expected.toFixed(1)} @ ${vw}x${vh}`,
        )
      }

      // Mid-scroll sensitivity: 100px outer ≈ 90–110px content
      {
        const appA =
          MOBILE_APP_RANGES.dayScroll.start +
          0.3 * (MOBILE_APP_RANGES.dayScroll.end - MOBILE_APP_RANGES.dayScroll.start)
        const appB =
          MOBILE_APP_RANGES.dayScroll.start +
          0.3 * (MOBILE_APP_RANGES.dayScroll.end - MOBILE_APP_RANGES.dayScroll.start) +
          (100 / Math.max(1, dayMax)) * (MOBILE_APP_RANGES.dayScroll.end - MOBILE_APP_RANGES.dayScroll.start)
        await scrollMobileAppProgress(page, appA)
        const yA = await page.evaluate(() => {
          const layer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
          return layer ? new DOMMatrix(getComputedStyle(layer).transform).m42 : 0
        })
        const scrollA = await page.evaluate(() => window.scrollY)
        await scrollMobileAppProgress(page, Math.min(MOBILE_APP_RANGES.dayScroll.end - 0.002, appB))
        const yB = await page.evaluate(() => {
          const layer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
          return layer ? new DOMMatrix(getComputedStyle(layer).transform).m42 : 0
        })
        const scrollB = await page.evaluate(() => window.scrollY)
        const outerΔ = Math.abs(scrollB - scrollA)
        const innerΔ = Math.abs(yB - yA)
        if (outerΔ >= 80) {
          const ratio = innerΔ / outerΔ
          assert(
            ratio >= 0.85 && ratio <= 1.2,
            `day sensitivity ${innerΔ.toFixed(0)}/${outerΔ.toFixed(0)}=${ratio.toFixed(2)} @ ${vw}x${vh}`,
          )
        }
      }

      await scrollMobileAppProgress(page, MOBILE_APP_RANGES.dayScroll.end)
      await page.waitForTimeout(120)
      const atDayBottom = await page.evaluate(() => {
        const layer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
        const viewport = document.querySelector('[data-mobile-dashboard-viewport]') as HTMLElement | null
        const brief = document.querySelector('[data-mobile-brief-card]') as HTMLElement | null
        const vr = viewport?.getBoundingClientRect()
        const br = brief?.getBoundingClientRect()
        return {
          dayY: layer ? new DOMMatrix(getComputedStyle(layer).transform).m42 : 0,
          dayMax: parseFloat(viewport?.dataset.weddingDayMaxScroll || '0'),
          briefVisible: !!(vr && br && br.bottom <= vr.bottom + 1 && br.top >= vr.top - 2),
          inset: vr && br ? vr.bottom - br.bottom : -1,
          scrollY: window.scrollY,
        }
      })
      const yBeforeNav = atDayBottom.dayY
      assert(Math.abs(yBeforeNav + returnPx) <= 3, `day at -maxScroll before nav @ ${vw}x${vh}`)
      assert(atDayBottom.briefVisible, `Wedding Brief readable at day bottom @ ${vw}x${vh}`)
      assert(
        atDayBottom.inset >= 8 && atDayBottom.inset <= 40,
        `day bottom inset ${atDayBottom.inset.toFixed(1)} @ ${vw}x${vh}`,
      )

      const scrollAtDayBottom = atDayBottom.scrollY

      const sampleAtOuterOffset = async (offsetPx: number) => {
        await page.evaluate(
          ({ y, off }) => {
            window.scrollTo(0, y + off)
            window.dispatchEvent(new Event('scroll'))
            document.dispatchEvent(new Event('scroll', { bubbles: true }))
          },
          { y: scrollAtDayBottom, off: offsetPx },
        )
        await page.waitForTimeout(70)
        return page.evaluate(() => {
          const map = document.querySelector('[data-mobile-app-screen="navigation"]') as HTMLElement | null
          const dayLayer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
          const sticky = document.querySelector('[data-mobile-owned]') as HTMLElement | null
          return {
            mapOp: map ? parseFloat(getComputedStyle(map).opacity || '0') : 0,
            dayOp: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') : 0,
            dayY: dayLayer ? new DOMMatrix(getComputedStyle(dayLayer).transform).m42 : 0,
            app: parseFloat(sticky?.getAttribute('data-mobile-app-progress') || '0'),
            scrollY: window.scrollY,
          }
        })
      }

      const findOffsetForNav = async (targetOp: number) => {
        const expected =
          DAY_END_HOLD_OUTER_PX + Math.round(targetOp * NAV_ENTER_OUTER_PX)
        const start = Math.max(0, expected - 24)
        let found = -1
        for (let d = start; d <= DAY_END_HOLD_OUTER_PX + NAV_ENTER_OUTER_PX + 40; d += 2) {
          const s = await sampleAtOuterOffset(d)
          if (s.mapOp >= targetOp) {
            found = d
            break
          }
        }
        if (found < 0) {
          for (let d = 0; d < start; d += 2) {
            const s = await sampleAtOuterOffset(d)
            if (s.mapOp >= targetOp) {
              found = d
              break
            }
          }
        }
        return found
      }

      const d10 = await findOffsetForNav(0.1)
      assert(d10 >= 0 && d10 <= 80, `day bottom→nav0.10 ${d10}px <= 80 @ ${vw}x${vh}`)

      const d50 = await findOffsetForNav(0.5)
      assert(d50 >= 0 && d50 <= 130, `day bottom→nav0.50 ${d50}px <= 130 @ ${vw}x${vh}`)

      const d90 = await findOffsetForNav(0.9)
      assert(d90 >= 0 && d90 <= 190, `day bottom→nav0.90 ${d90}px <= 190 @ ${vw}x${vh}`)
      const at90 = await sampleAtOuterOffset(d90)
      assert(at90.mapOp >= 0.85, `nav readable op ${at90.mapOp.toFixed(2)} @ ${vw}x${vh}`)

      // Dead-scroll probe: every ~20px of outer scroll after day bottom until nav≥0.9
      {
        await sampleAtOuterOffset(0)
        let prev = await sampleAtOuterOffset(0)
        let longestDead = 0
        let deadRun = 0
        let holdBlocks = 0
        let inHold = false
        const endOff = Math.max(d90, DAY_END_HOLD_OUTER_PX + NAV_ENTER_OUTER_PX)
        for (let off = 20; off <= endOff + 1; off += 20) {
          const cur = await sampleAtOuterOffset(off)
          const material =
            Math.abs(cur.dayOp - prev.dayOp) >= 0.015 ||
            Math.abs(cur.mapOp - prev.mapOp) >= 0.015 ||
            Math.abs(cur.dayY - prev.dayY) >= 0.5
          if (!material) {
            deadRun += 20
            if (!inHold) {
              holdBlocks += 1
              inHold = true
            }
            longestDead = Math.max(longestDead, deadRun)
          } else {
            deadRun = 0
            inHold = false
          }
          prev = cur
          if (cur.mapOp >= 0.9) break
        }
        assert(holdBlocks <= 1, `dead-scroll hold blocks ${holdBlocks} <= 1 @ ${vw}x${vh}`)
        assert(longestDead <= 80, `longest dead scroll ${longestDead}px <= 80 @ ${vw}x${vh}`)
      }

      // nav≥0.9 → travel start (short rest) — physical offsets from budgets
      {
        const travelOff = DAY_END_HOLD_OUTER_PX + NAV_ENTER_OUTER_PX + NAV_REST_OUTER_PX
        const beforeTravel = await sampleAtOuterOffset(d90)
        assert(beforeTravel.mapOp >= 0.85, `pre-travel nav visible @ ${vw}x${vh}`)
        // travelProgress reflected by marker leaving origin after rest
        await sampleAtOuterOffset(travelOff - 2)
        const atRestEnd = await page.evaluate(() => {
          const marker = document.querySelector('[data-mobile-route-marker]') as SVGGElement | null
          const path = document.querySelector('[data-mobile-route-path]') as SVGPathElement | null
          const mx = marker ? parseFloat(marker.getAttribute('data-nav-x') || '0') : 0
          const my = marker ? parseFloat(marker.getAttribute('data-nav-y') || '0') : 0
          let origin = { x: 0, y: 0 }
          if (path) {
            const p0 = path.getPointAtLength(0)
            origin = { x: p0.x, y: p0.y }
          }
          return { mx, my, ox: origin.x, oy: origin.y }
        })
        assert(
          Math.hypot(atRestEnd.mx - atRestEnd.ox, atRestEnd.my - atRestEnd.oy) <= 3,
          `marker still at START through nav rest @ ${vw}x${vh}`,
        )
        await sampleAtOuterOffset(travelOff + 30)
        const afterTravel = await page.evaluate(() => {
          const marker = document.querySelector('[data-mobile-route-marker]') as SVGGElement | null
          const path = document.querySelector('[data-mobile-route-path]') as SVGPathElement | null
          const mx = marker ? parseFloat(marker.getAttribute('data-nav-x') || '0') : 0
          const my = marker ? parseFloat(marker.getAttribute('data-nav-y') || '0') : 0
          let origin = { x: 0, y: 0 }
          if (path) {
            const p0 = path.getPointAtLength(0)
            origin = { x: p0.x, y: p0.y }
          }
          return Math.hypot(mx - origin.x, my - origin.y)
        })
        assert(afterTravel > 4, `marker moves after nav rest @ ${vw}x${vh}`)
        const restPx = travelOff - d90
        assert(
          restPx >= 25 && restPx <= 85,
          `nav readable→travel rest ${restPx.toFixed(0)}px in ~30–70 @ ${vw}x${vh}`,
        )
      }

      // Map enter / route / occupancy
      await scrollMobileAppProgress(page, MOBILE_APP_RANGES.mapIn.end)
      const mapEnter = await page.evaluate(() => {
        const map = document.querySelector('[data-mobile-app-screen="navigation"]') as HTMLElement | null
        const dayLayer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
        const mapWrap = document.querySelector('[data-mobile-nav-map]') as HTMLElement | null
        const header = document.querySelector('[data-mobile-nav-header]') as HTMLElement | null
        const body = document.querySelector('[data-mobile-app-viewport]') as HTMLElement | null
        const mapR = mapWrap?.getBoundingClientRect()
        const headerR = header?.getBoundingClientRect()
        const bodyR = body?.getBoundingClientRect()
        const bodyH = bodyR && mapR ? bodyR.height : 1
        const text = map?.textContent ?? ''
        const metaGap = mapR && headerR ? mapR.top - headerR.bottom : 99
        return {
          mapOp: map ? parseFloat(getComputedStyle(map).opacity || '0') : 0,
          dayOp: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') : 0,
          mapPct: mapR && bodyR ? (mapR.height / bodyH) * 100 : 0,
          metaGap,
          mapTop: mapR?.top ?? 0,
          mapBottom: mapR?.bottom ?? 0,
          mapH: mapR?.height ?? 0,
          primaryRoads:
            document.querySelector('[data-mobile-map-roads-primary]')?.querySelectorAll('path')
              .length ?? 0,
          secondaryRoads:
            document.querySelector('[data-mobile-map-roads-secondary]')?.querySelectorAll('path')
              .length ?? 0,
          minorRoads:
            document.querySelector('[data-mobile-map-roads-minor]')?.querySelectorAll('path')
              .length ?? 0,
          hasChurch: text.includes('Kościół Świętych Apostołów Piotra i Pawła'),
          hasKrakow: text.includes('Kraków'),
          hasEta: text.includes('~15 min') || text.includes('15 min'),
          hasDist: text.includes('6,1 km'),
          hasVilla: text.includes('Villa Love'),
          hasIzdebnik: text.includes('Izdebnik'),
          routeD: document.querySelector('[data-mobile-route-path]')?.getAttribute('d') ?? '',
          underlay: document.querySelector('[data-mobile-route-underlay]') != null,
          remaining: document.querySelector('[data-mobile-route-remaining]') != null,
          travelled: document.querySelector('[data-mobile-route-travelled]') != null,
          tripbarVisible: (() => {
            const bar = document.querySelector('[data-mobile-nav-tripbar]') as HTMLElement | null
            const viewport = document.querySelector(
              '[data-mobile-app-viewport]',
            ) as HTMLElement | null
            if (!bar || !viewport) return false
            const br = bar.getBoundingClientRect()
            const vr = viewport.getBoundingClientRect()
            return br.height > 20 && br.bottom <= vr.bottom + 2 && br.top < vr.bottom
          })(),
        }
      })
      assert(mapEnter.mapOp > 0.85, `map entered @ ${vw}x${vh}`)
      assert(mapEnter.mapPct >= 68 && mapEnter.mapPct <= 92, `map occupancy ${mapEnter.mapPct.toFixed(0)}% @ ${vw}x${vh}`)
      assert(mapEnter.metaGap >= 8 && mapEnter.metaGap <= 18, `meta→map gap ${mapEnter.metaGap.toFixed(1)}px @ ${vw}x${vh}`)
      assert(mapEnter.primaryRoads >= 2, `primary roads dense @ ${vw}x${vh}`)
      assert(mapEnter.secondaryRoads >= 4, `secondary roads dense @ ${vw}x${vh}`)
      assert(mapEnter.minorRoads >= 12, `minor roads dense @ ${vw}x${vh}`)
      assert(
        mapEnter.primaryRoads + mapEnter.secondaryRoads + mapEnter.minorRoads >= 20,
        `total road segments @ ${vw}x${vh}`,
      )
      assert(mapEnter.hasChurch, `ceremony church destination @ ${vw}x${vh}`)
      assert(mapEnter.hasKrakow, `Kraków city @ ${vw}x${vh}`)
      assert(mapEnter.hasEta && mapEnter.hasDist, `ceremony travel meta @ ${vw}x${vh}`)
      assert(!mapEnter.hasVilla && !mapEnter.hasIzdebnik, `no reception destination @ ${vw}x${vh}`)
      assert(/[CSQ]/.test(mapEnter.routeD), `route uses curve commands @ ${vw}x${vh}`)
      assert(mapEnter.underlay, `route underlay present @ ${vw}x${vh}`)
      assert(mapEnter.remaining && mapEnter.travelled, `muted+travelled route layers @ ${vw}x${vh}`)
      assert(mapEnter.tripbarVisible, `bottom trip bar inside phone @ ${vw}x${vh}`)

      const mapRest = { top: mapEnter.mapTop, bottom: mapEnter.mapBottom, h: mapEnter.mapH }

      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const app =
          MOBILE_APP_RANGES.mapIn.start +
          t * (MOBILE_APP_RANGES.mapIn.end - MOBILE_APP_RANGES.mapIn.start)
        await scrollMobileAppProgress(page, app)
        const cov = await page.evaluate(() => {
          const map = document.querySelector('[data-mobile-app-screen="navigation"]') as HTMLElement | null
          const dayLayer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
          return {
            mapOp: map ? parseFloat(getComputedStyle(map).opacity || '0') : 0,
            dayOp: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') : 0,
          }
        })
        assert(
          cov.mapOp + cov.dayOp >= 0.92,
          `day→nav coverage t=${t} @ ${vw}x${vh}`,
        )
      }

      await scrollMobileAppProgress(page, MOBILE_APP_RANGES.mapIn.end)
      const endpointsRest = await page.evaluate(() => {
        const mapWrap = document.querySelector('[data-mobile-nav-map]') as HTMLElement | null
        const path = document.querySelector('[data-mobile-route-path]') as SVGPathElement | null
        const start = document.querySelector('[data-mobile-route-start]') as SVGGElement | null
        const dest = document.querySelector('[data-mobile-route-dest]') as SVGGElement | null
        const marker = document.querySelector('[data-mobile-route-marker]') as SVGGElement | null
        if (!mapWrap || !path || !start || !dest || !marker) {
          return { ok: false, startPad: 0, destPad: 0, startΔ: 99, destΔ: 99, markerΔ: 99, hasVilla: false }
        }
        const svg = path.ownerSVGElement
        const ctm = path.getScreenCTM()
        const len = path.getTotalLength()
        const s0 = path.getPointAtLength(0)
        const s1 = path.getPointAtLength(len)
        const startC = start.querySelector('circle:last-of-type') as SVGCircleElement | null
        const destC = dest.querySelector('circle:last-of-type') as SVGCircleElement | null
        const sx = startC ? parseFloat(startC.getAttribute('cx') || '0') : 0
        const sy = startC ? parseFloat(startC.getAttribute('cy') || '0') : 0
        const dx = destC ? parseFloat(destC.getAttribute('cx') || '0') : 0
        const dy = destC ? parseFloat(destC.getAttribute('cy') || '0') : 0
        const mx = parseFloat(marker.getAttribute('data-nav-x') || '0')
        const my = parseFloat(marker.getAttribute('data-nav-y') || '0')
        let ss = { x: sx, y: sy }
        let ds = { x: dx, y: dy }
        let s0s = { x: s0.x, y: s0.y }
        let s1s = { x: s1.x, y: s1.y }
        let ms = { x: mx, y: my }
        if (svg && ctm) {
          const a = svg.createSVGPoint()
          a.x = sx
          a.y = sy
          ss = a.matrixTransform(ctm)
          const b = svg.createSVGPoint()
          b.x = dx
          b.y = dy
          ds = b.matrixTransform(ctm)
          const c = svg.createSVGPoint()
          c.x = s0.x
          c.y = s0.y
          s0s = c.matrixTransform(ctm)
          const d = svg.createSVGPoint()
          d.x = s1.x
          d.y = s1.y
          s1s = d.matrixTransform(ctm)
          const e = svg.createSVGPoint()
          e.x = mx
          e.y = my
          ms = e.matrixTransform(ctm)
        }
        const vr = mapWrap.getBoundingClientRect()
        const startPadL = ss.x - vr.left
        const startPadR = vr.right - ss.x
        const startPadT = ss.y - vr.top
        const startPadB = vr.bottom - ss.y
        const startPad = Math.min(startPadL, startPadR, startPadT, startPadB)
        const destPad = Math.min(ds.x - vr.left, vr.right - ds.x, ds.y - vr.top, vr.bottom - ds.y)
        return {
          ok: true,
          startPad,
          destPad,
          startPads: { l: startPadL, r: startPadR, t: startPadT, b: startPadB },
          startΔ: Math.hypot(ss.x - s0s.x, ss.y - s0s.y),
          destΔ: Math.hypot(ds.x - s1s.x, ds.y - s1s.y),
          markerΔ: Math.hypot(ms.x - s0s.x, ms.y - s0s.y),
          hasVilla: (document.querySelector('[data-mobile-app-screen="navigation"]')?.textContent ?? '').includes(
            'Villa Love',
          ),
        }
      })
      assert(endpointsRest.ok, `nav endpoints present @ ${vw}x${vh}`)
      assert(endpointsRest.startPad >= 18, `START edge pad ${endpointsRest.startPad.toFixed(1)} @ ${vw}x${vh}`)
      assert(endpointsRest.destPad >= 18, `DEST edge pad ${endpointsRest.destPad.toFixed(1)} @ ${vw}x${vh}`)
      assert(endpointsRest.startΔ <= 2, `route↔START Δ ${endpointsRest.startΔ.toFixed(2)} @ ${vw}x${vh}`)
      assert(endpointsRest.destΔ <= 2, `route↔DEST Δ ${endpointsRest.destΔ.toFixed(2)} @ ${vw}x${vh}`)
      assert(endpointsRest.markerΔ <= 2, `marker@0↔START Δ ${endpointsRest.markerΔ.toFixed(2)} @ ${vw}x${vh}`)
      assert(!endpointsRest.hasVilla, `no Villa Love at rest @ ${vw}x${vh}`)

      await scrollMobileAppProgress(page, 0.86)
      const mapMid = await page.evaluate(() => {
        const map = document.querySelector('[data-mobile-app-screen="navigation"]') as HTMLElement | null
        const marker = document.querySelector('[data-mobile-route-marker]') as SVGGElement | null
        const path = document.querySelector('[data-mobile-route-path]') as SVGPathElement | null
        const chassis = document.querySelector('[data-phone-chassis]')?.getBoundingClientRect()
        const cx = marker ? parseFloat(marker.getAttribute('data-nav-x') || '0') : 0
        const cy = marker ? parseFloat(marker.getAttribute('data-nav-y') || '0') : 0
        let pathLen = 0
        let onRoute = false
        if (path) {
          try {
            pathLen = path.getTotalLength()
          } catch {
            pathLen = 0
          }
          if (pathLen > 180) {
            let best = 1e9
            for (let i = 0; i <= 50; i++) {
              const pt = path.getPointAtLength((i / 50) * pathLen)
              best = Math.min(best, Math.hypot(pt.x - cx, pt.y - cy))
            }
            onRoute = best <= 3.5
          }
        }
        return {
          mapOp: map ? parseFloat(getComputedStyle(map).opacity || '0') : 0,
          dotX: cx,
          dotY: cy,
          pathLen,
          onRoute,
          hasOrigin: document.querySelector('[data-mobile-route-origin]') != null,
          hasDest: document.querySelector('[data-mobile-route-dest]') != null,
          phoneW: chassis?.width ?? 0,
          phoneH: chassis?.height ?? 0,
          phoneL: chassis?.left ?? 0,
          phoneT: chassis?.top ?? 0,
        }
      })
      assert(mapMid.mapOp > 0.5, `map visible mid-route @ ${vw}x${vh}`)
      assert(mapMid.pathLen > 180, `route length believable @ ${vw}x${vh}`)
      assert(mapMid.hasOrigin && mapMid.hasDest, `route markers @ ${vw}x${vh}`)
      assert(mapMid.dotX > 100 || mapMid.dotY < 370, `route dot moved @ ${vw}x${vh}`)
      assert(mapMid.onRoute, `marker on route mid @ ${vw}x${vh}`)
      assert(Math.abs(mapMid.phoneW - settledBox.w) <= 1, `phone W lock map @ ${vw}x${vh}`)
      assert(Math.abs(mapMid.phoneH - settledBox.h) <= 1, `phone H lock map @ ${vw}x${vh}`)
      assert(Math.abs(mapMid.phoneL - settledBox.l) <= 2, `phone X lock map @ ${vw}x${vh}`)
      assert(Math.abs(mapMid.phoneT - settledBox.t) <= 2, `phone Y lock map @ ${vw}x${vh}`)

      // Marker ↔ travelled-route endpoint sync (screen space after camera CTM).
      for (const localT of [0.12, 0.32, 0.52, 0.72]) {
        const app =
          MOBILE_APP_RANGES.routeTravel.start +
          localT * (MOBILE_APP_RANGES.routeTravel.end - MOBILE_APP_RANGES.routeTravel.start)
        await scrollMobileAppProgress(page, app)
        const sync = await page.evaluate(
          ({ lt, pathEnd }) => {
            const path = document.querySelector('[data-mobile-route-path]') as SVGPathElement | null
            const travelled = document.querySelector(
              '[data-mobile-route-travelled]',
            ) as SVGPathElement | null
            const marker = document.querySelector('[data-mobile-route-marker]') as SVGGElement | null
            const mapWrap = document.querySelector('[data-mobile-nav-map]') as HTMLElement | null
            if (!path || !marker || !travelled) {
              return { ok: false, distSvg: 99, distScreen: 99, mapTop: 0, mapH: 0 }
            }

            const len = path.getTotalLength()
            const pathT = lt * pathEnd
            const expected = path.getPointAtLength(pathT * len)
            const cx = parseFloat(marker.getAttribute('data-nav-x') || '0')
            const cy = parseFloat(marker.getAttribute('data-nav-y') || '0')
            const distSvg = Math.hypot(cx - expected.x, cy - expected.y)

            const svg = path.ownerSVGElement
            let distScreen = distSvg
            if (svg) {
              const mk = svg.createSVGPoint()
              mk.x = cx
              mk.y = cy
              const rt = svg.createSVGPoint()
              rt.x = expected.x
              rt.y = expected.y
              const ctm = path.getScreenCTM()
              if (ctm) {
                const ms = mk.matrixTransform(ctm)
                const rs = rt.matrixTransform(ctm)
                distScreen = Math.hypot(ms.x - rs.x, ms.y - rs.y)
              }
            }

            const mapR = mapWrap?.getBoundingClientRect()
            return {
              ok: true,
              distSvg,
              distScreen,
              mapTop: mapR?.top ?? 0,
              mapH: mapR?.height ?? 0,
            }
          },
          { lt: localT, pathEnd: NAV_PATH_END },
        )
        assert(
          sync.ok && sync.distSvg <= 2,
          `marker↔path svg t=${localT} d=${sync.distSvg.toFixed(2)} @ ${vw}x${vh}`,
        )
        assert(
          sync.ok && sync.distScreen <= 2,
          `marker↔travelled screen t=${localT} d=${sync.distScreen.toFixed(2)} @ ${vw}x${vh}`,
        )
        assert(
          Math.abs(sync.mapTop - mapRest.top) <= 1 && Math.abs(sync.mapH - mapRest.h) <= 1,
          `map geometry lock during travel t=${localT} @ ${vw}x${vh}`,
        )
      }

      await scrollMobileAppProgress(page, MOBILE_APP_RANGES.arriveHold.start)
      const atDest = await page.evaluate(() => {
        const path = document.querySelector('[data-mobile-route-path]') as SVGPathElement | null
        const dest = document.querySelector('[data-mobile-route-dest] circle:last-of-type') as SVGCircleElement | null
        const marker = document.querySelector('[data-mobile-route-marker]') as SVGGElement | null
        if (!path || !dest || !marker) return { ok: false, d: 99 }
        const len = path.getTotalLength()
        const end = path.getPointAtLength(len)
        const dx = parseFloat(dest.getAttribute('cx') || '0')
        const dy = parseFloat(dest.getAttribute('cy') || '0')
        const mx = parseFloat(marker.getAttribute('data-nav-x') || '0')
        const my = parseFloat(marker.getAttribute('data-nav-y') || '0')
        return {
          ok: true,
          d: Math.hypot(mx - dx, my - dy),
          endD: Math.hypot(end.x - dx, end.y - dy),
        }
      })
      assert(atDest.ok && atDest.d <= 2, `marker@1↔DEST Δ ${atDest.d.toFixed(2)} @ ${vw}x${vh}`)
      assert(atDest.endD <= 2, `pathEnd↔DEST Δ ${atDest.endD.toFixed(2)} @ ${vw}x${vh}`)

      const midDot = { x: mapMid.dotX, y: mapMid.dotY }
      await scrollMobileAppProgress(page, 0.9)
      const mapEnd = await page.evaluate(() => {
        const marker = document.querySelector('[data-mobile-route-marker]') as SVGGElement | null
        return {
          dotX: marker ? parseFloat(marker.getAttribute('data-nav-x') || '0') : 0,
          dotY: marker ? parseFloat(marker.getAttribute('data-nav-y') || '0') : 0,
        }
      })
      assert(
        Math.abs(mapEnd.dotX - midDot.x) > 2 || Math.abs(mapEnd.dotY - midDot.y) > 2,
        `route dot advances @ ${vw}x${vh}`,
      )

      // Phase 6G — Navigation arrival → Brief (no Wedding Day return)
      await scrollMobileAppProgress(page, MOBILE_APP_RANGES.arriveHold.end)
      const atArrival = await page.evaluate(() => {
        const map = document.querySelector('[data-mobile-app-screen="navigation"]') as HTMLElement | null
        const dayLayer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
        const brief = document.querySelector('[data-mobile-brief-sheet]') as HTMLElement | null
        return {
          mapOp: map ? parseFloat(getComputedStyle(map).opacity || '0') : 0,
          dayOp: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') : 0,
          briefOp: brief ? parseFloat(getComputedStyle(brief).opacity || '0') : 0,
          scrollY: window.scrollY,
        }
      })
      assert(atArrival.mapOp >= 0.95, `nav opaque at arrival @ ${vw}x${vh}`)
      assert(atArrival.dayOp <= 0.05, `no day return at arrival @ ${vw}x${vh}`)
      assert(atArrival.briefOp <= 0.08, `brief still closed at arrival @ ${vw}x${vh}`)
      const scrollAtArrival = atArrival.scrollY

      for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const app =
          MOBILE_APP_RANGES.briefEnter.start +
          t * (MOBILE_APP_RANGES.briefEnter.end - MOBILE_APP_RANGES.briefEnter.start)
        await scrollMobileAppProgress(page, app)
        const cov = await page.evaluate(() => {
          const map = document.querySelector('[data-mobile-app-screen="navigation"]') as HTMLElement | null
          const brief = document.querySelector('[data-mobile-brief-sheet]') as HTMLElement | null
          const dayLayer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
          return {
            mapOp: map ? parseFloat(getComputedStyle(map).opacity || '0') : 0,
            briefOp: brief ? parseFloat(getComputedStyle(brief).opacity || '0') : 0,
            dayOp: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') : 0,
          }
        })
        assert(
          cov.mapOp + cov.briefOp >= 0.95,
          `nav→brief coverage t=${t} @ ${vw}x${vh}`,
        )
        assert(cov.dayOp <= 0.05, `no day flash during brief enter t=${t} @ ${vw}x${vh}`)
      }

      // Physical distances: route complete → brief opacities
      {
        await scrollMobileAppProgress(page, MOBILE_APP_RANGES.routeTravel.end)
        const startY = await page.evaluate(() => window.scrollY)
        const sampleOff = async (off: number) => {
          await page.evaluate(
            ({ y, o }) => {
              window.scrollTo(0, y + o)
              window.dispatchEvent(new Event('scroll'))
            },
            { y: startY, o: off },
          )
          await page.waitForTimeout(55)
          return page.evaluate(() => {
            const brief = document.querySelector('[data-mobile-brief-sheet]') as HTMLElement | null
            const dayLayer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
            return {
              briefOp: brief ? parseFloat(getComputedStyle(brief).opacity || '0') : 0,
              dayOp: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') : 0,
            }
          })
        }
        const find = async (target: number) => {
          const expected = NAV_ARRIVAL_OUTER_PX + Math.round(target * BRIEF_ENTER_OUTER_PX)
          for (let d = Math.max(0, expected - 30); d <= NAV_ARRIVAL_OUTER_PX + BRIEF_ENTER_OUTER_PX + 40; d += 2) {
            const s = await sampleOff(d)
            if (s.briefOp >= target) return d
          }
          return -1
        }
        const d10 = await find(0.1)
        const d50 = await find(0.5)
        const d90 = await find(0.9)
        assert(d10 >= 0 && d10 <= 100, `route→brief0.10 ${d10}px <= 100 @ ${vw}x${vh}`)
        assert(d50 >= 0 && d50 <= 170, `route→brief0.50 ${d50}px <= 170 @ ${vw}x${vh}`)
        assert(d90 >= 0 && d90 <= 240, `route→brief0.90 ${d90}px <= 240 @ ${vw}x${vh}`)
        void scrollAtArrival
      }

      await scrollMobileAppProgress(page, MOBILE_APP_RANGES.briefHold.start + 0.01)
      await page.waitForTimeout(200)
      const briefFit = await page.evaluate(
        new Function(`
        const sheet = document.querySelector('[data-mobile-brief-sheet]');
        const meta = document.querySelector('[data-mobile-brief-meta]');
        const paper = document.querySelector('[data-mobile-brief-paper]');
        const dayLayer = document.querySelector('[data-mobile-app-layer="day"]');
        const map = document.querySelector('[data-mobile-app-screen="navigation"]');
        const sticky = document.querySelector('[data-mobile-owned]');
        const viewport = document.querySelector('[data-mobile-app-viewport]');
        const first = document.querySelector('[data-mobile-brief-first]');
        const last = document.querySelector('[data-mobile-brief-last-section]');
        const chassis = document.querySelector('[data-phone-chassis]') && document.querySelector('[data-phone-chassis]').getBoundingClientRect();
        const text = (sheet && sheet.textContent) || '';
        const vr = viewport && viewport.getBoundingClientRect();
        const paperR = paper && paper.getBoundingClientRect();
        const metaR = meta && meta.getBoundingClientRect();
        const firstR = first && first.getBoundingClientRect();
        const lastR = last && last.getBoundingClientRect();
        const doc = document.querySelector('[data-mobile-brief-content]');
        const docStyle = doc ? getComputedStyle(doc) : null;
        const padB = docStyle ? parseFloat(docStyle.paddingBottom) || 0 : 0;
        const mustSee = [
          'Julia i Maksymilian',
          '12 czerwca 2027',
          'Reportaż Premium',
          '11:00',
          'Przygotowania Julii',
          '11:30',
          'Przygotowania Maksymiliana',
          '15:00',
          'Ceremonia',
          '17:30',
          'Przyjęcie',
          'Goście',
          '120',
          'Taniec',
          '19:30',
          'Koniec',
          '00:30',
          'Zdjęcie grupowe',
          'Chcemy pod kościołem',
          'Ważne podczas ceremonii',
          'Czytania bliskich',
          'Błogosławieństwo',
          'U Panny Młodej',
          'KONTAKTY',
          'Julia',
          'Maksymilian',
          '+48 512 340 118',
          '+48 603 771 245',
          'OSOBY KLUCZOWE',
          'Aleksandra Nowak',
          'Michał Kowalski',
          'LOGISTYKA',
          'Obiad dla ekipy',
          '18:30',
          'UWAGA DLA EKIPY',
          'Naturalny reportaż',
          'Bez ustawiania podczas ceremonii',
        ];
        const missing = mustSee.filter(function (s) { return text.indexOf(s) < 0; });
        function rowInView(el) {
          if (!el || !vr) return false;
          const r = el.getBoundingClientRect();
          return r.top >= vr.top - 1 && r.bottom <= vr.bottom - 8 && r.height > 0;
        }
        const probeSelectors = [
          '[data-mobile-brief-section="contacts"]',
          '[data-mobile-brief-section="key-people"]',
          '[data-mobile-brief-section="logistics"]',
          '[data-mobile-brief-section="crew-note"]',
        ];
        var probesOk = true;
        for (var pi = 0; pi < probeSelectors.length; pi++) {
          var pel = document.querySelector(probeSelectors[pi]);
          if (!rowInView(pel)) probesOk = false;
        }
        const criticalItems = Array.from(
          document.querySelectorAll('[data-mobile-brief-section="critical"] li'),
        );
        var criticalInView = true;
        for (var i = 0; i < criticalItems.length; i++) {
          if (!rowInView(criticalItems[i])) criticalInView = false;
        }
        const usablePaper =
          firstR && paperR ? paperR.bottom - padB - firstR.top : 0;
        const usedContent =
          firstR && lastR ? lastR.bottom - firstR.top : 0;
        const fillRatio = usablePaper > 0 ? usedContent / usablePaper : 0;
        const bottomBlank =
          paperR && lastR ? paperR.bottom - padB - lastR.bottom : -1;
        function fs(el) {
          return el ? parseFloat(getComputedStyle(el).fontSize) : -1;
        }
        const couple = document.querySelector('[data-mobile-brief-first] p:nth-child(2)');
        const eventTitle = document.querySelector('[data-mobile-brief-section="schedule"] strong');
        const metaLoc = document.querySelector('[data-mobile-brief-section="schedule"] em');
        const factVal = document.querySelector('[data-mobile-brief-section="facts"] strong');
        const contactName = document.querySelector('[data-mobile-brief-section="contacts"] strong');
        const remindTitle = document.querySelector('[data-mobile-brief-section="critical"] strong');
        return {
          briefOp: sheet ? parseFloat(getComputedStyle(sheet).opacity || '0') : 0,
          dayOp: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') : 0,
          mapOp: map ? parseFloat(getComputedStyle(map).opacity || '0') : 0,
          app: parseFloat((sticky && sticky.getAttribute('data-mobile-app-progress')) || '0'),
          hasOffline: text.indexOf('Dostępny offline') >= 0,
          hasBrand: text.indexOf('OURWED') >= 0,
          hasDupFile: text.indexOf('BRIEF PDF OFFLINE') >= 0,
          hasDupTitle: text.indexOf('BRIEF ŚLUBNY') >= 0,
          hasCrewNote: text.indexOf('UWAGA DLA EKIPY') >= 0 && text.indexOf('Naturalny reportaż') >= 0,
          missing: missing,
          paperTopOk: !!(vr && paperR && paperR.top >= vr.top - 1),
          paperBottomOk: !!(vr && paperR && paperR.bottom <= vr.bottom - 6),
          bottomInset: vr && paperR ? vr.bottom - paperR.bottom : -1,
          lastInset: vr && lastR ? vr.bottom - lastR.bottom : -1,
          lastInView: rowInView(last),
          criticalInView: criticalInView,
          probesOk: probesOk,
          noInternalScroll: (function () {
            if (!paper || !doc) return false;
            return (
              paper.scrollHeight <= paper.clientHeight + 1 &&
              doc.scrollHeight <= doc.clientHeight + 1
            );
          })(),
          paperY: paper ? new DOMMatrix(getComputedStyle(paper).transform).m42 : 99,
          metaOverlap:
            metaR && paperR
              ? !(metaR.bottom <= paperR.top + 1 || paperR.bottom <= metaR.top + 1)
              : false,
          phoneW: chassis ? chassis.width : 0,
          phoneH: chassis ? chassis.height : 0,
          phoneL: chassis ? chassis.left : 0,
          phoneT: chassis ? chassis.top : 0,
          contentH: paper ? paper.scrollHeight : 0,
          paperH: paper ? paper.clientHeight : 0,
          viewportH: vr ? vr.height : 0,
          fillRatio: fillRatio,
          usedContent: usedContent,
          usablePaper: usablePaper,
          bottomBlank: bottomBlank,
          coupleFs: fs(couple),
          eventFs: fs(eventTitle),
          metaFs: fs(metaLoc),
          valueFs: fs(factVal),
          contactFs: fs(contactName),
          remindFs: fs(remindTitle),
        };
      `) as () => {
        briefOp: number
        dayOp: number
        mapOp: number
        app: number
        hasOffline: boolean
        hasBrand: boolean
        hasDupFile: boolean
        hasDupTitle: boolean
        hasCrewNote: boolean
        missing: string[]
        paperTopOk: boolean
        paperBottomOk: boolean
        bottomInset: number
        lastInset: number
        lastInView: boolean
        criticalInView: boolean
        probesOk: boolean
        noInternalScroll: boolean
        paperY: number
        metaOverlap: boolean
        phoneW: number
        phoneH: number
        phoneL: number
        phoneT: number
        contentH: number
        paperH: number
        viewportH: number
        fillRatio: number
        usedContent: number
        usablePaper: number
        bottomBlank: number
        coupleFs: number
        eventFs: number
        metaFs: number
        valueFs: number
        contactFs: number
        remindFs: number
      },
      )
      assert(briefFit.app >= MOBILE_APP_RANGES.briefEnter.end - 0.005, `app past brief enter @ ${vw}x${vh}`)
      assert(briefFit.briefOp > 0.9, `brief visible @ ${vw}x${vh}`)
      assert(briefFit.dayOp <= 0.05, `no day after brief enter @ ${vw}x${vh}`)
      assert(
        briefFit.briefOp + briefFit.mapOp >= 0.95 && briefFit.dayOp <= 0.05,
        `brief owns phone @ ${vw}x${vh}`,
      )
      assert(briefFit.hasOffline && briefFit.hasBrand, `brief status + brand @ ${vw}x${vh}`)
      assert(!briefFit.hasDupFile && !briefFit.hasDupTitle, `no duplicate brief titles @ ${vw}x${vh}`)
      assert(briefFit.hasCrewNote, `crew note present @ ${vw}x${vh}`)
      assertEq(briefFit.missing.length, 0, `missing brief copy: ${briefFit.missing.join(', ')} @ ${vw}x${vh}`)
      assert(briefFit.paperTopOk, `paper top in viewport @ ${vw}x${vh}`)
      assert(briefFit.paperBottomOk, `paper bottom inset ok @ ${vw}x${vh}`)
      assert(
        briefFit.bottomInset >= 6 && briefFit.bottomInset <= 40,
        `paper→viewport inset ${briefFit.bottomInset.toFixed(1)} @ ${vw}x${vh}`,
      )
      assert(briefFit.lastInView, `crew note last in view @ ${vw}x${vh}`)
      assert(briefFit.criticalInView, `all nie przegap rows in view @ ${vw}x${vh}`)
      assert(briefFit.probesOk, `dense sections in view @ ${vw}x${vh}`)
      assert(briefFit.noInternalScroll, `no internal brief overflow @ ${vw}x${vh}`)
      assert(Math.abs(briefFit.paperY) <= 2, `brief paper Y≈0 @ ${vw}x${vh}`)
      assert(!briefFit.metaOverlap, `status/paper no overlap @ ${vw}x${vh}`)
      assert(
        briefFit.bottomBlank >= 4 && briefFit.bottomBlank <= 56,
        `bottomGap ${briefFit.bottomBlank.toFixed(1)} in 4–56 @ ${vw}x${vh}`,
      )
      if (vw === 1920 && vh === 1080) {
        assert(
          briefFit.fillRatio >= 0.92,
          `primary fillRatio ${briefFit.fillRatio.toFixed(3)} >= 0.92 @ ${vw}x${vh}`,
        )
        assert(
          briefFit.bottomBlank >= 8 && briefFit.bottomBlank <= 36,
          `primary bottomGap ${briefFit.bottomBlank.toFixed(1)} in 8–36 @ ${vw}x${vh}`,
        )
      } else {
        assert(
          briefFit.fillRatio >= 0.88,
          `fillRatio ${briefFit.fillRatio.toFixed(3)} >= 0.88 @ ${vw}x${vh}`,
        )
      }
      assert(briefFit.contentH <= briefFit.paperH + 1, `paper overflow <= 1 @ ${vw}x${vh}`)
      assert(briefFit.coupleFs >= 15, `couple fs ${briefFit.coupleFs} >= 15 @ ${vw}x${vh}`)
      assert(briefFit.eventFs >= 12, `schedule title fs ${briefFit.eventFs} >= 12 @ ${vw}x${vh}`)
      assert(briefFit.valueFs >= 11.5, `key value fs ${briefFit.valueFs} >= 11.5 @ ${vw}x${vh}`)
      assert(briefFit.contactFs >= 11, `contact fs ${briefFit.contactFs} >= 11 @ ${vw}x${vh}`)
      assert(briefFit.remindFs >= 11, `nie przegap fs ${briefFit.remindFs} >= 11 @ ${vw}x${vh}`)
      assert(briefFit.metaFs >= 9.75, `location fs ${briefFit.metaFs} >= 9.75 @ ${vw}x${vh}`)
      assert(Math.abs(briefFit.phoneW - settledBox.w) <= 1, `phone W lock brief @ ${vw}x${vh}`)
      assert(Math.abs(briefFit.phoneH - settledBox.h) <= 1, `phone H lock brief @ ${vw}x${vh}`)
      assert(Math.abs(briefFit.phoneL - settledBox.l) <= 2, `phone X lock brief @ ${vw}x${vh}`)
      assert(Math.abs(briefFit.phoneT - settledBox.t) <= 2, `phone Y lock brief @ ${vw}x${vh}`)

      // Reverse: Brief → Navigation arrival (no day flash), then further back
      await scrollMobileAppProgress(page, MOBILE_APP_RANGES.arriveHold.end)
      const reverseArrive = await page.evaluate(() => {
        const map = document.querySelector('[data-mobile-app-screen="navigation"]') as HTMLElement | null
        const dayLayer = document.querySelector('[data-mobile-app-layer="day"]') as HTMLElement | null
        const brief = document.querySelector('[data-mobile-brief-sheet]') as HTMLElement | null
        return {
          mapOp: map ? parseFloat(getComputedStyle(map).opacity || '0') : 0,
          dayOp: dayLayer ? parseFloat(getComputedStyle(dayLayer).opacity || '0') : 0,
          briefOp: brief ? parseFloat(getComputedStyle(brief).opacity || '0') : 0,
        }
      })
      assert(reverseArrive.mapOp >= 0.9, `reverse nav arrival @ ${vw}x${vh}`)
      assert(reverseArrive.dayOp <= 0.05, `reverse no day between brief/nav @ ${vw}x${vh}`)
      assert(reverseArrive.briefOp <= 0.1, `reverse brief closed @ ${vw}x${vh}`)

      await scrollMobileAppProgress(page, 0.12)
      const appReverse = await page.evaluate(() => {
        const dashLayer = document.querySelector('[data-mobile-app-layer="dashboard"]') as HTMLElement | null
        const card = document.querySelector('[data-mobile-wedding-card]')
        return {
          dashOp: dashLayer ? parseFloat(getComputedStyle(dashLayer).opacity || '0') : 0,
          hasCard: card != null,
        }
      })
      assert(appReverse.dashOp > 0.5, `reverse dashboard reconstruct @ ${vw}x${vh}`)
      assert(appReverse.hasCard, `reverse wedding card @ ${vw}x${vh}`)

      await scrollMobileStoryProgress(page, 0.12)
      const reverse = await page.evaluate(() => {
        const exitShell = document.querySelector('[data-lv2-features-exit]') as HTMLElement | null
        const motionLayer = exitShell?.firstElementChild as HTMLElement | null
        const atlas = document.querySelector('[data-lv2-features-atlas]')
        const line = document.querySelector('[data-mobile-headline] [class*="headlineLine"]') as HTMLElement | null
        return {
          featuresOp: motionLayer ? parseFloat(getComputedStyle(motionLayer).opacity || '1') : 0,
          headlineOp: line ? parseFloat(getComputedStyle(line).opacity || '0') : 0,
          modules: atlas?.querySelectorAll('[data-feature]').length ?? 0,
        }
      })
      assert(reverse.featuresOp > 0.75, `reverse features reconstruct @ ${vw}x${vh}`)
      assert(reverse.headlineOp < 0.35, `reverse headline fades @ ${vw}x${vh}`)
      assertEq(reverse.modules, 9, `nine modules on reverse @ ${vw}x${vh}`)
    }

    console.log('PASS  mobile story phone geometry')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  mobile story phone geometry (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testMobileStoryPhoneGeometry()

async function testPostBriefMorphMonotonicity() {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'networkidle',
      timeout: 8000,
    })
    await page.waitForSelector('[data-testid="lv2-mobile-story"]', { timeout: 8000 })

    /* Reach Brief end / start of post-Brief tail. */
    await scrollMobileAppProgress(page, 0.995)

    const samples = await page.evaluate(async () => {
      const track = document.querySelector('[data-testid="lv2-mobile-story"]') as HTMLElement | null
      if (!track) return [] as Array<Record<string, number | string>>
      const navH =
        parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) ||
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lv3-nav-h')) ||
        68
      const cs = getComputedStyle(track)
      const preSvh = parseFloat(cs.getPropertyValue('--mobile-track-pre-svh')) || 260
      const dashSvh = parseFloat(cs.getPropertyValue('--mobile-track-dash-svh')) || 120
      const postSvh = parseFloat(cs.getPropertyValue('--mobile-track-post-svh')) || 300
      const postBriefSvh = parseFloat(cs.getPropertyValue('--mobile-track-post-brief-svh')) || 112
      const studioSvh = parseFloat(cs.getPropertyValue('--mobile-track-studio-history-svh')) || 0
      const importSvh = parseFloat(cs.getPropertyValue('--mobile-track-season-import-svh')) || 0
      const founderSvh = parseFloat(cs.getPropertyValue('--mobile-track-import-cover-hold-svh') || cs.getPropertyValue('--mobile-track-founder-svh')) || 0
      const contentSvh = preSvh + dashSvh + postSvh
      const mappingSvh = contentSvh + postBriefSvh
      const totalSvh = mappingSvh + studioSvh + importSvh + founderSvh
      const usable = window.innerHeight - navH
      const mappingHeight = track.offsetHeight * (mappingSvh / totalSvh)
      const mappingTravel = Math.max(1, mappingHeight - usable)
      const contentTravel = Math.max(1, mappingTravel * (contentSvh / mappingSvh))
      const postBriefTravel = Math.max(1, mappingTravel - contentTravel)

      const out: Array<Record<string, number | string>> = []
      for (let i = 0; i <= 24; i++) {
        const pbTarget = i / 24
        const desiredDist = contentTravel + pbTarget * postBriefTravel
        const desiredTop = navH - desiredDist
        const rect = track.getBoundingClientRect()
        window.scrollBy(0, rect.top - desiredTop)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

        const sticky = document.querySelector('[data-mobile-owned]') as HTMLElement | null
        const root = document.querySelector('[data-mobile-phone]') as HTMLElement | null
        const screen = document.querySelector('[data-phone-screen] [class*="screenContent"]') as HTMLElement | null
        const shackle = document.querySelector('[data-security-lock-shackle-wrap]') as HTMLElement | null
        const pb = parseFloat(sticky?.getAttribute('data-mobile-post-brief') || '0')
        const frozen = sticky?.getAttribute('data-mobile-track-budgets-frozen') === 'true'
        const aspectStr = root ? getComputedStyle(root).aspectRatio : '0'
        let aspect = 430 / 932
        if (aspectStr.includes('/')) {
          const [a, b] = aspectStr.split('/').map((x) => parseFloat(x.trim()))
          if (b) aspect = a / b
        } else {
          aspect = parseFloat(aspectStr) || aspect
        }
        const screenOp = screen ? parseFloat(getComputedStyle(screen).opacity || '1') : 1
        const shackleOp = shackle ? parseFloat(getComputedStyle(shackle).opacity || '0') : 0
        out.push({
          postBrief: pb,
          aspect,
          screen: screenOp,
          shackle: shackleOp,
          frozen: frozen ? 1 : 0,
          scrollY: window.scrollY,
        })
      }
      return out
    })

    assert(samples.length >= 20, 'postBrief runtime samples collected')
    const morphSamples: MorphSample[] = samples.map((s) => {
      const aspect = Number(s.aspect)
      const screen = Number(s.screen)
      const shackle = Number(s.shackle)
      return {
        postBrief: Number(s.postBrief),
        aspect,
        screen,
        shackle,
        classification: classifyMorph(aspect, screen, shackle),
      }
    })
    const hits = findForwardMorphOscillations(morphSamples)
    assert(
      hits.length === 0,
      `runtime postBrief morph must not oscillate, hits=${JSON.stringify(hits.slice(0, 6))}`,
    )
    let sawLock = false
    for (const s of morphSamples) {
      if (s.classification === 'LOCK') sawLock = true
      if (sawLock) {
        assert(s.classification !== 'PHONE', `LOCK must not regress to PHONE at pb=${s.postBrief}`)
      }
    }
    const frozenCount = samples.filter((s) => Number(s.frozen) === 1).length
    assert(frozenCount >= samples.length - 2, 'track budgets frozen once postBrief active')

    const gap = await page.evaluate(() => {
      const chassis = document.querySelector('[data-phone-chassis]') as HTMLElement | null
      const eyebrow = document.querySelector('[data-security-copy] .secEyebrow, [data-security-copy] p') as HTMLElement | null
      if (!chassis || !eyebrow) return -1
      return Math.round(eyebrow.getBoundingClientRect().top - chassis.getBoundingClientRect().bottom)
    })
    assert(gap >= 36 && gap <= 96, `lock→copy gap in band @1440×900 gap=${gap}`)

    console.log('PASS  postBrief morph monotonicity (runtime)')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  postBrief morph monotonicity (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testPostBriefMorphMonotonicity()

/* ─────────────────────────────────────────────────────────────────────────
   CHOREOGRAPHY INVARIANT — Stage 1 (transform-only) vs Stage 2 (body morph)
   ─────────────────────────────────────────────────────────────────────────

   Core rule: bodyCompress must be exactly 0 while the Brief is still
   readable (briefOpacity > 0.10 OR screenMerge < 0.90).

   Meanwhile, outerScale and screenMerge must ALREADY be non-trivial
   before bodyCompress starts — proving the phone is shrinking and
   darkening before any layout-affecting geometry morph begins.
   ─────────────────────────────────────────────────────────────────────── */
{
  const READABLE_THRESHOLD = 0.10
  const SCREEN_MERGE_THRESHOLD = 0.90

  // Sample 200 points across the full post-brief progress range
  for (let i = 0; i <= 200; i++) {
    const p = i / 200
    const briefOpacity = postBriefBriefOpacityAt(p)
    const screenMerge = postBriefScreenMergeAt(p)
    const bodyCompress = postBriefBodyCompressAt(p)
    const outerScale = postBriefOuterScaleAt(p)

    // INVARIANT 1: During readable Brief phase, bodyCompress must be 0
    if (briefOpacity > READABLE_THRESHOLD && screenMerge < SCREEN_MERGE_THRESHOLD) {
      assert(
        bodyCompress === 0,
        `bodyCompress must be 0 while Brief readable (p=${p.toFixed(3)}, briefOp=${briefOpacity.toFixed(3)}, merge=${screenMerge.toFixed(3)}, compress=${bodyCompress.toFixed(4)})`,
      )
    }

    // INVARIANT 2: outerScale must be < 1 before bodyCompress starts (phone already shrinking)
    if (p > POST_BRIEF_MORPH_START + 0.01 && p < POST_BRIEF_BODY_COMPRESS_START) {
      assert(
        outerScale < 1,
        `outerScale must be < 1 before body morph begins (p=${p.toFixed(3)}, scale=${outerScale.toFixed(4)})`,
      )
      assert(
        bodyCompress === 0,
        `bodyCompress must be 0 before body morph threshold (p=${p.toFixed(3)})`,
      )
    }

    // INVARIANT 3: screenMerge must be increasing before bodyCompress starts
    if (p > POST_BRIEF_MORPH_START + 0.01 && p < POST_BRIEF_BODY_COMPRESS_START) {
      assert(
        screenMerge > 0,
        `screenMerge must be > 0 before body morph begins (p=${p.toFixed(3)}, merge=${screenMerge.toFixed(4)})`,
      )
    }
  }

  // INVARIANT 4: At body compress start, scale already changed substantially
  const scaleAtBodyStart = postBriefOuterScaleAt(POST_BRIEF_BODY_COMPRESS_START)
  assert(
    scaleAtBodyStart < 0.90,
    `At bodyCompress start, scale must already be < 0.90 (got ${scaleAtBodyStart.toFixed(4)})`,
  )

  // INVARIANT 5: At body compress start, brief effectively gone
  const briefOpAtBodyStart = postBriefBriefOpacityAt(POST_BRIEF_BODY_COMPRESS_START)
  assert(
    briefOpAtBodyStart <= READABLE_THRESHOLD,
    `At bodyCompress start, briefOpacity must be <= 0.10 (got ${briefOpAtBodyStart.toFixed(4)})`,
  )

  // INVARIANT 6: POST_BRIEF_BODY_COMPRESS_START > screenFade.end
  assert(
    POST_BRIEF_BODY_COMPRESS_START > POST_BRIEF_RANGES.screenFade.end,
    `bodyCompress must start after screenFade ends (${POST_BRIEF_BODY_COMPRESS_START} vs ${POST_BRIEF_RANGES.screenFade.end})`,
  )

  // INVARIANT 7: outerScale is strictly monotonic (never increases once shrinking starts)
  let prevScale = 1
  for (let i = 0; i <= 200; i++) {
    const p = i / 200
    const s = postBriefOuterScaleAt(p)
    assert(s <= prevScale + 0.001, `outerScale must not increase (p=${p.toFixed(3)}, scale=${s.toFixed(4)}, prev=${prevScale.toFixed(4)})`)
    prevScale = s
  }

  // INVARIANT 8: bodyCompress is strictly monotonic
  let prevCompress = 0
  for (let i = 0; i <= 200; i++) {
    const p = i / 200
    const c = postBriefBodyCompressAt(p)
    assert(c >= prevCompress - 0.001, `bodyCompress must not decrease (p=${p.toFixed(3)}, compress=${c.toFixed(4)}, prev=${prevCompress.toFixed(4)})`)
    prevCompress = c
  }

  console.log('PASS  early-morph choreography invariants (Stage 1 / Stage 2 separation)')
}

{
  const r = STUDIO_HISTORY_RANGES
  assertEq(studioLockScaleAt(0), 1, 'studio lock scale identity at start')
  assertEq(studioLockYVhAt(0), 0, 'studio lock Y identity at start')
  assertEq(studioSecurityCopyOpAt(0), 1, 'security copy fully visible at studio start')
  assertEq(studioSecurityCopyYAt(0), 0, 'security copy Y identity at studio start')
  assert(studioEyebrowOpAt(0) === 0, 'studio history hidden before transition')
  assert(studioHeadlineOpAt(0) === 0, 'headline hidden before transition')
  assert(studioTimelineOpAt(0) === 0, 'timeline hidden before transition')
  assert(studioYear2026OpAt(0) === 0 && studioYear2027OpAt(0) === 0 && studioYear2028OpAt(0) === 0, 'years hidden at start')
  assert(studioCardsOpAt(0) === 0, 'cards hidden at start')
  assert(r.lockTravel.start === r.securityExit.start, 'lock travel and copy exit share start')
  assert(r.lockTravel.start === r.securityHold.end, 'travel begins after reading hold')
  assert(r.securityHold.end >= 0.04 && r.securityHold.end <= 0.08, 'reading hold ~100px band')
  assert(r.eyebrow.start >= 0.34 && r.eyebrow.start <= 0.38, 'eyebrow starts near lock settle')
  assert(r.eyebrow.start >= r.lockTravel.end - 0.03, 'eyebrow near end of lock travel')
  assert(r.headline.start >= r.eyebrow.start, 'headline after eyebrow')
  assert(r.headline.start >= 0.38, 'headline after lock travel end')
  assert(r.support.start >= r.headline.start, 'support after headline')
  assert(r.timeline.start >= r.headline.start, 'timeline after headline')
  assert(r.year2026.start <= r.year2027.start && r.year2027.start <= r.year2028.start, 'year stagger 2026→2028')
  assertEq(r.lockTravel.start, 0.06, 'lock travel start frozen')
  assertEq(r.lockTravel.end, 0.38, 'lock travel end frozen')
  assert(Math.abs(studioLockScaleAt(1) - STUDIO_LOCK_SCALE_END) < 0.001, 'final studio lock scale')
  assert(studioLockYVhAt(1) < 0, 'lock Y moves upward')
  assert(studioSecurityCopyOpAt(1) === 0, 'security copy gone at end')
  assert(studioSecurityCopyYAt(1) === -12, 'security copy exits -12px')

  /* Overlap guard: lock must be nearly settled before readable studio text. */
  for (const p of [0.28, 0.32, 0.36, 0.4, 0.44, 0.48, 0.52]) {
    const lockT = studioLockTravelT(p)
    const eyebrow = studioEyebrowOpAt(p)
    const headline = studioHeadlineOpAt(p)
    const support = studioSupportOpAt(p)
    if (lockT < 0.92) {
      assert(eyebrow < 0.05, `eyebrow hidden while lockT<0.92 (p=${p}, lockT=${lockT.toFixed(3)}, op=${eyebrow.toFixed(3)})`)
      assert(headline < 0.05, `headline hidden while lockT<0.92 (p=${p}, lockT=${lockT.toFixed(3)}, op=${headline.toFixed(3)})`)
      assert(support < 0.05, `support hidden while lockT<0.92 (p=${p}, lockT=${lockT.toFixed(3)}, op=${support.toFixed(3)})`)
    }
    if (lockT < 0.96) {
      assert(headline < 0.05, `headline hidden while lockT<0.96 (p=${p}, lockT=${lockT.toFixed(3)}, op=${headline.toFixed(3)})`)
      assert(support < 0.05, `support hidden while lockT<0.96 (p=${p})`)
    }
  }
  assert(studioLockTravelT(r.eyebrow.start) >= 0.9, 'at eyebrow start lock travel ≥90%')
  assert(studioEyebrowOpAt(0.06 + 0.9 * (r.lockTravel.end - r.lockTravel.start)) < 0.05, 'eyebrow near-zero at lockT=0.90')
  assert(studioHeadlineOpAt(r.lockTravel.end) < 0.05, 'headline near-zero at lock settle')
  assert(studioSupportOpAt(0) === 0, 'support hidden at start')
  assert(studioEyebrowOpAt(r.lockTravel.end) > 0.05, 'eyebrow already entering at lock settle (no dead pause)')
  assert(studioHeadlineOpAt(r.eyebrow.end) > 0.05 || r.headline.start <= r.eyebrow.end, 'headline follows eyebrow closely')
  assertEq(studioLockSettledGateAt(r.lockTravel.end), 1, 'settled gate fully open at lock end')
  assertEq(studioLockSettledGateAt(0.36), 0, 'settled gate closed before lock tip')

  /* Reverse collision window: text gone before significant lock descent. */
  for (const p of [0.5, 0.46, 0.42, 0.4, 0.38, 0.36, 0.34, 0.32, 0.3]) {
    const lockT = studioLockTravelT(p)
    const eye = studioEyebrowOpAt(p)
    const head = studioHeadlineOpAt(p)
    const supp = studioSupportOpAt(p)
    if (lockT < 0.96) {
      assert(eye < 0.05 && head < 0.05 && supp < 0.05, `reverse: text cleared before lock leaves settle (p=${p}, lockT=${lockT.toFixed(3)})`)
    }
  }
  assert(studioEyebrowOpAt(0.36) < 0.05, 'reverse @0.36 eyebrow gone')
  assert(studioHeadlineOpAt(0.36) < 0.05, 'reverse @0.36 headline gone')
  assert(studioSupportOpAt(0.36) < 0.05, 'reverse @0.36 support gone')
  assert(studioLockTravelT(0.36) < 1, 'reverse @0.36 lock has left final seat')
  assert(studioEyebrowOpAt(0.34) === 0 && studioHeadlineOpAt(0.34) === 0, 'reverse @0.34 text fully cleared')
  assert(studioLockTravelT(0.4) === 1, 'forward/reverse @0.40 lock still fully settled')
  assert(studioHeadlineOpAt(0.4) < 0.05, 'forward @0.40 headline not yet readable')

  const progressSrc = read('src/features/landing-v2/mobile-story/studioHistoryProgress.ts')
  assertIncludes(progressSrc, 'studioLockSettledGateAt', 'lock-settled gate exists')
  assertNotIncludes(progressSrc, 'scrollDirection', 'no scroll-direction branching')
  assertNotIncludes(progressSrc, 'isReverse', 'no reverse flag')
  assertNotIncludes(progressSrc, 'useState', 'no React state in progress helpers')

  let prevScale = 1
  let prevY = 0
  let prevSec = 1
  let prevHist = 0
  for (let i = 0; i <= 200; i++) {
    const p = i / 200
    const scale = studioLockScaleAt(p)
    const y = studioLockYVhAt(p)
    const sec = studioSecurityCopyOpAt(p)
    const hist = studioEyebrowOpAt(p)
    assert(scale <= prevScale + 1e-9, `lock scale monotonic p=${p}`)
    assert(y <= prevY + 1e-9, `lock Y monotonic upward p=${p}`)
    assert(sec <= prevSec + 1e-9, `security copy opacity monotonic p=${p}`)
    assert(hist >= prevHist - 1e-9, `studio history opacity monotonic p=${p}`)
    prevScale = scale
    prevY = y
    prevSec = sec
    prevHist = hist
  }

  const holdMid = (r.securityHold.start + r.securityHold.end) / 2
  assert(studioLockScaleAt(holdMid) === 1, 'no lock shrink during security reading hold')
  assert(studioEyebrowOpAt(holdMid) === 0, 'no studio copy during security reading hold')

  const rev = [1, 0.8, 0.5, 0.2, 0]
  for (const p of rev) {
    assert(typeof studioLockScaleAt(p) === 'number', `reverse reconstruct scale at ${p}`)
    assert(studioLockScaleAt(p) === studioLockScaleAt(p), 'deterministic scale')
  }

  assertEq(POST_BRIEF_MORPH_START, 0.001, 'Brief→Lock morph start unchanged')
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH, 112, 'postBrief tail tightened')
  assert(POST_BRIEF_RANGES.bodyCompress.start === 0.24, 'body compress start unchanged')
  assert(POST_BRIEF_RANGES.bodyCompress.end === 0.52, 'body compress end unchanged')

  const claims = read('src/features/landing-v2/security-history/securityHistoryClaims.ts')
  assertIncludes(claims, 'pozostają uporządkowane', 'history support uses pozostają')
  assertNotIncludes(claims, 'klientach zostają uporządkowane', 'old zostają wording removed from history support')

  const mobileSrc = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const revealSrc = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.tsx')
  assertNotIncludes(revealSrc, 'HeroPhoneFrame', 'reveal does not mount a second phone')
  assertNotIncludes(revealSrc, 'SecurityLockGraphic', 'reveal does not mount a second lock')
  assertIncludes(revealSrc, 'paintVisibility', 'hard paint kill via visibility')
  assertIncludes(revealSrc, 'visibility: headlineVisibility', 'headline visibility bound')
  assertIncludes(revealSrc, 'data-studio-history-owner="mobile"', 'single mobile owner marker')
  assertIncludes(revealSrc, 'exitProgress', 'history exit driven by import progress')
  assertIncludes(revealSrc, 'seasonImportHistoryShellYAt', 'history recess Y wired')
  assertIncludes(revealSrc, "from 'lucide-react'", 'reuses project lucide icon library')
  assertIncludes(revealSrc, 'UserRound', 'client row uses UserRound person icon')
  assertNotIncludes(revealSrc, 'CoupleMark', 'old couple/face mark removed')
  assertNotIncludes(revealSrc, 'cx="5.2"', 'old two-dot couple SVG removed')
  assertNotIncludes(revealSrc, 'select2027', 'no 2027 select on history entrance path')
  assertNotIncludes(revealSrc, 'Season2027Bridge', 'no bridge on history path')
  const phoneMounts = mobileSrc.split('<HeroPhoneFrame').length - 1
  assert(phoneMounts === 2, 'one phone in simple + one in scroll (not a second lock)')

  const historyCss = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.module.css')
  assertIncludes(historyCss, 'clamp(18px, 2vh, 28px)', 'lock→eyebrow gap uses responsive clamp')
  assertIncludes(historyCss, 'max(0px, 2.8vh - 22px)', 'tall-desktop lock slot air via vh padding')
  assertIncludes(historyCss, '--lv2-chapter-hero-top', 'history uses shared chapter hero top token')
  assertNotIncludes(historyCss, 'min(920px', 'timeline track matches seasons width (no narrow 920 band)')
  assertIncludes(historyCss, 'align-items: end', 'timeline dots sit toward years')
  assertIncludes(
    historyCss,
    'grid-template-columns: repeat(3, minmax(0, 1fr))',
    'timeline shares seasons column template',
  )
  assertIncludes(historyCss, 'gap: clamp(1rem, 2.4vw, 2rem)', 'timeline gap matches seasons')

  const mobileCss = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  assertIncludes(mobileCss, '--lv2-chapter-hero-top: 11%', 'shared History hero top SoT')
  assertIncludes(mobileCss, '--lv2-chapter-import-hero-top: 14.6%', 'shared Import hero top aligned to History')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH, 145, 'studio history scroll budget tightened')
  assertEq(MOBILE_TRACK_SEASON_IMPORT_SVH, 150, 'season import scroll budget tightened')

  const importCss = read('src/features/landing-v2/mobile-story/StudioImportReveal.module.css')
  assertIncludes(importCss, '--lv2-chapter-import-hero-top', 'import root uses shared import hero top')
  assertNotIncludes(importCss, 'top: 4.2%', 'old independent import top removed')
  assertNotIncludes(importCss, 'top: 2.8%', 'short-height import top override removed')
  assertNotIncludes(importCss, 'top: 1.6%', 'ultra-short import top override removed')

  console.log('PASS  lock → studio history chapter')
}

{
  const r = SEASON_IMPORT_RANGES
  assertEq(MOBILE_TRACK_SEASON_IMPORT_SVH, 150, 'import track budget tightened 150svh')
  assert(r.historyHold.end === 0.05, 'history reading hold ends 0.05')
  assert(r.historyShellExit.start === 0.05, 'history shell exit starts after hold')
  assert(r.historyShellExit.end === 0.24, 'history shell exit ends 0.24')
  assert(r.lockExit.start === 0.05, 'lock exits with history')
  assert(r.lockExit.end === 0.22, 'lock exit completes with history chapter')
  assert(r.importHeadline.start >= 0.2, 'import headline after history begins exiting')
  assert(r.sheetPanel.start >= 0.38, 'spreadsheet after process begins')
  assert(r.assignPanel.start >= r.sheetPanel.start, 'assignment after/with sheet')
  assert(r.readyState.start >= r.assignFields.start, 'ready after fields')
  assert(r.finalHold.start >= r.readyState.end, 'final hold after ready')
  assertEq(SEASON_IMPORT_SHELL_Y_PX, -130, 'history recesses upward ~130px')
  assertEq(SEASON_IMPORT_SHELL_SCALE_END, 0.97, 'history shell scale end restrained')
  assertEq(SEASON_IMPORT_LOCK_Y_PX, -130, 'lock recesses upward with history')
  assertEq(SEASON_IMPORT_LOCK_SCALE_END, 0.96, 'lock scale end restrained')

  /* importProgress=0 leaves approved history fully visible */
  assertEq(seasonImportHistoryIntroOpAt(0), 1, 'history intro intact at import 0')
  assertEq(seasonImportHistoryShellOpAt(0), 1, 'history shell intact at import 0')
  assertEq(seasonImportHistoryShellYAt(0), 0, 'history Y identity at import 0')
  assertEq(seasonImportHistoryShellScaleAt(0), 1, 'history scale identity at import 0')
  assertEq(seasonImportLockOpAt(0), 1, 'lock intact at import 0')
  assertEq(seasonImportLockYAt(0), 0, 'lock Y identity at import 0')
  assertEq(seasonImportLockScaleAt(0), 1, 'lock scale identity at import 0')
  assertEq(seasonImportHistoryYear2026OpAt(0), 1, '2026 intact at import 0')
  assertEq(seasonImportHistoryYear2027OpAt(0), 1, '2027 intact at import 0')
  assertEq(seasonImportHistoryYear2028OpAt(0), 1, '2028 intact at import 0')
  assertEq(seasonImportHeadlineOpAt(0), 0, 'import headline hidden at import 0')
  assertEq(seasonImportEyebrowOpAt(0), 0, 'import eyebrow hidden at import 0')
  assertEq(seasonImportSheetOpAt(0), 0, 'spreadsheet hidden at import 0')

  /* All three seasons exit together — no special 2027 isolation */
  for (const p of [0.1, 0.14, 0.18, 0.22]) {
    const a = seasonImportHistoryYear2026OpAt(p)
    const b = seasonImportHistoryYear2027OpAt(p)
    const c = seasonImportHistoryYear2028OpAt(p)
    assert(Math.abs(a - b) < 1e-9 && Math.abs(b - c) < 1e-9, `all seasons exit together at p=${p}`)
  }

  /* History shell Y/opacity monotonic during exit */
  let prevY = 1
  let prevOp = 2
  let prevScale = 2
  let prevLockY = 1
  let prevLockOp = 2
  for (let i = 0; i <= 100; i++) {
    const p = i / 100
    const y = seasonImportHistoryShellYAt(p)
    const op = seasonImportHistoryShellOpAt(p)
    const sc = seasonImportHistoryShellScaleAt(p)
    const lockY = seasonImportLockYAt(p)
    const lockOp = seasonImportLockOpAt(p)
    assert(y <= prevY + 1e-9, `history Y moves upward monotonically p=${p}`)
    assert(op <= prevOp + 1e-9, `history opacity decreases monotonically p=${p}`)
    assert(sc <= prevScale + 1e-9, `history scale decreases monotonically p=${p}`)
    /* Lock Y zeros only after paint-kill; while visible it must move up with History. */
    if (lockOp >= 0.02) {
      assert(lockY <= prevLockY + 1e-9, `lock Y moves upward with history p=${p}`)
    }
    assert(lockOp <= prevLockOp + 1e-9, `lock opacity decreases with history p=${p}`)
    prevY = y
    prevOp = op
    prevScale = sc
    if (lockOp >= 0.02) prevLockY = lockY
    prevLockOp = lockOp
  }

  /* Mid-exit: lock is leaving (not stationary) */
  const mid = 0.14
  assert(seasonImportLockOpAt(mid) < 0.7, 'lock fading mid history exit')
  assert(seasonImportLockYAt(mid) < -20, 'lock translating upward mid history exit')
  assert(seasonImportHistoryShellYAt(mid) < -20, 'history translating upward mid exit')
  assert(Math.abs(seasonImportLockOpAt(mid) - seasonImportHistoryShellOpAt(mid)) < 0.25, 'lock and history opacity stay coupled')

  /* Headline handoff: Import readable ⇒ History mostly gone */
  for (let i = 0; i <= 200; i++) {
    const p = i / 200
    const hist = seasonImportHistoryIntroOpAt(p)
    const imp = seasonImportHeadlineOpAt(p)
    if (imp > 0.35) {
      assert(hist < 0.1, `history headline faint when import readable p=${p} hist=${hist} imp=${imp}`)
    }
  }

  let prevImp = -1
  let prevSheet = -1
  let prevReady = -1
  for (let i = 0; i <= 100; i++) {
    const p = i / 100
    const imp = seasonImportHeadlineOpAt(p)
    const sheet = seasonImportSheetOpAt(p)
    const ready = seasonImportReadyOpAt(p)
    assert(imp >= prevImp - 1e-9, `import headline monotonic p=${p}`)
    assert(sheet >= prevSheet - 1e-9, `sheet opacity monotonic p=${p}`)
    assert(ready >= prevReady - 1e-9, `ready opacity monotonic p=${p}`)
    prevImp = imp
    prevSheet = sheet
    prevReady = ready
  }

  const claims = read('src/features/landing-v2/mobile-story/seasonImportClaims.ts')
  assertIncludes(claims, LV2_SEASON_IMPORT_COPY.headlineLine1, 'exact import headline line 1')
  assertIncludes(claims, LV2_SEASON_IMPORT_COPY.headlineLine2, 'exact import headline line 2')
  assertIncludes(claims, 'zlecenia_sezon_2027.xlsx', 'spreadsheet filename')
  assertIncludes(claims, 'Julia i Adrian', 'selected assignment couple')
  assertIncludes(claims, 'Umowa_Julia_Adrian.pdf', 'attached PDF')
  assertEq(LV2_SEASON_IMPORT_ROWS.length, 5, 'five spreadsheet rows')
  assert(LV2_SEASON_IMPORT_ROWS[0]?.selected === true, 'first row selected')
  assertEq(LV2_SEASON_IMPORT_ASSIGNMENT.couple, 'Julia i Adrian', 'assignment maps from selected row')

  const importReveal = read('src/features/landing-v2/mobile-story/StudioImportReveal.tsx')
  assertIncludes(importReveal, 'paintVisibility', 'import hard paint kill')
  assertIncludes(importReveal, 'data-studio-import-owner="mobile"', 'single import owner')
  assertIncludes(importReveal, 'FileSpreadsheet', 'lucide spreadsheet icon')
  assertIncludes(importReveal, 'MapPin', 'location detail uses MapPin')
  assertIncludes(importReveal, 'FileText', 'document detail uses FileText')
  assertIncludes(importReveal, 'CheckCircle2', 'ready status uses check icon')
  assertIncludes(importReveal, 'Powiązany dokument', 'attachment relationship label')
  assertIncludes(importReveal, 'data-import-panel="sheet"', 'spreadsheet panel in import reveal')
  assertIncludes(importReveal, 'LV2_SEASON_IMPORT_ROWS', 'spreadsheet rows owned by import reveal')
  assertNotIncludes(importReveal, 'Season2027Bridge', 'no FLIP bridge in import reveal')
  assertNotIncludes(importReveal, 'useState', 'no React state in import reveal')
  assertNotIncludes(importReveal, 'getBoundingClientRect', 'no layout reads in import reveal')
  assertNotIncludes(importReveal, 'filter:', 'no animated filters in import reveal')
  assertNotIncludes(importReveal, 'blur(', 'no blur in import reveal')
  assertNotIncludes(importReveal, 'scrollDirection', 'no direction state')
  assertNotIncludes(importReveal, 'isReverse', 'no reverse flag')

  const importCss = read('src/features/landing-v2/mobile-story/StudioImportReveal.module.css')
  assertIncludes(importCss, '--import-panel-bg', 'import panel surface token')
  assertIncludes(importCss, '--import-panel-radius', 'import radius token')
  assertIncludes(importCss, '--import-shadow', 'import shadow token')
  assertIncludes(importCss, 'min(1120px', 'import workspace ~1120px at desktop')
  assertIncludes(importCss, 'clamp(36px', 'generous panel gap')
  assertNotIncludes(importCss, 'blur(', 'no CSS blur animation')
  assertNotIncludes(importCss, 'backdrop-filter', 'no glass on import panels')

  const mobileSrc = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertNotIncludes(mobileSrc, 'Season2027Bridge', 'bridge not mounted in MobileStory')
  assertIncludes(mobileSrc, 'seasonImportLockYAt', 'lock Y exit wired into phoneSystem')
  assertIncludes(mobileSrc, 'seasonImportLockScaleAt', 'lock scale exit wired into phoneSystem')
  assert(exists('src/features/landing-v2/mobile-story/Season2027Bridge.tsx') === false, 'Season2027Bridge file removed')
  assert(exists('src/features/landing-v2/mobile-story/seasonImportFlip.ts') === false, 'FLIP math file removed')
  assert(exists('src/features/landing-v2/mobile-story/useSeasonImportFlip.ts') === false, 'FLIP hook removed')

  const progressSrc = read('src/features/landing-v2/mobile-story/seasonImportProgress.ts')
  assertNotIncludes(progressSrc, 'useState', 'progress helpers pure')
  assertNotIncludes(progressSrc, 'scrollDirection', 'no scroll direction')
  assertNotIncludes(progressSrc, 'bridgeHandoff', 'no bridge handoff range')
  assertNotIncludes(progressSrc, 'Season2027Bridge', 'no bridge component refs')
  assertIncludes(progressSrc, 'historyShellExit', 'unified history shell exit')
  assertIncludes(progressSrc, 'seasonImportLockYAt', 'lock Y helper present')
  assertNotIncludes(progressSrc, 'filter:', 'no animated filter in progress helpers')
  assertNotIncludes(progressSrc, 'backdrop-filter', 'no backdrop-filter in progress helpers')

  const historyReveal = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.tsx')
  assertIncludes(historyReveal, 'exitProgress', 'history accepts import exit progress')
  assertIncludes(historyReveal, 'seasonImportHistoryShellOpAt', 'unified shell exit wired')
  assertIncludes(historyReveal, 'seasonImportHistoryShellYAt', 'history Y recess wired')
  assertNotIncludes(historyReveal, 'select2027', 'no 2027 isolation select')
  assertNotIncludes(historyReveal, 'flank2026', 'no flank drift exit')
  assertNotIncludes(historyReveal, 'data-studio-card-2027', 'no 2027 bridge source marker')
  assertNotIncludes(historyReveal, 'Season2027Bridge', 'history does not reference bridge')

  assertIncludes(
    read('src/features/landing-v2/mobile-story/LandingV2SeasonImportStory.tsx'),
    'data-season-import-theater="absorbed"',
    'desktop import absorbed section still available for compact fallback',
  )
  assertIncludes(
    read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx'),
    'StudioImportReveal',
    'import theater owned by MobileStory',
  )

  /* Studio history ENTER ranges unchanged */
  assertEq(STUDIO_HISTORY_RANGES.lockTravel.start, 0.06, 'studio lockTravel start frozen')
  assertEq(STUDIO_HISTORY_RANGES.lockTravel.end, 0.38, 'studio lockTravel end frozen')
  assertEq(STUDIO_HISTORY_RANGES.headline.start, 0.4, 'studio headline start frozen')
  assertEq(STUDIO_HISTORY_RANGES.cards.end, 0.76, 'studio cards end frozen')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH, 145, 'studio budget tightened')

  console.log('PASS  studio history → season import chapter')
}

async function testSeasonImportSimpleRuntime() {
  const { chromium } = await import('playwright')
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1728, height: 1080 },
    { width: 1512, height: 982 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 800 },
  ]
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'domcontentloaded',
      timeout: 8000,
    })
    await page.waitForSelector('[data-testid="lv2-mobile-story"]', { timeout: 8000 })

    const coreFn = new Function(`return (async () => {
      const track = document.querySelector('[data-testid="lv2-mobile-story"]');
      if (!track) return { error: 'no track' };
      const navH = parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) || 68;
      const cs = getComputedStyle(track);
      const mappingSvh =
        (parseFloat(cs.getPropertyValue('--mobile-track-pre-svh')) || 260) +
        (parseFloat(cs.getPropertyValue('--mobile-track-dash-svh')) || 120) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-svh')) || 300) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-brief-svh')) || 112);
      const studioSvh = parseFloat(cs.getPropertyValue('--mobile-track-studio-history-svh')) || 145;
      const importSvh = parseFloat(cs.getPropertyValue('--mobile-track-season-import-svh')) || 150;
      const founderSvh = parseFloat(cs.getPropertyValue('--mobile-track-import-cover-hold-svh') || cs.getPropertyValue('--mobile-track-founder-svh')) || 360;
      const legacyChapterSvh = studioSvh + importSvh;
      const chapterSvh = legacyChapterSvh + founderSvh;
      const totalSvh = mappingSvh + chapterSvh;
      const usable = window.innerHeight - navH;
      const mappingTravel = Math.max(1, track.offsetHeight * (mappingSvh / totalSvh) - usable);
      const travel = Math.max(1, track.offsetHeight - usable);
      const postMapping = Math.max(1, travel - mappingTravel);
      const legacyTravel = Math.max(1, postMapping * (legacyChapterSvh / chapterSvh));
      const founderTravel = Math.max(1, postMapping - legacyTravel);
      const studioTravel = Math.max(1, legacyTravel * (studioSvh / legacyChapterSvh));
      const importTravel = Math.max(1, legacyTravel - studioTravel);

      async function goImport(p) {
        const desiredTop = navH - (mappingTravel + studioTravel + p * importTravel);
        window.scrollBy(0, track.getBoundingClientRect().top - desiredTop);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise((r) => setTimeout(r, 70));
      }

      function effectiveOpacity(el) {
        if (!el) return 0;
        let o = 1;
        let n = el;
        while (n && n !== document.documentElement) {
          const s = getComputedStyle(n);
          if (s.display === 'none' || s.visibility === 'hidden') return 0;
          o *= parseFloat(s.opacity || '1');
          n = n.parentElement;
        }
        return o;
      }

      function box(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      }

      await goImport(0);
      const hist0 = {
        headline: effectiveOpacity(document.querySelector('[data-studio-headline]')),
        seasons: document.querySelectorAll('[data-season-year]').length,
        historyTop: box(document.querySelector('[data-studio-history]'))?.top ?? null,
        lockOp: effectiveOpacity(document.querySelector('[data-studio-lock]')),
        lockTop: box(document.querySelector('[data-studio-lock]'))?.top ?? null,
        importHeadline: effectiveOpacity(document.querySelector('[data-studio-import-headline]')),
        bridge: document.querySelectorAll('[data-season-2027-bridge]').length,
      };

      const path = [];
      for (const p of [0.08, 0.12, 0.16, 0.2, 0.24]) {
        await goImport(p);
        const hist = document.querySelector('[data-studio-history]');
        const lock = document.querySelector('[data-studio-lock]');
        const hb = box(hist);
        const lb = box(lock);
        path.push({
          p: p,
          histOp: effectiveOpacity(hist),
          histTop: hb ? hb.top : null,
          lockOp: effectiveOpacity(lock),
          lockTop: lb ? lb.top : null,
          importOp: effectiveOpacity(document.querySelector('[data-studio-import-headline]')),
        });
      }

      await goImport(1);
      const sheet = box(document.querySelector('[data-import-panel="sheet"]'));
      const assign = box(document.querySelector('[data-import-panel="result"]'));
      const workspace = box(document.querySelector('[data-import-workspace]'));
      const headline = document.querySelector('[data-studio-import-headline]');
      const hr = headline ? headline.getBoundingClientRect() : null;
      const pdf = document.querySelector('[data-studio-import-pdf]');
      const cta = document.querySelector('[data-import-panel="result"] button');
      const pdfBox = box(pdf);
      const ctaBox = box(cta);
      const pdfOp = effectiveOpacity(pdf);
      const ctaInView = !!(ctaBox && ctaBox.width > 40 && ctaBox.bottom <= window.innerHeight + 4 && ctaBox.top >= 0);
      const sheetInView = !!(sheet && sheet.bottom <= window.innerHeight + 6 && sheet.top >= -2);
      const assignInView = !!(assign && assign.bottom <= window.innerHeight + 6 && assign.top >= -2);
      const fitDebug = {
        vh: window.innerHeight,
        sheetTop: sheet?.top ?? null,
        sheetBottom: sheet?.bottom ?? null,
        assignTop: assign?.top ?? null,
        assignBottom: assign?.bottom ?? null,
        rootTop: box(document.querySelector('[data-studio-import]'))?.top ?? null,
      };

      await goImport(0);
      const restored = {
        headline: effectiveOpacity(document.querySelector('[data-studio-headline]')),
        importHeadline: effectiveOpacity(document.querySelector('[data-studio-import-headline]')),
        historyTop: box(document.querySelector('[data-studio-history]'))?.top ?? null,
        lockOp: effectiveOpacity(document.querySelector('[data-studio-lock]')),
        lockTop: box(document.querySelector('[data-studio-lock]'))?.top ?? null,
        seasons: document.querySelectorAll('[data-season-year]').length,
      };

      return {
        hist0: hist0,
        path: path,
        sheet: sheet,
        assign: assign,
        workspace: workspace,
        headlineCentered: hr ? Math.abs(hr.left + hr.width / 2 - window.innerWidth / 2) < 24 : false,
        sheetCount: document.querySelectorAll('[data-import-panel="sheet"]').length,
        bridgeCount: document.querySelectorAll('[data-season-2027-bridge]').length,
        pdfOp: pdfOp,
        ctaInView: ctaInView,
        sheetInView: sheetInView,
        assignInView: assignInView,
        fitDebug: fitDebug,
        noInternalScroll: !document.querySelector('[data-import-panel="sheet"] [style*="overflow"], [data-import-panel="result"] [style*="overflow"]'),
        restored: restored,
      };
    })()`)

    const core = (await page.evaluate(coreFn as () => Promise<Record<string, unknown>>)) as {
      error?: string
      hist0: {
        headline: number
        seasons: number
        historyTop: number | null
        lockOp: number
        lockTop: number | null
        importHeadline: number
        bridge: number
      }
      path: Array<{ p: number; histOp: number; histTop: number | null; lockOp: number; lockTop: number | null; importOp: number }>
      sheet: { left: number; right: number; width: number } | null
      assign: { left: number; right: number; width: number } | null
      workspace: { width: number } | null
      headlineCentered: boolean
      sheetCount: number
      bridgeCount: number
      pdfOp: number
      ctaInView: boolean
      sheetInView: boolean
      assignInView: boolean
      fitDebug: {
        vh: number
        sheetTop: number | null
        sheetBottom: number | null
        assignTop: number | null
        assignBottom: number | null
        rootTop: number | null
      }
      restored: {
        headline: number
        importHeadline: number
        historyTop: number | null
        lockOp: number
        lockTop: number | null
        seasons: number
      }
    }

    if (core.error) throw new Error(core.error)

    assert(core.hist0.headline > 0.9, 'history headline visible at import 0')
    assertEq(core.hist0.seasons, 3, 'three seasons at import 0')
    assert(core.hist0.importHeadline < 0.05, 'import headline hidden at import 0')
    assertEq(core.hist0.bridge, 0, 'no Season2027Bridge mounted')
    assertEq(core.bridgeCount, 0, 'no bridge at final')
    assertEq(core.sheetCount, 1, 'exactly one spreadsheet panel')
    assert(core.headlineCentered, 'import headline centered')
    assert(!!core.workspace && core.workspace.width >= 980, `workspace readable width ${core.workspace?.width}`)
    assert(!!core.sheet && core.sheet.width >= 420, `spreadsheet readable width ${core.sheet?.width}`)
    assert(!!core.assign && core.assign.width >= 380, `assignment readable width ${core.assign?.width}`)
    assert(core.pdfOp > 0.5, 'attachment block visible at final')
    assert(core.ctaInView, 'CTA visible in viewport at final')
    assert(
      core.sheetInView,
      `spreadsheet fully in viewport @1440 ${JSON.stringify(core.fitDebug)}`,
    )
    assert(
      core.assignInView,
      `assignment fully in viewport @1440 ${JSON.stringify(core.fitDebug)}`,
    )
    assert(
      !!core.sheet && !!core.assign && core.assign.left - core.sheet.right >= 28,
      `gap @1440 ${core.sheet && core.assign ? core.assign.left - core.sheet.right : 'n/a'}`,
    )

    assert(core.hist0.lockOp > 0.9, 'lock visible at import 0')

    let prevTop = core.path[0]?.histTop ?? 0
    let prevOp = 2
    let prevLockTop = core.path[0]?.lockTop ?? 0
    let prevLockOp = 2
    for (const s of core.path) {
      if (s.histTop != null && s.histOp > 0.05) {
        assert(s.histTop <= prevTop + 2, `history moves upward p=${s.p}`)
        prevTop = s.histTop
      }
      assert(s.histOp <= prevOp + 0.05, `history opacity decreases p=${s.p}`)
      prevOp = s.histOp
      if (s.lockTop != null && s.lockOp > 0.05) {
        assert(s.lockTop <= prevLockTop + 2, `lock moves upward with history p=${s.p}`)
        prevLockTop = s.lockTop
      }
      assert(s.lockOp <= prevLockOp + 0.05, `lock opacity decreases p=${s.p}`)
      prevLockOp = s.lockOp
      if (s.importOp > 0.25) {
        assert(s.histOp < 0.2, `no dual headlines p=${s.p}`)
      }
    }

    assert(core.restored.headline > 0.9, 'reverse restores history headline')
    assert(core.restored.importHeadline < 0.05, 'reverse clears import headline')
    assert(core.restored.lockOp > 0.9, 'reverse restores lock')
    assertEq(core.restored.seasons, 3, 'reverse restores three seasons')
    if (core.hist0.historyTop != null && core.restored.historyTop != null) {
      assert(
        Math.abs(core.hist0.historyTop - core.restored.historyTop) <= 3,
        'reverse restores history Y position',
      )
    }

    const gaps: Record<string, number> = {}
    const gapFn = new Function(`return (async () => {
      const track = document.querySelector('[data-testid="lv2-mobile-story"]');
      if (!track) return { error: 'no track' };
      const navH = parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) || 68;
      const cs = getComputedStyle(track);
      const mappingSvh =
        (parseFloat(cs.getPropertyValue('--mobile-track-pre-svh')) || 260) +
        (parseFloat(cs.getPropertyValue('--mobile-track-dash-svh')) || 120) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-svh')) || 300) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-brief-svh')) || 112);
      const studioSvh = parseFloat(cs.getPropertyValue('--mobile-track-studio-history-svh')) || 145;
      const importSvh = parseFloat(cs.getPropertyValue('--mobile-track-season-import-svh')) || 150;
      const founderSvh = parseFloat(cs.getPropertyValue('--mobile-track-import-cover-hold-svh') || cs.getPropertyValue('--mobile-track-founder-svh')) || 360;
      const legacyChapterSvh = studioSvh + importSvh;
      const chapterSvh = legacyChapterSvh + founderSvh;
      const totalSvh = mappingSvh + chapterSvh;
      const usable = window.innerHeight - navH;
      const mappingTravel = Math.max(1, track.offsetHeight * (mappingSvh / totalSvh) - usable);
      const travel = Math.max(1, track.offsetHeight - usable);
      const postMapping = Math.max(1, travel - mappingTravel);
      const legacyTravel = Math.max(1, postMapping * (legacyChapterSvh / chapterSvh));
      const founderTravel = Math.max(1, postMapping - legacyTravel);
      const studioTravel = Math.max(1, legacyTravel * (studioSvh / legacyChapterSvh));
      const importTravel = Math.max(1, legacyTravel - studioTravel);
      const desiredTop = navH - (mappingTravel + studioTravel + importTravel);
      window.scrollBy(0, track.getBoundingClientRect().top - desiredTop);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 100));
      const sticky = document.querySelector('[data-mobile-owned]');
      const importP = parseFloat((sticky && sticky.getAttribute('data-mobile-season-import')) || '0');
      if (importP < 0.95) {
        window.scrollBy(0, track.getBoundingClientRect().top - desiredTop);
        await new Promise((r) => setTimeout(r, 100));
      }
      const sheet = document.querySelector('[data-import-panel="sheet"]');
      const assign = document.querySelector('[data-import-panel="result"]');
      if (!sheet || !assign) return { error: 'no panels' };
      const sr = sheet.getBoundingClientRect();
      const ar = assign.getBoundingClientRect();
      return { gap: ar.left - sr.right, overlap: ar.left < sr.right - 1 };
    })()`)

    for (const vp of viewports) {
      await page.setViewportSize(vp)
      await page.evaluate(() => new Promise((r) => setTimeout(r, 60)))
      const gapReport = (await page.evaluate(
        gapFn as () => Promise<{ error?: string; gap: number; overlap: boolean }>,
      )) as { error?: string; gap: number; overlap: boolean }
      if (gapReport.error) throw new Error(gapReport.error)
      gaps[String(vp.width)] = gapReport.gap
      assert(gapReport.gap >= 28, `gap @${vp.width} is ${gapReport.gap}`)
      assert(!gapReport.overlap, `overlap @${vp.width}`)
    }

    console.log('PASS  season import simple runtime', {
      gaps,
      workspaceW: core.workspace?.width,
      sheetW: core.sheet?.width,
      assignW: core.assign?.width,
      gap1440: core.sheet && core.assign ? core.assign.left - core.sheet.right : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  season import simple runtime (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

async function testStudioHistoryReversePaintOwnership() {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'domcontentloaded',
      timeout: 8000,
    })
    await page.waitForSelector('[data-testid="lv2-mobile-story"]', { timeout: 8000 })

    const evaluateFn = new Function(`return (async () => {
      const track = document.querySelector('[data-testid="lv2-mobile-story"]');
      if (!track) return { error: 'no track' };
      const navH = parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) || 68;
      const cs = getComputedStyle(track);
      const mappingSvh =
        (parseFloat(cs.getPropertyValue('--mobile-track-pre-svh')) || 260) +
        (parseFloat(cs.getPropertyValue('--mobile-track-dash-svh')) || 120) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-svh')) || 300) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-brief-svh')) || 112);
      const studioSvh = parseFloat(cs.getPropertyValue('--mobile-track-studio-history-svh')) || 145;
      const importSvh = parseFloat(cs.getPropertyValue('--mobile-track-season-import-svh')) || 150;
      const founderSvh = parseFloat(cs.getPropertyValue('--mobile-track-import-cover-hold-svh') || cs.getPropertyValue('--mobile-track-founder-svh')) || 360;
      const legacyChapterSvh = studioSvh + importSvh;
      const chapterSvh = legacyChapterSvh + founderSvh;
      const totalSvh = mappingSvh + chapterSvh;
      const usable = window.innerHeight - navH;
      const mappingTravel = Math.max(1, track.offsetHeight * (mappingSvh / totalSvh) - usable);
      const travel = Math.max(1, track.offsetHeight - usable);
      const postMapping = Math.max(1, travel - mappingTravel);
      const legacyTravel = Math.max(1, postMapping * (legacyChapterSvh / chapterSvh));
      const studioTravel = Math.max(1, legacyTravel * (studioSvh / legacyChapterSvh));

      async function goStudio(p) {
        const desiredTop = navH - (mappingTravel + p * studioTravel);
        window.scrollBy(0, track.getBoundingClientRect().top - desiredTop);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise((r) => setTimeout(r, 60));
      }

      function effectiveOpacity(el) {
        if (!el) return 0;
        let o = 1;
        let n = el;
        while (n && n !== document.documentElement) {
          const s = getComputedStyle(n);
          if (s.display === 'none' || s.visibility === 'hidden') return 0;
          o *= parseFloat(s.opacity || '1');
          n = n.parentElement;
        }
        return o;
      }

      function headlineHits() {
        return Array.from(document.querySelectorAll('h2, p, span')).filter((el) =>
          (el.textContent || '').includes('Cała historia Twojego studia'),
        );
      }

      await goStudio(0.9);
      const seasonCols = Array.from(document.querySelectorAll('[data-season-year]'));
      const cardHeights = seasonCols.map((col) => {
        const card = col.querySelector('[data-studio-card]');
        return card ? Math.round(card.getBoundingClientRect().height) : 0;
      });
      const rowCounts = seasonCols.map((col) => col.querySelectorAll('ul li').length);
      const icons = document.querySelectorAll('[data-studio-history] ul li svg').length;
      const atFinal = {
        owners: document.querySelectorAll('[data-studio-history-owner="mobile"]').length,
        absorbed: !!document.querySelector('[data-security-theater="absorbed"]'),
        staticHistory: !!document.querySelector('[data-security-theater="static"]'),
        headlineNodes: headlineHits().length,
        headlineEffective: effectiveOpacity(document.querySelector('[data-studio-headline]')),
        rowCounts: rowCounts,
        cardHeights: cardHeights,
        clientIcons: icons,
      };

      const reverseSamples = [];
      for (const p of [0.5, 0.42, 0.38, 0.36, 0.34, 0.32, 0.28]) {
        await goStudio(p);
        const sticky = document.querySelector('[data-mobile-owned]');
        const headline = document.querySelector('[data-studio-headline]');
        const eyebrow = document.querySelector('[data-studio-eyebrow]');
        const support = document.querySelector('[data-studio-support]');
        const phone = sticky && sticky.querySelector('[data-studio-lock]');
        const tf = phone ? getComputedStyle(phone).transform : '';
        const scaleMatch = /matrix\\(([^,]+)/.exec(tf);
        const absScale = scaleMatch ? Math.abs(parseFloat(scaleMatch[1])) : 0;
        const intro = document.querySelector('[data-studio-history-intro]');
        reverseSamples.push({
          p: p,
          studio: sticky && sticky.getAttribute('data-mobile-studio-history'),
          headlineEffective: effectiveOpacity(headline),
          eyebrowEffective: effectiveOpacity(eyebrow),
          supportEffective: effectiveOpacity(support),
          headlineVisibility: headline ? getComputedStyle(headline).visibility : null,
          introVisibility: intro ? getComputedStyle(intro).visibility : null,
          absScale: absScale,
          headlineNodeCount: headlineHits().filter((el) => el.tagName === 'H2').length,
        });
      }

      return { atFinal: atFinal, reverseSamples: reverseSamples };
    })()`)

    const report = (await page.evaluate(evaluateFn as () => Promise<{
      error?: string
      atFinal: {
        owners: number
        absorbed: boolean
        staticHistory: boolean
        headlineNodes: number
        headlineEffective: number
        rowCounts: number[]
        cardHeights: number[]
        clientIcons: number
      }
      reverseSamples: Array<{
        p: number
        studio: string | null
        headlineEffective: number
        eyebrowEffective: number
        supportEffective: number
        headlineVisibility: string | null
        introVisibility: string | null
        absScale: number
        headlineNodeCount: number
      }>
    }>)) as {
      error?: string
      atFinal: {
        owners: number
        absorbed: boolean
        staticHistory: boolean
        headlineNodes: number
        headlineEffective: number
        rowCounts: number[]
        cardHeights: number[]
        clientIcons: number
      }
      reverseSamples: Array<{
        p: number
        studio: string | null
        headlineEffective: number
        eyebrowEffective: number
        supportEffective: number
        headlineVisibility: string | null
        introVisibility: string | null
        absScale: number
        headlineNodeCount: number
      }>
    }

    if ('error' in report) throw new Error(report.error)
    assertEq(report.atFinal.owners, 1, 'exactly one mobile studio history owner at final')
    assert(report.atFinal.absorbed, 'security history absorbed on desktop')
    assert(!report.atFinal.staticHistory, 'no static history theater on desktop')
    assert(report.atFinal.headlineEffective > 0.9, 'final history headline visible')
    assertEq(report.atFinal.rowCounts.length, 3, 'three season columns at final')
    for (const n of report.atFinal.rowCounts) {
      assertEq(n, 6, 'each season shows 6 client rows at final')
    }
    assertEq(report.atFinal.clientIcons, 18, 'each of 18 client rows has an icon')
    const [h0, h1, h2] = report.atFinal.cardHeights
    assert(typeof h0 === 'number' && typeof h1 === 'number' && typeof h2 === 'number', 'card heights measured')
    assert(Math.abs(h0! - h1!) <= 2 && Math.abs(h1! - h2!) <= 2, `season cards equal height (${h0}/${h1}/${h2})`)

    for (const s of report.reverseSamples) {
      assertEq(s.headlineNodeCount, 1, `single h2 owner at reverse p=${s.p}`)
      if ((s.absScale ?? 0) > 0.1) {
        assert(
          s.headlineEffective <= 0.02,
          `reverse paint: headline gone when lock grown (p=${s.p}, scale=${s.absScale}, op=${s.headlineEffective})`,
        )
        assert(
          s.eyebrowEffective <= 0.02,
          `reverse paint: eyebrow gone when lock grown (p=${s.p})`,
        )
        assert(
          s.supportEffective <= 0.02,
          `reverse paint: support gone when lock grown (p=${s.p})`,
        )
        assert(
          s.headlineVisibility === 'hidden' || s.introVisibility === 'hidden',
          `reverse paint: visibility hard-kill active (p=${s.p})`,
        )
      }
    }

    console.log('PASS  studio history reverse paint ownership (runtime)')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  studio history reverse paint ownership (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

async function testStudioHistoryDesktopSpacing() {
  const { chromium } = await import('playwright')
  const viewports = [
    { width: 2560, height: 1440 },
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
  ]
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    const measureFn = new Function(`return (async () => {
      const track = document.querySelector('[data-testid="lv2-mobile-story"]');
      if (!track) return { error: 'no track' };
      const navH = parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) || 68;
      const cs = getComputedStyle(track);
      const mappingSvh =
        (parseFloat(cs.getPropertyValue('--mobile-track-pre-svh')) || 260) +
        (parseFloat(cs.getPropertyValue('--mobile-track-dash-svh')) || 120) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-svh')) || 300) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-brief-svh')) || 112);
      const studioSvh = parseFloat(cs.getPropertyValue('--mobile-track-studio-history-svh')) || 145;
      const importSvh = parseFloat(cs.getPropertyValue('--mobile-track-season-import-svh')) || 150;
      const founderSvh = parseFloat(cs.getPropertyValue('--mobile-track-import-cover-hold-svh') || cs.getPropertyValue('--mobile-track-founder-svh')) || 360;
      const legacyChapterSvh = studioSvh + importSvh;
      const chapterSvh = legacyChapterSvh + founderSvh;
      const totalSvh = mappingSvh + chapterSvh;
      const usable = window.innerHeight - navH;
      const mappingTravel = Math.max(1, track.offsetHeight * (mappingSvh / totalSvh) - usable);
      const travel = Math.max(1, track.offsetHeight - usable);
      const postMapping = Math.max(1, travel - mappingTravel);
      const legacyTravel = Math.max(1, postMapping * (legacyChapterSvh / chapterSvh));
      const studioTravel = Math.max(1, legacyTravel * (studioSvh / legacyChapterSvh));
      const desiredTop = navH - (mappingTravel + studioTravel);
      window.scrollBy(0, track.getBoundingClientRect().top - desiredTop);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 100));

      function box(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, cx: r.left + r.width / 2 };
      }

      const lock = box(document.querySelector('[data-studio-lock]'));
      const eyebrow = box(document.querySelector('[data-studio-eyebrow]'));
      const headline = box(document.querySelector('[data-studio-headline]'));
      const years = Array.from(document.querySelectorAll('[data-season-year]')).map((el) => {
        const yearEl = el.querySelector('p');
        const card = el.querySelector('[data-studio-card]');
        return {
          year: el.getAttribute('data-season-year'),
          yearBox: box(yearEl),
          cardBox: box(card),
        };
      });
      const dots = Array.from(document.querySelectorAll('[data-studio-year-dot]')).map((el) => ({
        year: el.getAttribute('data-studio-year-dot'),
        box: box(el),
      }));
      const line = document.querySelector('[data-studio-timeline] > span');
      const lineBox = box(line);

      return {
        lockToEyebrow: lock && eyebrow ? eyebrow.top - lock.bottom : null,
        lockOverlapsEyebrow: !!(lock && eyebrow && !(lock.bottom <= eyebrow.top - 0.5 || lock.top >= eyebrow.bottom)),
        lockOverlapsHeadline: !!(lock && headline && !(lock.bottom <= headline.top - 0.5 || lock.top >= headline.bottom)),
        lockH: lock ? lock.height : null,
        lineH: lineBox ? lineBox.height : null,
        dots: dots.map((d) => {
          const y = years.find((x) => x.year === d.year);
          return {
            year: d.year,
            gap: y && y.yearBox && d.box ? y.yearBox.top - d.box.bottom : null,
            dx: y && y.yearBox && d.box ? Math.abs(y.yearBox.cx - d.box.cx) : null,
          };
        }),
        yearCardGaps: years.map((y) => ({
          year: y.year,
          gap: y.yearBox && y.cardBox ? y.cardBox.top - y.yearBox.bottom : null,
        })),
        cards: years.map((y) => ({
          year: y.year,
          w: y.cardBox ? y.cardBox.width : null,
          h: y.cardBox ? y.cardBox.height : null,
        })),
      };
    })()`)

    const baselines: Record<string, { cardW: number; cardH: number; yearCardGap: number }> = {}

    for (const vp of viewports) {
      await page.setViewportSize(vp)
      await page.goto('http://localhost:5173/#jak-dziala', {
        waitUntil: 'domcontentloaded',
        timeout: 8000,
      })
      await page.waitForSelector('[data-testid="lv2-mobile-story"]', { timeout: 8000 })
      const report = (await page.evaluate(measureFn as () => Promise<{
        error?: string
        lockToEyebrow: number | null
        lockOverlapsEyebrow: boolean
        lockOverlapsHeadline: boolean
        lockH: number | null
        lineH: number | null
        dots: Array<{ year: string | null; gap: number | null; dx: number | null }>
        yearCardGaps: Array<{ year: string | null; gap: number | null }>
        cards: Array<{ year: string | null; w: number | null; h: number | null }>
      }>)) as {
        error?: string
        lockToEyebrow: number | null
        lockOverlapsEyebrow: boolean
        lockOverlapsHeadline: boolean
        lockH: number | null
        lineH: number | null
        dots: Array<{ year: string | null; gap: number | null; dx: number | null }>
        yearCardGaps: Array<{ year: string | null; gap: number | null }>
        cards: Array<{ year: string | null; w: number | null; h: number | null }>
      }
      if (report.error) throw new Error(report.error)

      assert(!report.lockOverlapsEyebrow, `lock must not overlap eyebrow @${vp.width}x${vp.height}`)
      assert(!report.lockOverlapsHeadline, `lock must not overlap headline @${vp.width}x${vp.height}`)
      assert(
        report.lockToEyebrow != null && report.lockToEyebrow >= 16,
        `lock→eyebrow gap >= 16px @${vp.width}x${vp.height} (got ${report.lockToEyebrow})`,
      )
      assert(report.lineH != null && Math.abs(report.lineH - 1) < 0.5, 'timeline line remains 1px')
      assertEq(report.dots.length, 3, 'three timeline dots')

      for (const d of report.dots) {
        assert(d.gap != null && d.gap <= 20, `dot→year gap <= 20px (${d.year}=${d.gap}) @${vp.width}`)
        assert(d.gap != null && d.gap >= 8, `dot→year gap remains readable (${d.year}=${d.gap})`)
        assert(d.dx != null && d.dx <= 2, `dot horizontally aligned with year (${d.year} dx=${d.dx})`)
      }

      for (const y of report.yearCardGaps) {
        assert(y.gap != null && y.gap >= 8 && y.gap <= 16, `year→card spacing stable (${y.year}=${y.gap})`)
      }

      const key = `${vp.width}x${vp.height}`
      if (!baselines[key] && report.cards[0]?.w != null && report.cards[0]?.h != null) {
        baselines[key] = {
          cardW: report.cards[0].w,
          cardH: report.cards[0].h,
          yearCardGap: report.yearCardGaps[0]?.gap ?? 11,
        }
      }
      for (const c of report.cards) {
        assert(c.w != null && c.h != null, `card geometry present ${c.year}`)
        assert(
          Math.abs((c.w ?? 0) - baselines[key].cardW) <= 4,
          `card width unchanged within tolerance @${key}`,
        )
        assert(
          Math.abs((c.h ?? 0) - baselines[key].cardH) <= 4,
          `card height unchanged within tolerance @${key}`,
        )
      }
    }

    console.log('PASS  studio history desktop spacing (runtime)', {
      '2560': 'checked',
      '1920': 'checked',
      '1440': 'checked',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  studio history desktop spacing (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

async function testChapterHeroVerticalAlignment() {
  const { chromium } = await import('playwright')
  const viewports = [
    { width: 2560, height: 1440, maxDelta: 8 },
    { width: 1920, height: 1080, maxDelta: 8 },
    { width: 1440, height: 900, maxDelta: 8 },
    { width: 1280, height: 800, maxDelta: 12 },
  ]
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    const measureFn = new Function(
      'chapter',
      `return (async () => {
      const track = document.querySelector('[data-testid="lv2-mobile-story"]');
      if (!track) return { error: 'no track' };
      const navH = parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) || 68;
      const cs = getComputedStyle(track);
      const mappingSvh =
        (parseFloat(cs.getPropertyValue('--mobile-track-pre-svh')) || 260) +
        (parseFloat(cs.getPropertyValue('--mobile-track-dash-svh')) || 120) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-svh')) || 300) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-brief-svh')) || 112);
      const studioSvh = parseFloat(cs.getPropertyValue('--mobile-track-studio-history-svh')) || 145;
      const importSvh = parseFloat(cs.getPropertyValue('--mobile-track-season-import-svh')) || 150;
      const founderSvh = parseFloat(cs.getPropertyValue('--mobile-track-import-cover-hold-svh') || cs.getPropertyValue('--mobile-track-founder-svh')) || 360;
      const legacyChapterSvh = studioSvh + importSvh;
      const chapterSvh = legacyChapterSvh + founderSvh;
      const totalSvh = mappingSvh + chapterSvh;
      const usable = window.innerHeight - navH;
      const mappingTravel = Math.max(1, track.offsetHeight * (mappingSvh / totalSvh) - usable);
      const travel = Math.max(1, track.offsetHeight - usable);
      const postMapping = Math.max(1, travel - mappingTravel);
      const legacyTravel = Math.max(1, postMapping * (legacyChapterSvh / chapterSvh));
      const founderTravel = Math.max(1, postMapping - legacyTravel);
      const studioTravel = Math.max(1, legacyTravel * (studioSvh / legacyChapterSvh));
      const importTravel = Math.max(1, legacyTravel - studioTravel);
      const desiredTop =
        chapter === 'import'
          ? navH - (mappingTravel + studioTravel + importTravel)
          : navH - (mappingTravel + studioTravel);
      window.scrollBy(0, track.getBoundingClientRect().top - desiredTop);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 100));

      function union(els) {
        let top = Infinity;
        let bottom = -Infinity;
        let any = false;
        for (const el of els) {
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          any = true;
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
        }
        if (!any) return null;
        return { top: top, bottom: bottom, centerY: (top + bottom) / 2 };
      }

      if (chapter === 'history') {
        const lock = document.querySelector('[data-studio-lock]');
        const eyebrow = document.querySelector('[data-studio-eyebrow]');
        const hero = union([
          lock,
          eyebrow,
          document.querySelector('[data-studio-headline]'),
          document.querySelector('[data-studio-support]'),
        ]);
        const lockBox = lock ? lock.getBoundingClientRect() : null;
        const eyeBox = eyebrow ? eyebrow.getBoundingClientRect() : null;
        const timeline = document.querySelector('[data-studio-timeline]');
        const card = document.querySelector('[data-studio-card]');
        return {
          hero: hero,
          lockToEyebrow: lockBox && eyeBox ? eyeBox.top - lockBox.bottom : null,
          timelineTop: timeline ? timeline.getBoundingClientRect().top : null,
          cardTop: card ? card.getBoundingClientRect().top : null,
          cardH: card ? card.getBoundingClientRect().height : null,
          hasHistoryHeroMarker: !!document.querySelector('[data-lv2-history-hero]'),
        };
      }

      const hero = union([
        document.querySelector('[data-studio-import-icon]'),
        document.querySelector('[data-studio-import-eyebrow]'),
        document.querySelector('[data-studio-import-headline]'),
        document.querySelector('[data-studio-import-support]'),
      ]);
      const process = document.querySelector('[data-studio-import-process]');
      const panels = document.querySelector('[data-import-workspace]');
      const processBox = process ? process.getBoundingClientRect() : null;
      const panelsBox = panels ? panels.getBoundingClientRect() : null;
      return {
        hero: hero,
        panelsInView: !!(
          panelsBox &&
          panelsBox.bottom <= window.innerHeight + 6 &&
          panelsBox.top >= 0
        ),
        processToPanels: processBox && panelsBox ? panelsBox.top - processBox.bottom : null,
        hasImportHeroMarker: !!document.querySelector('[data-lv2-import-hero]'),
        hasHistoryHeroMarker: !!document.querySelector('[data-lv2-history-hero]'),
      };
    })()`,
    )

    let historyBaseline: { timelineTop: number; cardTop: number; cardH: number } | null = null

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('http://localhost:5173/#jak-dziala', {
        waitUntil: 'domcontentloaded',
        timeout: 8000,
      })
      await page.waitForSelector('[data-testid="lv2-mobile-story"]', { timeout: 8000 })

      const hist = (await page.evaluate(
        measureFn as (chapter: string) => Promise<{
          error?: string
          hero: { centerY: number } | null
          lockToEyebrow: number | null
          timelineTop: number | null
          cardTop: number | null
          cardH: number | null
          hasHistoryHeroMarker?: boolean
        }>,
        'history',
      )) as {
        error?: string
        hero: { centerY: number } | null
        lockToEyebrow: number | null
        timelineTop: number | null
        cardTop: number | null
        cardH: number | null
        hasHistoryHeroMarker?: boolean
      }
      if (hist.error) throw new Error(hist.error)

      const imp = (await page.evaluate(
        measureFn as (chapter: string) => Promise<{
          error?: string
          hero: { centerY: number } | null
          panelsInView: boolean
          processToPanels: number | null
          hasImportHeroMarker: boolean
          hasHistoryHeroMarker: boolean
        }>,
        'import',
      )) as {
        error?: string
        hero: { centerY: number } | null
        panelsInView: boolean
        processToPanels: number | null
        hasImportHeroMarker: boolean
        hasHistoryHeroMarker: boolean
      }
      if (imp.error) throw new Error(imp.error)

      assert(!!hist.hero && !!imp.hero, `hero groups present @${vp.width}x${vp.height}`)
      const delta = Math.abs((imp.hero?.centerY ?? 0) - (hist.hero?.centerY ?? 0))
      assert(
        delta <= vp.maxDelta,
        `hero center delta <= ${vp.maxDelta}px @${vp.width}x${vp.height} (got ${delta.toFixed(2)})`,
      )
      assert(
        hist.lockToEyebrow != null && hist.lockToEyebrow >= 16,
        `lock→eyebrow still >= 16 @${vp.width} (got ${hist.lockToEyebrow})`,
      )
      assert(imp.panelsInView, `import panels in viewport @${vp.width}x${vp.height}`)
      assert(imp.hasImportHeroMarker, 'import hero test wrapper present')
      assert(!!hist.hasHistoryHeroMarker, 'history hero test wrapper present')

      if (vp.width === 1440 && hist.timelineTop != null && hist.cardTop != null && hist.cardH != null) {
        historyBaseline = {
          timelineTop: hist.timelineTop,
          cardTop: hist.cardTop,
          cardH: hist.cardH,
        }
      }
      if (vp.width === 1440 && historyBaseline) {
        assert(
          Math.abs((hist.timelineTop ?? 0) - historyBaseline.timelineTop) <= 2,
          'history timeline Y unchanged within tolerance',
        )
        assert(
          Math.abs((hist.cardTop ?? 0) - historyBaseline.cardTop) <= 2,
          'history card Y unchanged within tolerance',
        )
        assert(
          Math.abs((hist.cardH ?? 0) - historyBaseline.cardH) <= 2,
          'history card height unchanged within tolerance',
        )
      }
    }

    console.log('PASS  chapter hero vertical alignment (runtime)')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  chapter hero vertical alignment (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

{
  /* Founder chapter — single normal-flow owner over Import sticky hold. */
  assertEq(MOBILE_TRACK_IMPORT_COVER_HOLD_SVH, 100, 'cover hold is one viewport')
  assertEq(MOBILE_TRACK_FOUNDER_SVH, MOBILE_TRACK_IMPORT_COVER_HOLD_SVH, 'legacy alias = cover hold')
  assertEq(MOBILE_TRACK_FOUNDER_STORY_SVH, 0, 'no synthetic Founder story budget')

  const founderFlow = read('src/features/landing-v2/mobile-story/LandingV2FounderStory.tsx')
  const founderContent = read('src/features/landing-v2/mobile-story/FounderStoryContent.tsx')
  const founderCss = read('src/features/landing-v2/mobile-story/FounderStoryReveal.module.css')
  const founderProgressSrc = read('src/features/landing-v2/mobile-story/founderStoryProgress.ts')
  const mobileSrc = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const importReveal = read('src/features/landing-v2/mobile-story/StudioImportReveal.tsx')
  const pageSrc = read('src/features/landing-v2/LandingV2Page.tsx')
  const founderClaims = read('src/features/landing-v2/mobile-story/founderStoryClaims.ts')

  assert(exists('src/features/landing-v2/mobile-story/FounderStoryReveal.tsx') === false, 'FounderStoryReveal removed')
  assert(exists('src/features/landing-v2/mobile-story/founderStoryClock.ts') === false, 'founderStoryClock removed')
  assertNotIncludes(mobileSrc, 'FounderStoryReveal', 'MobileStory does not mount Founder cover')
  assertNotIncludes(mobileSrc, 'founderProgress', 'no founderProgress MV')
  assertNotIncludes(mobileSrc, 'founderCoverPaintAt', 'no cover paint ownership')
  assertNotIncludes(mobileSrc, 'publishFounderCoverProgress', 'no founder cover clock')
  assertNotIncludes(founderFlow, 'founderFlowPaintAt', 'no flow paint gate')
  assertNotIncludes(founderFlow, 'founderCoverProgressMv', 'no cover clock subscription')
  assertNotIncludes(founderFlow, 'motion.section', 'Founder is plain section')
  assertNotIncludes(founderProgressSrc, 'founderCoverPaintAt', 'dual-owner paint helpers removed')
  assertNotIncludes(founderProgressSrc, 'FOUNDER_FLOW_HANDOFF', 'handoff threshold removed')
  assertIncludes(founderProgressSrc, 'MOBILE_TRACK_IMPORT_COVER_HOLD_SVH', 'cover-hold constant')
  assertIncludes(founderFlow, 'FounderStoryContent', 'single Founder renders content')
  assertIncludes(founderFlow, 'FounderQualification', 'qualification continues same Founder surface')
  assertIncludes(founderFlow, 'data-founder-story-owner="single"', 'single owner marker')
  assertIncludes(founderCss, '.story', 'single story surface')
  assertIncludes(founderCss, 'background: var(--founder-bg)', 'opaque black on Founder section')
  assertIncludes(founderCss, 'transform: none', 'no Founder transform layer')
  assertIncludes(founderCss, 'will-change: auto', 'no Founder will-change promotion')
  assertIncludes(founderCss, 'margin-top: calc(-100', 'structural overlap of Import cover-hold')
  assertIncludes(founderCss, 'z-index: 6', 'stable Founder stacking above Import sticky')
  assertNotIncludes(founderCss, '.plane', 'no cover plane surface')
  assertIncludes(pageSrc, 'LandingV2FounderStory', 'Founder mounted on page')
  assertIncludes(pageSrc, 'LandingV2Pricing', 'conversion pricing on page')
  assertNotIncludes(pageSrc, 'AssignmentOverviewSection', 'no post-founder feature stack')
  assertNotIncludes(importReveal, 'founderProgress', 'Import not coupled to founder motion')
  assertIncludes(founderContent, 'marcin-hibszer-portrait.jpg', 'uses supplied founder portrait asset')
  assertIncludes(founderContent, 'LV2_FOUNDER_OPENING', 'opening copy bound')
  assertIncludes(founderContent, 'LV2_FOUNDER_IDENTITY', 'identity copy bound')
  assertIncludes(founderContent, 'LV2_FOUNDER_ORIGIN', 'origin copy bound')
  assertIncludes(founderContent, 'LV2_FOUNDER_CLOSING', 'closing copy bound')
  assertIncludes(founderClaims, LV2_FOUNDER_OPENING.eyebrow, 'opening eyebrow in claims')
  assertIncludes(founderClaims, LV2_FOUNDER_OPENING.bridge, 'bridge line in claims')
  assertIncludes(founderClaims, LV2_FOUNDER_OPENING.headlineLine1, 'opening headline in claims')
  assertIncludes(founderClaims, LV2_FOUNDER_IDENTITY.name, 'founder name in claims')
  assertIncludes(founderClaims, LV2_FOUNDER_IDENTITY.meta, 'credentials under portrait only')
  assertIncludes(founderClaims, LV2_FOUNDER_ORIGIN.heading, 'story heading in claims')
  assertIncludes(founderClaims, LV2_FOUNDER_ORIGIN.currentUseHeading, 'current-use heading in claims')
  assertIncludes(founderClaims, LV2_FOUNDER_CLOSING.headlineLine2, 'udostępniam closing headline')
  assertIncludes(founderClaims, LV2_FOUNDER_CLOSING.support, 'closing support in claims')
  assertNotIncludes(founderClaims, 'LV2_FOUNDER_PROOF', 'proof export removed')
  assert(exists('src/features/landing-v2/media/marcin-hibszer-portrait.jpg'), 'portrait asset on disk')

  console.log('PASS  founder story chapter (static)')
}

async function testFounderSingleOwnerCover() {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto('http://localhost:5173/#jak-dziala', {
      waitUntil: 'domcontentloaded',
      timeout: 8000,
    })
    await page.waitForSelector('[data-testid="lv2-founder-story"]', { timeout: 8000 })

    const reportFn = new Function(`return (async () => {
      const track = document.querySelector('[data-testid="lv2-mobile-story"]');
      const founder = document.querySelector('[data-testid="lv2-founder-story"]');
      if (!track || !founder) return { error: 'missing nodes' };
      const navH = parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) || 68;
      const cs = getComputedStyle(track);
      const mappingSvh =
        (parseFloat(cs.getPropertyValue('--mobile-track-pre-svh')) || 260) +
        (parseFloat(cs.getPropertyValue('--mobile-track-dash-svh')) || 120) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-svh')) || 300) +
        (parseFloat(cs.getPropertyValue('--mobile-track-post-brief-svh')) || 112);
      const studioSvh = parseFloat(cs.getPropertyValue('--mobile-track-studio-history-svh')) || 145;
      const importSvh = parseFloat(cs.getPropertyValue('--mobile-track-season-import-svh')) || 150;
      const holdSvh = parseFloat(cs.getPropertyValue('--mobile-track-import-cover-hold-svh') || cs.getPropertyValue('--mobile-track-founder-svh')) || 100;
      const legacy = studioSvh + importSvh;
      const chapter = legacy + holdSvh;
      const total = mappingSvh + chapter;
      const usable = window.innerHeight - navH;
      const mappingTravel = Math.max(1, track.offsetHeight * (mappingSvh / total) - usable);
      const travel = Math.max(1, track.offsetHeight - usable);
      const post = Math.max(1, travel - mappingTravel);
      const legacyTravel = Math.max(1, post * (legacy / chapter));
      const holdTravel = Math.max(1, post - legacyTravel);
      const studioTravel = Math.max(1, legacyTravel * (studioSvh / legacy));
      const importTravel = Math.max(1, legacyTravel - studioTravel);

      async function goImportFinalPlus(holdPx) {
        const desiredTop = navH - (mappingTravel + studioTravel + importTravel + holdPx);
        window.scrollBy(0, track.getBoundingClientRect().top - desiredTop);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise((r) => setTimeout(r, 24));
      }

      function box(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, height: r.height, width: r.width };
      }

      const contentCount = document.querySelectorAll('[data-founder-opening-heading]').length;
      const ownerCount = document.querySelectorAll('[data-founder-story-owner]').length;
      const fCs = getComputedStyle(founder);
      const structure = {
        contentCount: contentCount,
        ownerCount: ownerCount,
        position: fCs.position,
        transform: fCs.transform,
        willChange: fCs.willChange,
        zIndex: fCs.zIndex,
        visibility: fCs.visibility,
        contentVisibility: fCs.contentVisibility || '',
        bg: fCs.backgroundColor,
      };

      await goImportFinalPlus(40);
      const sheet0 = box(document.querySelector('[data-import-panel="sheet"]'));
      const founder0 = box(founder);
      const z0 = getComputedStyle(founder).zIndex;
      const vis0 = getComputedStyle(founder).visibility;
      const tf0 = getComputedStyle(founder).transform;

      await goImportFinalPlus(40 + 300);
      const sheet1 = box(document.querySelector('[data-import-panel="sheet"]'));
      const founder1 = box(founder);
      const z1 = getComputedStyle(founder).zIndex;
      const vis1 = getComputedStyle(founder).visibility;
      const tf1 = getComputedStyle(founder).transform;

      const cover = {
        importDelta: sheet0 && sheet1 ? Math.abs(sheet1.top - sheet0.top) : 999,
        founderDelta: founder0 && founder1 ? founder0.top - founder1.top : 0,
        ratio: founder0 && founder1 ? Math.abs(founder0.top - founder1.top) / 300 : 0,
        zChanged: z0 !== z1,
        visChanged: vis0 !== vis1,
        tfChanged: tf0 !== tf1,
      };

      // Settled cover (~full hold) then +300 page scroll — normal flow reading
      await goImportFinalPlus(holdTravel);
      const settledTop = box(founder)?.top;
      const portrait = founder.querySelector('[data-founder-portrait]');
      const p0 = box(portrait);
      const s0 = box(founder);
      window.scrollBy(0, 300);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 24));
      const p1 = box(portrait);
      const s1 = box(founder);
      const reading = {
        founderMoved: s0 && s1 ? s0.top - s1.top : 0,
        childMoved: p0 && p1 ? p0.top - p1.top : 0,
        relativeDelta:
          s0 && s1 && p0 && p1 ? Math.abs((p1.top - s1.top) - (p0.top - s0.top)) : 999,
        zChanged: getComputedStyle(founder).zIndex !== z0,
        visChanged: getComputedStyle(founder).visibility !== vis0,
        tfChanged: getComputedStyle(founder).transform !== tf0,
      };

      // Reverse 300 during cover
      await goImportFinalPlus(40 + 300);
      const r0 = box(founder);
      const i0 = box(document.querySelector('[data-import-panel="sheet"]'));
      await goImportFinalPlus(40);
      const r1 = box(founder);
      const i1 = box(document.querySelector('[data-import-panel="sheet"]'));
      const reverse = {
        founderDelta: r0 && r1 ? r1.top - r0.top : 0,
        importDelta: i0 && i1 ? Math.abs(i1.top - i0.top) : 999,
      };

      // Oscillation across old handoff-ish band: no architectural flips
      let flips = 0;
      let prev = null;
      for (let k = 0; k < 30; k++) {
        await goImportFinalPlus(holdTravel - 80 + (k % 2 === 0 ? 0 : 160));
        const snap = {
          z: getComputedStyle(founder).zIndex,
          vis: getComputedStyle(founder).visibility,
          tf: getComputedStyle(founder).transform,
          cv: getComputedStyle(founder).contentVisibility || '',
          pos: getComputedStyle(founder).position,
          owners: document.querySelectorAll('[data-founder-story-owner]').length,
        };
        if (prev) {
          if (snap.z !== prev.z || snap.vis !== prev.vis || snap.tf !== prev.tf || snap.cv !== prev.cv || snap.pos !== prev.pos || snap.owners !== prev.owners) flips++;
        }
        prev = snap;
      }

      return {
        holdSvh: holdSvh,
        structure: structure,
        cover: cover,
        reading: reading,
        reverse: reverse,
        flips: flips,
        settledTop: settledTop,
      };
    })()`)

    const report = (await page.evaluate(reportFn as () => Promise<Record<string, unknown>>)) as {
      error?: string
      holdSvh: number
      structure: {
        contentCount: number
        ownerCount: number
        position: string
        transform: string
        willChange: string
        zIndex: string
        visibility: string
        contentVisibility: string
        bg: string
      }
      cover: {
        importDelta: number
        founderDelta: number
        ratio: number
        zChanged: boolean
        visChanged: boolean
        tfChanged: boolean
      }
      reading: {
        founderMoved: number
        childMoved: number
        relativeDelta: number
        zChanged: boolean
        visChanged: boolean
        tfChanged: boolean
      }
      reverse: { founderDelta: number; importDelta: number }
      flips: number
    }
    if (report.error) throw new Error(report.error)

    assertEq(report.structure.contentCount, 1, 'desktop FounderStoryContent instance count = 1')
    assertEq(report.structure.ownerCount, 1, 'desktop Founder owner count = 1')
    assert(report.structure.position === 'relative' || report.structure.position === 'static', 'Founder not sticky/fixed')
    assert(report.structure.position !== 'sticky' && report.structure.position !== 'fixed', 'Founder normal-flow position')
    assertEq(report.structure.transform, 'none', 'Founder transform none')
    assert(
      report.structure.willChange === 'auto' || report.structure.willChange === 'none' || report.structure.willChange === '',
      'Founder will-change auto/none',
    )
    assert(
      report.structure.bg.includes('5, 5, 5') || report.structure.bg.includes('0, 0, 0'),
      'Founder opaque black background',
    )
    assert(report.cover.importDelta <= 1, 'Import stationary during Founder cover (<=1px)')
    assert(Math.abs(report.cover.founderDelta - 300) <= 2, 'Founder top moves ~300px over 300px scroll')
    assert(report.cover.ratio >= 0.98 && report.cover.ratio <= 1.02, 'Founder/page scroll ratio ~1')
    assert(!report.cover.zChanged, 'no Founder z-index change during cover')
    assert(!report.cover.visChanged, 'no Founder visibility change during cover')
    assert(!report.cover.tfChanged, 'no Founder transform change during cover')
    assert(Math.abs(report.reading.founderMoved - 300) <= 2, 'post-cover Founder moves with page scroll')
    assert(Math.abs(report.reading.childMoved - 300) <= 2, 'post-cover Founder child moves with section')
    assert(report.reading.relativeDelta <= 1, 'no relative geometry jump post-cover')
    assert(!report.reading.zChanged, 'no z-index event at old handoff band')
    assert(!report.reading.visChanged, 'no visibility event at old handoff band')
    assert(!report.reading.tfChanged, 'no transform event at old handoff band')
    assert(Math.abs(report.reverse.founderDelta - 300) <= 2, 'reverse Founder top +300px')
    assert(report.reverse.importDelta <= 1, 'Import stationary on reverse uncover')
    assertEq(report.flips, 0, 'no architectural flips across 30× oscillation')
    assertEq(report.holdSvh, MOBILE_TRACK_IMPORT_COVER_HOLD_SVH, 'runtime cover-hold matches constant')

    console.log('PASS  founder single-owner cover (runtime)')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ECONNREFUSED') || message.includes('timeout')) {
      console.log('SKIP  founder single-owner cover (dev server unavailable)')
      return
    }
    throw error
  } finally {
    await browser.close()
  }
}

await testStudioHistoryReversePaintOwnership()
await testStudioHistoryDesktopSpacing()
await testChapterHeroVerticalAlignment()
await testSeasonImportSimpleRuntime()
await testFounderSingleOwnerCover()

{
  /* Final conversion — static qualification + single-Pro pricing. */
  const qual = read('src/features/landing-v2/conversion/qualificationClaims.ts')
  const qualUi = read('src/features/landing-v2/conversion/FounderQualification.tsx')
  const qualCss = read('src/features/landing-v2/conversion/FounderQualification.module.css')
  const faq = read('src/features/landing-v2/conversion/conversionFaq.ts')
  const adapter = read('src/features/landing-v2/conversion/landingPricingAdapter.ts')
  const pricing = read('src/features/landing-v2/conversion/LandingV2Pricing.tsx')
  const pricingCss = read('src/features/landing-v2/conversion/LandingV2Pricing.module.css')
  const finalCta = read('src/features/landing-v2/conversion/LandingV2FinalCta.tsx')
  const founderFlow = read('src/features/landing-v2/mobile-story/LandingV2FounderStory.tsx')
  const founderCss = read('src/features/landing-v2/mobile-story/FounderStoryReveal.module.css')
  const page = read('src/features/landing-v2/LandingV2Page.tsx')
  const catalog = read('src/lib/billing/planCatalog.ts')

  assertIncludes(qual, 'DLA KOGO JEST OURWED?', 'qualification eyebrow')
  assertIncludes(qual, 'OurWed będzie dla Ciebie,', 'qualification headline')
  assertIncludes(qual, 'Ustalenia są w wiadomościach.', 'signal 01')
  assertIncludes(qual, 'Przed ślubem wracasz do rozmów.', 'signal 02')
  assertIncludes(qual, 'Część sezonu nadal masz w głowie.', 'signal 03')
  assertIncludes(qual, 'Twój obecny system działa. Ale wymaga Ciebie.', 'signal 04')
  assertNotIncludes(qual, 'prawdopodobnie nie potrzebujesz OurWed', 'contrapoint removed from claims')
  assertNotIncludes(qual, 'LV2_QUALIFICATION_CONTRAPOINT', 'contrapoint export removed')
  assertNotIncludes(qualUi, 'contrapoint', 'contrapoint not in qualification UI')
  assertNotIncludes(qualCss, 'contrapoint', 'contrapoint styles removed')
  assertIncludes(qual, 'Twórcy ślubni', 'audience twórcy ślubni')
  assertIncludes(qual, 'Fotografowie', 'audience fotografowie')
  assertIncludes(qual, 'Filmowcy', 'audience filmowcy')
  assertIncludes(qual, 'Duety foto + video', 'audience duety')
  assertNotIncludes(qual, 'Studia', 'no Studia audience label')
  assertNotIncludes(qual, 'studia ślubne', 'no studia ślubne wording')
  assertNotIncludes(qual, 'z zespołem', 'no unsupported team claim')
  assertIncludes(founderFlow, 'FounderQualification', 'qualification inside Founder owner')
  assertIncludes(page, 'LandingV2Pricing', 'pricing mounted')
  assertIncludes(page, 'LandingV2Faq', 'faq mounted')
  assertIncludes(page, 'LandingV2FinalCta', 'final cta mounted')
  assert(
    page.indexOf('<LandingV2FounderStory />') < page.indexOf('<LandingV2Pricing />') &&
      page.indexOf('<LandingV2Pricing />') < page.indexOf('<LandingV2Faq />') &&
      page.indexOf('<LandingV2Faq />') < page.indexOf('<LandingV2FinalCta />'),
    'founder → pricing → faq → final cta order',
  )
  assertIncludes(adapter, "from '@/lib/billing/planCatalog'", 'pricing adapter imports catalog')
  assertIncludes(adapter, 'PRO_PLAN.monthly.label', 'monthly price from catalog')
  assertIncludes(adapter, 'PRO_PLAN.annual.label', 'annual price from catalog')
  assertIncludes(adapter, 'PRO_PLAN.trialDays', 'trial days from catalog')
  assertIncludes(pricing, 'getLandingProProduct', 'pricing uses single Pro product adapter')
  assertIncludes(pricing, 'id="cennik"', 'pricing anchor')
  assertIncludes(finalCta, 'Załóż konto', 'final CTA primary')
  assertIncludes(finalCta, 'href="#cennik"', 'final CTA secondary to pricing')
  assertIncludes(finalCta, 'Twój następny sezon', 'final CTA headline')
  assertIncludes(finalCta, 'getLandingFinalCtaTrust', 'trust lines from verified adapter')
  assertNotIncludes(finalCta, 'Anulujesz kiedy chcesz', 'no unverified paid cancel claim')
  assertNotIncludes(finalCta, '14 dni', 'trial length must match catalog (30)')
  assertIncludes(faq, 'Czy mogę zmienić plan później?', 'faq change plan')
  assertIncludes(faq, 'Czy liczba zleceń jest limitowana?', 'faq wedding limit')
  assertIncludes(faq, 'Czy mogę korzystać z OurWed na telefonie?', 'faq mobile')
  assertIncludes(faq, 'Czy mogę przenieść istniejące zlecenia do OurWed?', 'faq import')
  assertIncludes(faq, 'Jak działa okres próbny?', 'faq trial')
  assertNotIncludes(faq, 'TODO', 'no placeholder FAQ')
  assertNotIncludes(faq, 'lorem', 'no lorem FAQ')
  assertIncludes(catalog, 'amountPln: 49', 'canonical monthly amount')
  assertIncludes(catalog, 'amountPln: 490', 'canonical annual amount')
  assertIncludes(catalog, 'trialDays: 30', 'canonical trial days')
  assertNotIncludes(adapter, 'amountPln: 49', 'adapter does not re-declare commercial amounts')

  /* Qualification: centered Tier-A, chapter marker, no motion */
  assertIncludes(qualUi, 'founderStyles.openingHeadline', 'qualification reuses Founder opening type tier')
  assertIncludes(qualUi, 'data-type-tier="founder-opening"', 'qualification marks Founder opening tier')
  assertIncludes(qualUi, 'data-qualification-chapter-marker', 'chapter marker present')
  assertIncludes(qualUi, 'data-qualification-motion="none"', 'qualification motion disabled')
  assertNotIncludes(qualUi, 'useConversionReveal', 'qualification has no reveal hook')
  assertNotIncludes(qualUi, 'revealInner', 'qualification has no reveal wrappers')
  assertNotIncludes(qualCss, 'opacity: 0', 'qualification CSS has no opacity reveal')
  assertNotIncludes(qualCss, 'translateY', 'qualification CSS has no translate reveal')
  assertIncludes(qualCss, 'text-align: center', 'qualification opening/hero centered')
  assertIncludes(qualCss, '.chapterMarker', 'chapter marker styles')
  assertIncludes(qualCss, 'display: flow-root', 'qualification establishes BFC / flow-root')
  assertIncludes(qualCss, 'background: var(--founder-bg', 'qualification reinforces same Founder black token')
  assertIncludes(qualCss, 'transform: none', 'qualification root non-animated')
  assertIncludes(qualCss, 'opacity: 1', 'qualification root opaque')
  assertIncludes(founderCss, 'display: flow-root', 'Founder story uses flow-root against margin collapse')
  assertIncludes(founderCss, 'isolation: isolate', 'Founder story isolates black paint stacking')
  assertIncludes(founderCss, 'opacity: 1', 'Founder story opaque')
  assertIncludes(founderCss, '.openingHeadline', 'Founder openingHeadline token exists')
  assert(
    page.indexOf('<LandingV2FounderStory />') < page.indexOf('<LandingV2Pricing />'),
    'pricing begins only after Founder structural owner in DOM',
  )
  assertNotIncludes(pricingCss, 'margin-top: -', 'pricing must not negative-margin into black chapter')
  assertNotIncludes(pricingCss, 'translateY(-', 'pricing must not translate upward into black chapter')

  /* Single-Pro two-card billing composition */
  assertIncludes(adapter, 'Jeden plan.', 'pricing hero line 1')
  assertIncludes(adapter, 'Całe OurWed.', 'pricing hero line 2')
  assertIncludes(pricing, 'data-pricing-model="single-pro"', 'single-pro pricing model marker')
  assertIncludes(pricing, 'data-pricing-composition="two-card"', 'two-card composition')
  assertIncludes(pricing, 'data-product-tiers="1"', 'one product tier visually')
  assertIncludes(pricing, 'data-pricing-cards={product.billing.length}', 'card count from billing options')
  assertIncludes(pricing, 'data-pricing-trial-box', 'dedicated trial box container')
  assertIncludes(pricing, 'data-pricing-trial', 'trial marker')
  assertIncludes(pricing, 'data-pricing-composition-width', 'shared trial+cards width container')
  assertIncludes(pricingCss, '.pricingComposition', 'shared composition width styles')
  assertIncludes(pricingCss, 'max-width: var(--p-max)', 'composition uses pricing max token')
  assertIncludes(pricingCss, '.trialBox', 'trial box styles')
  assertNotIncludes(pricingCss, 'trialStrip', 'plain trial strip retired')
  assertNotIncludes(pricingCss, 'max-width: min(48rem', 'trial no longer independently narrower')
  assertIncludes(adapter, 'Zacznij bezpłatnie', 'trial box CTA label')
  assertIncludes(adapter, "ctaTo: '/register'", 'trial CTA uses register')
  assertIncludes(pricing, 'data-pricing-billing', 'shared billing grid parent')
  assertIncludes(pricing, 'data-pricing-card', 'pricing card marker')
  assertIncludes(pricing, 'data-pricing-cta', 'per-card CTA region')
  assertIncludes(pricing, 'data-billing=', 'billing option data attributes')
  assertIncludes(pricing, 'data-billing-recommended', 'annual recommended marker')
  assertIncludes(adapter, "id: 'pro-month'", 'monthly billing in adapter')
  assertIncludes(adapter, "id: 'pro-year'", 'annual billing in adapter')
  assertIncludes(adapter, 'Pro miesięcznie', 'monthly card title')
  assertIncludes(adapter, 'Pro rocznie', 'annual card title')
  assertNotIncludes(pricing, 'data-plan="trial"', 'trial is not a plan card')
  assertNotIncludes(pricing, 'data-billing-surface="open"', 'open editorial columns removed')
  assertNotIncludes(pricing, 'data-pricing-composition="editorial"', 'editorial composition retired')
  assertNotIncludes(pricingCss, 'billingDivider', 'open vertical divider retired')
  assertNotIncludes(pricingCss, 'billingColumn', 'open billing columns retired')
  assertNotIncludes(pricingCss, 'capabilityGrid', 'spreadsheet capability matrix retired')
  assertNotIncludes(pricingCss, 'ctaBlock', 'standalone CTA block retired')
  assertNotIncludes(pricingCss, 'cardFeatured', 'dark featured annual card retired')
  assertNotIncludes(pricingCss, '--p-featured-bg', 'featured dark surface retired')
  assertNotIncludes(pricingCss, 'linear-gradient', 'no decorative linear gradient')
  assertNotIncludes(pricingCss, 'radial-gradient', 'no decorative radial gradient')
  assertNotIncludes(pricingCss, '★', 'no decorative star')
  assertNotIncludes(pricing, '★', 'no decorative star in markup')
  assertIncludes(pricingCss, '.cardRecommended', 'annual recommendation visual class')
  assertIncludes(pricingCss, '.cardGrid', 'two-card grid')
  assertIncludes(adapter, 'LANDING_PRO_DECISION_CAPABILITIES', 'shared capability constant')
  assertIncludes(adapter, 'PRO_CAPABILITIES.slice(0, 6)', 'decision features from canonical PRO list')
  assertIncludes(adapter, 'PRO_PLAN.annual.savingLabel', 'annual savings from catalog')
  assertIncludes(adapter, 'PRO_PLAN.annual.monthlyEquivalentLabel', 'monthly equivalent from catalog')
  assertIncludes(pricing, 'product.capabilities.map', 'both cards render shared capabilities')
  assertNotIncludes(adapter, 'Enterprise', 'no invented Enterprise plan')
  assertNotIncludes(adapter, 'Basic', 'no invented Basic plan')
  assertNotIncludes(pricing, 'Enterprise', 'no Enterprise in pricing UI')

  /* FAQ rhythm + always-one-open accordion + Tier-A hero */
  const faqUi = read('src/features/landing-v2/conversion/LandingV2Faq.tsx')
  const faqCss = read('src/features/landing-v2/conversion/LandingV2Faq.module.css')
  const finalCtaCss = read('src/features/landing-v2/conversion/LandingV2FinalCta.module.css')
  assertIncludes(faqUi, 'founderStyles.openingHeadline', 'FAQ hero reuses pricing/Founder Tier-A token')
  assertIncludes(faqUi, 'data-type-tier="founder-opening"', 'FAQ marks Founder opening tier')
  assertIncludes(faqUi, 'data-faq-accordion="single"', 'single-open accordion marker')
  assertIncludes(faqUi, 'data-faq-min-open="1"', 'exactly-one-open invariant marker')
  assertIncludes(faqUi, 'FIRST_FAQ_ID', 'initial open from first FAQ id')
  assertIncludes(faqUi, 'useState(FIRST_FAQ_ID)', 'FAQ initializes first item open')
  assertIncludes(faqUi, 'setOpenFaqId(id)', 'select keeps exactly one open')
  assertNotIncludes(faqUi, '? null :', 'FAQ never transitions to zero-open')
  assertNotIncludes(faqUi, 'defaultOpen', 'no multi-open default')
  assertNotIncludes(faqCss, 'min-height: 100vh', 'FAQ must not force viewport height')
  assertNotIncludes(faqCss, 'min-height: 100dvh', 'FAQ must not force dynamic viewport height')
  assert(
    page.indexOf('<LandingV2Faq />') < page.indexOf('<LandingV2FinalCta />'),
    'black final CTA follows FAQ in DOM',
  )
  assert(
    page.indexOf('<LandingV2FinalCta />') < page.indexOf('<LandingV3Footer />'),
    'footer follows final CTA directly in page structure',
  )

  /* Final CTA — compact content-driven close, copy frozen */
  assertNotIncludes(finalCtaCss, 'min-height: 100vh', 'final CTA no 100vh')
  assertNotIncludes(finalCtaCss, 'min-height: 100svh', 'final CTA no 100svh')
  assertNotIncludes(finalCtaCss, 'min-height: 100dvh', 'final CTA no 100dvh')
  assertIncludes(finalCtaCss, 'min-height: 0', 'final CTA content-driven height')
  assertIncludes(finalCtaCss, '8vh', 'final CTA reduced vertical padding')
  assertNotIncludes(finalCtaCss, '12vw', 'oversized vw padding retired')
  assertNotIncludes(finalCtaCss, '11rem', 'oversized 11rem pad retired')
  assertNotIncludes(finalCtaCss, '8.5rem)', 'oversized 8.5rem pad retired')
  assertIncludes(finalCta, 'GOTOWY NA KOLEJNY SEZON?', 'final CTA eyebrow unchanged')
  assertIncludes(finalCta, 'Twój następny sezon', 'final CTA headline unchanged')
  assertIncludes(finalCta, 'może być prostszy.', 'final CTA headline line 2 unchanged')
  assertIncludes(finalCta, 'Zbierz najważniejsze informacje', 'final CTA support unchanged')
  assertIncludes(finalCta, 'Załóż konto', 'final CTA primary unchanged')
  assertIncludes(finalCta, 'Zobacz cennik', 'final CTA secondary unchanged')

  /* Navigation / CTA cleanup — decision links, no #produkt path */
  const productStory = read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx')
  const nav = read('src/features/landing-v3/components/LandingV3Nav.tsx')
  const footer = read('src/features/landing-v3/sections/LandingV3Footer.tsx')
  const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
  const heroCss = read('src/features/landing-v2/sections/LandingV2Hero.module.css')
  const founderStory = read('src/features/landing-v2/mobile-story/LandingV2FounderStory.tsx')
  const qualification = read('src/features/landing-v2/conversion/FounderQualification.tsx')
  const miniUi = read('src/features/landing-v2/features-grid/FeatureMiniUis.tsx')
  const v3Css = read('src/features/landing-v3/styles/landingV3.module.css')
  const mobileDash = read(
    'src/features/landing-v2/mobile-story/app/screens/MobileDashboardDemo.tsx',
  )

  assertIncludes(page, '<LandingV2ProductStory', 'Product Story still rendered')
  assertNotIncludes(productStory, 'id="produkt"', 'Product Story no longer owns #produkt')
  assertNotIncludes(hero, 'Zobacz produkt', 'Hero secondary product CTA removed')
  assertNotIncludes(hero, '#produkt', 'Hero has no #produkt link')
  assertNotIncludes(hero, 'href="#produkt"', 'Hero has no #produkt href')
  assertEq(
    (hero.match(/Załóż bezpłatne konto/g) || []).length,
    2,
    'exactly one primary CTA per Hero branch (scroll + compact)',
  )
  assertIncludes(hero, 'to="/register"', 'Hero CTA targets /register')
  assertIncludes(hero, 'Bez karty płatniczej.', 'Hero reassurance preserved')
  assertIncludes(heroCss, 'justify-content: center', 'Hero CTA row centered')
  assertIncludes(heroCss, '.ctas', 'Hero keeps CTA group class')
  assert(
    !/\.ctas\s*\{[^}]*justify-content:\s*flex-start/.test(heroCss),
    'Hero .ctas not left-offset after secondary removal',
  )

  const linksBlockMatch = nav.match(/const LINKS = \[([\s\S]*?)\] as const/)
  assert(Boolean(linksBlockMatch), 'Nav exposes shared LINKS source')
  const linksBlock = linksBlockMatch?.[1] ?? ''
  const hrefOrder = [...linksBlock.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1])
  assertEq(
    hrefOrder.join(','),
    '#jak-dziala,#stworzone-przez,#dla-kogo,#cennik,#faq',
    'top nav hash order',
  )
  assertEq(hrefOrder.length, 5, 'exactly five top-nav hash links')
  assertIncludes(nav, '{LINKS.map', 'desktop nav maps shared LINKS')
  assert(
    (nav.match(/LINKS\.map/g) || []).length >= 2,
    'desktop + mobile drawer both map shared LINKS',
  )
  assertNotIncludes(nav, '#produkt', 'nav has no #produkt')
  assertNotIncludes(nav, "'Produkt'", 'nav has no Produkt label')

  assertIncludes(founderStory, 'id="stworzone-przez"', 'Founder Story owns #stworzone-przez')
  assertEq(
    (founderStory.match(/id="stworzone-przez"/g) || []).length,
    1,
    'exactly one #stworzone-przez declaration (shared marker both branches)',
  )
  assertIncludes(founderStory, 'data-landing-hash-anchor="stworzone-przez"', 'Founder uses hash anchor marker')
  assertIncludes(founderStory, 'data-founder-story-owner', 'Founder single-owner attrs preserved')
  assertIncludes(founderStory, 'editorial.hashAnchor', 'Founder hash uses zero-size hashAnchor class')
  assertIncludes(founderCss, '.hashAnchor', 'Founder hash anchor style exists')
  assertIncludes(founderCss, 'height: 0', 'hash anchor is zero-height')
  assertIncludes(founderCss, 'margin-top: calc(-100svh)', 'Import→Founder cover overlap preserved')
  assertIncludes(founderCss, 'margin-top: calc(-100dvh)', 'Import→Founder cover dvh overlap preserved')

  assertIncludes(qualification, 'id="dla-kogo"', 'FounderQualification owns #dla-kogo')
  assertEq(
    (qualification.match(/id="dla-kogo"/g) || []).length,
    1,
    'exactly one #dla-kogo declaration',
  )
  assertIncludes(qualification, 'data-landing-hash-anchor="dla-kogo"', 'qualification hash marker on intro')
  assertIncludes(qualification, 'data-qualification-opening', 'qualification intro preserved')
  assert(
    qualification.indexOf('id="dla-kogo"') > qualification.indexOf('className={styles.root}'),
    'qualification hash is not on the padded outer root',
  )
  assertIncludes(qualification, 'styles.opening', 'qualification hash sits with opening intro')
  const qualificationCss = read('src/features/landing-v2/conversion/FounderQualification.module.css')
  assertIncludes(
    qualificationCss,
    '--q-chapter-pad-top: clamp(4.75rem, 8.2vw, 8.5rem)',
    'qualification section padding unchanged',
  )

  assertIncludes(pricing, 'id="cennik"', 'Pricing owns #cennik')
  assertEq((pricing.match(/id="cennik"/g) || []).length, 1, 'exactly one #cennik declaration')
  assertIncludes(pricing, 'data-landing-hash-anchor="cennik"', 'pricing hash marker on intro')
  assert(
    pricing.indexOf('id="cennik"') > pricing.indexOf('className={styles.section}'),
    'pricing hash is not on the padded outer section root',
  )
  assertIncludes(pricing, 'styles.intro', 'pricing hash sits with intro hero')
  assertIncludes(
    pricingCss,
    'padding: clamp(5rem, 8vw, 8rem) clamp(1.25rem, 4vw, 2.5rem) clamp(1.25rem, 2vw, 2rem)',
    'pricing section padding unchanged',
  )

  assertNotIncludes(footer, 'Produkt', 'footer has no Produkt link label')
  assertNotIncludes(footer, 'href="#produkt"', 'footer has no #produkt')
  assertIncludes(footer, 'href="#jak-dziala"', 'footer jak-dziala')
  assertIncludes(footer, 'href="#stworzone-przez"', 'footer stworzone-przez')
  assertIncludes(footer, 'href="#dla-kogo"', 'footer dla-kogo')
  assertIncludes(footer, 'href="#cennik"', 'footer cennik')
  assertIncludes(footer, 'href="#faq"', 'footer faq')
  assertNotIncludes(footer, 'Landing V3', 'footer has no Landing V3 preview label')
  assertNotIncludes(footer, 'wersja przeglądowa', 'footer has no preview wording')
  assertNotIncludes(footer, 'content creatorów', 'footer uses twórcy ślubni terminology')
  assertIncludes(footer, 'twórców ślubnych', 'footer audience aligned')
  assertIncludes(footer, '© {new Date().getFullYear()} OurWed', 'footer meta production-safe')

  assertIncludes(v3Css, 'scroll-margin-top: calc(var(--lv3-nav-h) + 1rem)', 'default hash clearance for jak-dziala/faq')
  assertIncludes(v3Css, ':global(#jak-dziala)', 'hash offset covers jak-dziala')
  assertIncludes(v3Css, ':global(#faq)', 'hash offset covers faq')
  assertIncludes(v3Css, ':global(#stworzone-przez)', 'hash offset covers stworzone-przez')
  assertIncludes(v3Css, 'scroll-margin-top: var(--lv3-nav-h)', 'Founder hash flush under nav')
  assertIncludes(v3Css, ':global(#dla-kogo)', 'hash offset covers dla-kogo')
  assertIncludes(v3Css, ':global(#cennik)', 'hash offset covers cennik')
  assertIncludes(v3Css, 'calc(var(--lv3-nav-h) + 2.5rem)', 'content-level anchors use deeper clearance')
  assertNotIncludes(v3Css, ':global(#produkt)', 'hash offset no longer includes #produkt')
  assertNotIncludes(founderStory, 'scrollBy', 'no JS scroll correction in Founder')
  assertNotIncludes(qualification, 'scrollBy', 'no JS scroll correction in qualification')
  assertNotIncludes(pricing, 'scrollBy', 'no JS scroll correction in pricing')
  assertNotIncludes(founderStory, 'hashchange', 'no hashchange loop in Founder')
  assertNotIncludes(qualification, 'hashchange', 'no hashchange loop in qualification')
  assertNotIncludes(pricing, 'hashchange', 'no hashchange loop in pricing')
  assertIncludes(v3Css, 'min-width: 1101px', 'drawer breakpoint raised for five-link nav')
  assertNotIncludes(miniUi, '<h5>', 'Ankiety mini-UI has no H5')
  assertNotIncludes(mobileDash, '<h2', 'mobile dashboard demo has no H2 outline pollution')
  assertNotIncludes(page, 'noindex', 'public Landing V2 has no noindex mutation')
  assertEq(MOBILE_TRACK_PRE_SVH + MOBILE_TRACK_DASH_SVH_FALLBACK + MOBILE_TRACK_POST_SVH + MOBILE_TRACK_POST_BRIEF_SVH + MOBILE_TRACK_STUDIO_HISTORY_SVH + MOBILE_TRACK_SEASON_IMPORT_SVH + MOBILE_TRACK_IMPORT_COVER_HOLD_SVH, 1107, 'fallback mobile track ~1107svh after tighten')

  console.log('PASS  landing v2 final conversion chapters (static)')
}

async function testLandingConversionPricingAdapter() {
  const { PRO_PLAN, PRO_CAPABILITIES } = await import('@/lib/billing/planCatalog')
  const {
    getLandingProProduct,
    getLandingBillingOptions,
    getLandingFinalCtaTrust,
    getLandingPricingCopy,
    LANDING_PRO_DECISION_CAPABILITIES,
  } = await import('@/features/landing-v2/conversion/landingPricingAdapter')

  const copy = getLandingPricingCopy()
  assertEq(copy.headlineLine1, 'Jeden plan.', 'hero line 1')
  assertEq(copy.headlineLine2, 'Całe OurWed.', 'hero line 2')
  assertEq(copy.trialBox.ctaTo, '/register', 'trial box CTA to register')
  assert(copy.trialBox.eyebrow.includes(String(PRO_PLAN.trialDays)), 'trial box eyebrow days')
  assert(copy.trialBox.headline.includes(String(PRO_PLAN.trialDays)), 'trial box headline days')
  assert(/Bez karty/i.test(copy.trialBox.support), 'trial box mentions no card')
  assertEq(copy.trialBox.ctaLabel, 'Zacznij bezpłatnie', 'trial box CTA label')

  const product = getLandingProProduct()
  assertEq(product.name, 'OurWed Pro', 'single product name')
  assertEq(product.billing.length, 2, 'exactly two billing cards')
  assertEq(product.capabilities.length, 6, 'shared capability count')
  assertEq(product.capabilities, LANDING_PRO_DECISION_CAPABILITIES, 'product uses shared capability source')
  assert(product.capabilities.every((f) => (PRO_CAPABILITIES as readonly string[]).includes(f)), 'capabilities subset of PRO')
  assertEq(product.ctaTo, '/register', 'CTA to register')

  const billing = getLandingBillingOptions()
  assertEq(billing.length, 2, 'two billing options')
  assertEq(billing[0]?.title, 'Pro miesięcznie', 'monthly title')
  assertEq(billing[1]?.title, 'Pro rocznie', 'annual title')
  assertEq(billing[0]?.priceLabel, PRO_PLAN.monthly.label, 'monthly price matches catalog')
  assertEq(billing[1]?.priceLabel, PRO_PLAN.annual.label, 'annual price matches catalog')
  assertEq(billing[1]?.secondaryPriceHint, PRO_PLAN.annual.monthlyEquivalentLabel, 'annual monthly equiv')
  assertEq(billing[1]?.savingLabel, PRO_PLAN.annual.savingLabel, 'annual saving label')
  assertEq(billing[1]?.badge, PRO_PLAN.annual.recommendedBadge, 'annual badge')
  assertEq(billing[1]?.recommended, true, 'annual recommended')
  assert(!billing.some((b) => b.id.includes('trial')), 'trial not a billing option')

  const trust = getLandingFinalCtaTrust()
  assert(trust.some((t) => t.includes(String(PRO_PLAN.trialDays))), 'trust mentions trial days')
  assert(trust.some((t) => /Bez karty/i.test(t)), 'trust mentions no card')
  assert(!trust.some((t) => /anuluj/i.test(t)), 'trust omits cancel claim')

  const { LV2_CONVERSION_FAQ } = await import('@/features/landing-v2/conversion/conversionFaq')
  assert(LV2_CONVERSION_FAQ.length > 0, 'FAQ has items')
  assertEq(LV2_CONVERSION_FAQ[0]?.id, 'change-plan', 'first FAQ id stable for default-open')

  console.log('PASS  landing v2 pricing adapter (runtime)')
}

await testLandingConversionPricingAdapter()

console.log('\nAll Landing V2 acceptance guards passed.')
