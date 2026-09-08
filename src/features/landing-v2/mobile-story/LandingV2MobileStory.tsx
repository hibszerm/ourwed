import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  motion,
  motionValue,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'framer-motion'
import { HeroPhoneFrame } from '@/features/landing-v2/mobile-story/device/HeroPhoneFrame'
import { MobileOurWedApp } from '@/features/landing-v2/mobile-story/app/MobileOurWedApp'
import { CompactPhoneProductTour } from '@/features/landing-v2/devices/CompactPhoneProductTour'
import {
  clearMobileStoryProgress,
  publishMobileAppProgress,
  publishMobileStoryProgress,
} from '@/features/landing-v2/mobile-story/mobileStoryClock'
import { StudioHistoryReveal } from '@/features/landing-v2/mobile-story/StudioHistoryReveal'
import { StudioImportReveal } from '@/features/landing-v2/mobile-story/StudioImportReveal'
import { MOBILE_TRACK_IMPORT_COVER_HOLD_SVH } from '@/features/landing-v2/mobile-story/founderStoryProgress'
import {
  postBriefChromeOpAt,
  postBriefCompressAt,
  postBriefContentOpAt,
  postBriefKeyholeAt,
  postBriefRunwaySvh,
  postBriefScreenMergeAt,
  postBriefSecurityCopyAt,
  postBriefShackleAt,
  postBriefShrinkScaleAt,
} from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import {
  MOBILE_TRACK_SEASON_IMPORT_SVH,
  seasonImportLockOpAt,
  seasonImportLockScaleAt,
  seasonImportLockYAt,
} from '@/features/landing-v2/mobile-story/seasonImportProgress'
import {
  MOBILE_TRACK_STUDIO_HISTORY_SVH,
  studioLockScaleAt,
  studioLockYVhAt,
  studioSecurityCopyOpAt,
  studioSecurityCopyYAt,
} from '@/features/landing-v2/mobile-story/studioHistoryProgress'
import {
  LV2_SECURITY_COPY,
  LV2_SECURITY_MICRO_POINTS,
} from '@/features/landing-v2/security-history/securityHistoryClaims'
import {
  HEADLINE_SEP_COMPACT_SCALE,
  headlineCompositeOpacityAt,
  headlineEnterBlurPxAt,
  headlineExitBlurPxAt,
  headlineEnterYAt,
  headlineSepYAt,
  phoneInT,
  phoneSettled,
} from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import {
  dashPhaseOuterPxFromMaxScroll,
  dashTrackSvhFromMaxScroll,
  mobileNavPacingDiagnostics,
  MOBILE_TRACK_DASH_SVH_FALLBACK,
  MOBILE_TRACK_POST_SVH,
  MOBILE_TRACK_PRE_SVH,
  MOBILE_TRACK_PRE_SVH_COMPACT,
  postPhaseBudgetsFromDayMax,
  postTrackSvhFromDayMaxScroll,
  splitMobileMasterProgress,
} from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'
import { dashboardMaxScrollMv } from '@/features/landing-v2/mobile-story/app/motion/mobileDashboardScrollGeometry'
import { weddingDayMaxScrollMv } from '@/features/landing-v2/mobile-story/app/motion/mobileWeddingDayScrollGeometry'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import { useTheaterScrollGate } from '@/features/landing-v2/motion/useTheaterScrollGate'
import styles from './LandingV2MobileStory.module.css'

const OWNED_EPS = 0.002
/** Compact phone enter rise — slightly less than desktop 100px. */
const PHONE_ENTER_Y_COMPACT = 48
const PHONE_ENTER_Y_DESKTOP = 100
/** Compact phone enter scale start (desktop remains 0.86 → 1). */
const PHONE_SCALE_START_COMPACT = 0.94
const PHONE_SCALE_START_DESKTOP = 0.86
/**
 * Compact app runway after phone settle — short presentation hold only.
 * Internal demo is time-driven (3F); sticky must not trap the user for the
 * full tour duration. 3H.1: ~30% shorter settled→release dead scroll
 * (was 36+24=60svh → 20+12=32svh).
 */
const MOBILE_TRACK_DASH_SVH_COMPACT = 20
const MOBILE_TRACK_POST_SVH_COMPACT = 12

const IDLE_1 = motionValue(1)
const IDLE_0 = motionValue(0)
const STATIC_LOCK_MORPH = {
  compress: IDLE_0,
  chrome: IDLE_1,
  brief: IDLE_1,
  screenMerge: IDLE_0,
  shackle: IDLE_0,
  keyhole: IDLE_0,
}

/**
 * Landing V2 Mobile Story — owns phone through:
 * Features → headline → phone settle → Dash → Day → Nav → Brief
 *
 * Desktop continues: post-Brief morph → lock → Security → Studio History → Import.
 *
 * Compact (3H): phone tour only, then sticky RELEASES and phone exits as a
 * normal document object (1:1). Security + History live in
 * LandingV2SecurityHistoryStory document flow — no phone→lock morph.
 *
 * Only prefers-reduced-motion uses the static fallback.
 */
export function LandingV2MobileStory() {
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const isCompactViewport = useLandingCompactViewport()
  const progress = useMotionValue(0)
  const appProgress = useMotionValue(0)
  const postBriefProgress = useMotionValue(0)
  const studioProgress = useMotionValue(0)
  const importProgress = useMotionValue(0)
  const navHRef = useRef(68)
  const dashSvhRef = useRef(
    isCompactViewport ? MOBILE_TRACK_DASH_SVH_COMPACT : MOBILE_TRACK_DASH_SVH_FALLBACK,
  )
  const postSvhRef = useRef(
    isCompactViewport ? MOBILE_TRACK_POST_SVH_COMPACT : MOBILE_TRACK_POST_SVH,
  )
  const compactRef = useRef(isCompactViewport)
  compactRef.current = isCompactViewport

  /* Theater on compact; only accessibility reduces to static. */
  const simple = Boolean(reduced)
  const { activeRef, onBecameActiveRef } = useTheaterScrollGate(
    trackRef,
    !simple,
    {
      /* Compact: tighter gate so far-offscreen Mobile Story stays dormant (3E). */
      rootMargin: isCompactViewport ? '35% 0px 35% 0px' : '100% 0px 100% 0px',
    },
  )
  /** Defer live in-phone app DOM until the phone starts entering. */
  const [phoneAppMounted, setPhoneAppMounted] = useState(false)
  const phoneAppMountedRef = useRef(false)

  useEffect(() => {
    if (simple) {
      progress.set(1)
      appProgress.set(1)
      postBriefProgress.set(1)
      studioProgress.set(1)
      importProgress.set(1)
      publishMobileStoryProgress(1)
      publishMobileAppProgress(1)
      stickyRef.current?.setAttribute('data-mobile-track-budgets-frozen', 'true')
      return () => {
        clearMobileStoryProgress()
      }
    }

    const el = trackRef.current
    if (!el) return

    let raf = 0
    /*
     * OSCILLATOR ROOT CAUSE (proven by ownership chain):
     * postBrief morph changes chassis aspectRatio → in-phone viewport ResizeObserver
     * → publishDashboardMaxScroll / publishWeddingDayMaxScroll
     * → applyTrackBudgets writes --mobile-track-*-svh
     * → track offsetHeight / contentTravel remaps
     * → same scrollY yields different postBriefProgress
     * → PHONE ↔ LOCK every scroll/rAF (~50ms).
     *
     * Fix: freeze track budgets + travel mapping once content theater ends /
     * postBrief begins. Progress must not depend on morphing phone bbox.
     */
    const budgetsFrozenRef = { current: false }
    const frozenTravelRef = {
      current: null as null | {
        contentTravel: number
        postBriefTravel: number
        studioTravel: number
        importTravel: number
        coverHoldTravel: number
        preTravel: number
        totalTravel: number
        dashMax: number
        dayMax: number
      },
    }

    const applyTrackBudgets = (dashMax: number, dayMax: number) => {
      if (budgetsFrozenRef.current) return false
      /* Compact: fixed short presentation runway — internal demo is time-driven (3F). */
      if (compactRef.current) {
        if (dashSvhRef.current !== MOBILE_TRACK_DASH_SVH_COMPACT) {
          dashSvhRef.current = MOBILE_TRACK_DASH_SVH_COMPACT
          el.style.setProperty(
            '--mobile-track-dash-svh',
            String(MOBILE_TRACK_DASH_SVH_COMPACT),
          )
        }
        if (postSvhRef.current !== MOBILE_TRACK_POST_SVH_COMPACT) {
          postSvhRef.current = MOBILE_TRACK_POST_SVH_COMPACT
          el.style.setProperty(
            '--mobile-track-post-svh',
            String(MOBILE_TRACK_POST_SVH_COMPACT),
          )
        }
        return false
      }
      const nextDash = dashTrackSvhFromMaxScroll(dashMax, window.innerHeight)
      const nextPost = postTrackSvhFromDayMaxScroll(dayMax, window.innerHeight)
      let changed = false
      if (nextDash !== dashSvhRef.current) {
        dashSvhRef.current = nextDash
        el.style.setProperty('--mobile-track-dash-svh', String(nextDash))
        changed = true
      }
      if (nextPost !== postSvhRef.current) {
        postSvhRef.current = nextPost
        el.style.setProperty('--mobile-track-post-svh', String(nextPost))
        changed = true
      }
      if (changed && import.meta.env.DEV) {
        console.debug('[lv2-mobile-budgets]', mobileNavPacingDiagnostics(dayMax), {
          dashSvh: nextDash,
          postSvh: nextPost,
        })
      }
      return changed
    }

    applyTrackBudgets(dashboardMaxScrollMv.get(), weddingDayMaxScrollMv.get())

    const measure = () => {
      if (!navHRef.current || navHRef.current === 68) {
        navHRef.current =
          parseFloat(getComputedStyle(el).getPropertyValue('--lv2-nav-h')) || 68
      }
      const navH = navHRef.current
      const rect = el.getBoundingClientRect()
      const usable = window.innerHeight - navH
      const preSvh = compactRef.current ? MOBILE_TRACK_PRE_SVH_COMPACT : MOBILE_TRACK_PRE_SVH
      /* Compact 3H: no postBrief / studio theater — sticky ends after phone tour. */
      const studioSvh = compactRef.current ? 0 : MOBILE_TRACK_STUDIO_HISTORY_SVH
      const contentSvh =
        preSvh + dashSvhRef.current + (postSvhRef.current || MOBILE_TRACK_POST_SVH)
      const postBriefSvh = compactRef.current ? 0 : postBriefRunwaySvh(false)
      const mappingSvh = contentSvh + postBriefSvh
      const importSvh = compactRef.current ? 0 : MOBILE_TRACK_SEASON_IMPORT_SVH
      const coverHoldSvh = compactRef.current ? 0 : MOBILE_TRACK_IMPORT_COVER_HOLD_SVH
      const legacyChapterSvh = studioSvh + importSvh
      const chapterSvh = legacyChapterSvh + coverHoldSvh
      const totalSvh = mappingSvh + chapterSvh
      const liveTravel = Math.max(1, el.offsetHeight - usable)
      const mappingHeight = el.offsetHeight * (mappingSvh / Math.max(totalSvh, mappingSvh))
      const liveMappingTravel = Math.max(1, mappingHeight - usable)
      const liveContentTravel = Math.max(1, liveMappingTravel * (contentSvh / mappingSvh))
      const livePostBriefTravel = Math.max(1, liveMappingTravel - liveContentTravel)
      const livePostMappingTravel = Math.max(0, liveTravel - liveMappingTravel)
      const liveLegacyChapterTravel =
        chapterSvh <= 0
          ? 0
          : livePostMappingTravel * (legacyChapterSvh / chapterSvh)
      const liveCoverHoldTravel =
        chapterSvh <= 0 ? 0 : Math.max(0, livePostMappingTravel - liveLegacyChapterTravel)
      const liveStudioTravel =
        legacyChapterSvh <= 0
          ? 0
          : liveLegacyChapterTravel * (studioSvh / legacyChapterSvh)
      const liveImportTravel =
        legacyChapterSvh <= 0
          ? 0
          : Math.max(0, liveLegacyChapterTravel - liveStudioTravel)
      const preHeight = mappingHeight * (preSvh / mappingSvh)
      const livePreTravel = Math.max(1, preHeight - usable)

      const frozen = frozenTravelRef.current
      const contentTravel = frozen?.contentTravel ?? liveContentTravel
      const postBriefTravel = frozen?.postBriefTravel ?? livePostBriefTravel
      const studioTravel = frozen?.studioTravel ?? liveStudioTravel
      const importTravel = frozen?.importTravel ?? liveImportTravel
      const coverHoldTravel = frozen?.coverHoldTravel ?? liveCoverHoldTravel
      const preTravel = frozen?.preTravel ?? livePreTravel
      const travel = frozen?.totalTravel ?? liveTravel

      const scrollDist =
        rect.top > navH + 0.5 ? 0 : Math.min(travel, Math.max(0, navH - rect.top))
      const contentScroll = Math.min(scrollDist, contentTravel)
      const dashMax = frozen?.dashMax ?? dashboardMaxScrollMv.get()
      const dayMax = frozen?.dayMax ?? weddingDayMaxScrollMv.get()
      const dashPhaseOuter = dashPhaseOuterPxFromMaxScroll(dashMax)
      const postBudgets = postPhaseBudgetsFromDayMax(dayMax)
      const { theater, app } = splitMobileMasterProgress(
        contentScroll,
        contentTravel,
        preTravel,
        dashPhaseOuter,
        postBudgets,
      )
      progress.set(theater)
      /* Compact phone tour owns app progress locally — do not scrub MobileOurWedApp via scroll. */
      if (!compactRef.current) {
        appProgress.set(app)
        publishMobileAppProgress(app)
      } else {
        appProgress.set(0)
        publishMobileAppProgress(0)
      }
      const mappingEnd = contentTravel + postBriefTravel
      const studioEnd = mappingEnd + studioTravel
      const importEnd = studioEnd + importTravel
      const pb =
        scrollDist <= contentTravel
          ? 0
          : scrollDist >= mappingEnd
            ? 1
            : Math.min(1, Math.max(0, (scrollDist - contentTravel) / postBriefTravel))
      const studio =
        studioTravel <= 0
          ? 0
          : scrollDist <= mappingEnd
            ? 0
            : scrollDist >= studioEnd
              ? 1
              : Math.min(1, Math.max(0, (scrollDist - mappingEnd) / studioTravel))
      const seasonImport =
        importTravel <= 0
          ? 0
          : scrollDist <= studioEnd
            ? 0
            : scrollDist >= importEnd
              ? 1
              : Math.min(1, Math.max(0, (scrollDist - studioEnd) / importTravel))
      postBriefProgress.set(pb)
      studioProgress.set(studio)
      importProgress.set(seasonImport)
      publishMobileStoryProgress(theater)

      if (!budgetsFrozenRef.current && (scrollDist >= contentTravel - 2 || pb > 0.0005)) {
        budgetsFrozenRef.current = true
        frozenTravelRef.current = {
          contentTravel: liveContentTravel,
          postBriefTravel: livePostBriefTravel,
          studioTravel: liveStudioTravel,
          importTravel: liveImportTravel,
          coverHoldTravel: liveCoverHoldTravel,
          preTravel: livePreTravel,
          totalTravel: liveTravel,
          dashMax: dashboardMaxScrollMv.get(),
          dayMax: weddingDayMaxScrollMv.get(),
        }
      } else if (budgetsFrozenRef.current && scrollDist < liveContentTravel * 0.9) {
        budgetsFrozenRef.current = false
        frozenTravelRef.current = null
      }

      stickyRef.current?.setAttribute('data-mobile-progress', theater.toFixed(4))
      stickyRef.current?.setAttribute(
        'data-mobile-app-progress',
        compactRef.current ? 'tour' : app.toFixed(4),
      )
      stickyRef.current?.setAttribute('data-mobile-post-brief', pb.toFixed(4))
      stickyRef.current?.setAttribute('data-mobile-studio-history', studio.toFixed(4))
      stickyRef.current?.setAttribute('data-mobile-season-import', seasonImport.toFixed(4))
      stickyRef.current?.setAttribute('data-mobile-cover-hold', coverHoldTravel.toFixed(0))
      stickyRef.current?.setAttribute('data-mobile-dash-svh', String(dashSvhRef.current))
      stickyRef.current?.setAttribute('data-mobile-post-svh', String(postSvhRef.current))
      stickyRef.current?.setAttribute(
        'data-mobile-track-budgets-frozen',
        budgetsFrozenRef.current ? 'true' : 'false',
      )

      if (import.meta.env.DEV && typeof window !== 'undefined') {
        const w = window as Window & {
          __LV2_TRACE_PHONE_LOCK__?: boolean
          __LV2_PHONE_LOCK_FRAMES__?: Array<Record<string, number | string | boolean>>
        }
        if (w.__LV2_TRACE_PHONE_LOCK__) {
          const frames = (w.__LV2_PHONE_LOCK_FRAMES__ ??= [])
          const chassis = stickyRef.current?.querySelector<HTMLElement>('[data-phone-chassis]')
          const root = stickyRef.current?.querySelector<HTMLElement>('[data-mobile-phone]')
          const chassisRect = chassis?.getBoundingClientRect() ?? { width: 0, height: 0, left: 0, top: 0 }
          const rootRect = root?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 }
          frames.push({
            t: performance.now(),
            scrollY: window.scrollY,
            postBrief: pb,
            studio,
            seasonImport,
            theater,
            app,
            contentTravel,
            postBriefTravel,
            budgetsFrozen: budgetsFrozenRef.current,
            dashSvh: dashSvhRef.current,
            postSvh: postSvhRef.current,
            aspect: root ? getComputedStyle(root).aspectRatio : '',
            chassisW: chassisRect.width,
            chassisH: chassisRect.height,
            phoneCenterX: rootRect.left + rootRect.width / 2,
            phoneCenterY: rootRect.top + rootRect.height / 2,
            writer: 'LandingV2MobileStory.measure',
          })
          if (frames.length > 240) frames.splice(0, frames.length - 240)
        }
      }
    }

    const onScroll = () => {
      if (!activeRef.current) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    const onResize = () => {
      navHRef.current =
        parseFloat(getComputedStyle(el).getPropertyValue('--lv2-nav-h')) || 68
      /* Real viewport resize may remount travel; content RO must not. */
      budgetsFrozenRef.current = false
      frozenTravelRef.current = null
      applyTrackBudgets(dashboardMaxScrollMv.get(), weddingDayMaxScrollMv.get())
      onScroll()
    }

    const unsubDash = dashboardMaxScrollMv.on('change', (max) => {
      if (budgetsFrozenRef.current) return
      if (applyTrackBudgets(Number(max), weddingDayMaxScrollMv.get())) onScroll()
    })
    const unsubDay = weddingDayMaxScrollMv.on('change', (max) => {
      if (budgetsFrozenRef.current) return
      if (applyTrackBudgets(dashboardMaxScrollMv.get(), Number(max))) onScroll()
    })

    onBecameActiveRef.current = onScroll
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      onBecameActiveRef.current = null
      cancelAnimationFrame(raf)
      unsubDash()
      unsubDay()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      clearMobileStoryProgress()
    }
  }, [
    simple,
    progress,
    appProgress,
    postBriefProgress,
    studioProgress,
    importProgress,
    activeRef,
    onBecameActiveRef,
  ])

  useMotionValueEvent(progress, 'change', (p) => {
    const sticky = stickyRef.current
    if (!sticky) return
    sticky.setAttribute('data-mobile-owned', p > OWNED_EPS ? 'true' : 'false')
    sticky.setAttribute(
      'data-mobile-device-settled',
      phoneSettled(p) ? 'true' : 'false',
    )
    if (!phoneAppMountedRef.current && phoneInT(p) > 0.02) {
      phoneAppMountedRef.current = true
      setPhoneAppMounted(true)
    }
  })

  const phoneIn = useTransform(progress, (p) => phoneInT(p))

  const headlineLineOpacity = useTransform(progress, (p) => headlineCompositeOpacityAt(p))
  const headlineBlur = useTransform(progress, (p) => {
    /* Compact / coarse phones: opacity+y only — filter blur is a known iOS cost. */
    if (compactRef.current) return 'none'
    const b = Math.max(headlineEnterBlurPxAt(p), headlineExitBlurPxAt(p))
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })
  const enterY = useTransform(progress, (p) => headlineEnterYAt(p))
  const sepOffset = useTransform(progress, (p) => {
    if (compactRef.current) {
      /* Linear + reduced travel — editorial micro-motion (~0.45 px/px), not 1:1. */
      return headlineSepYAt(p, { linear: true, exitDriftPx: 12 }) * HEADLINE_SEP_COMPACT_SCALE
    }
    return headlineSepYAt(p)
  })
  const line1Y = useTransform([enterY, sepOffset], ([ey, sep]) => Number(ey) - Number(sep))
  const line2Y = useTransform([enterY, sepOffset], ([ey, sep]) => Number(ey) + Number(sep))

  /* Compact 3H: no morph remap — postBrief stays identity 0. Desktop remaps. */
  const postBriefVisual = useTransform(postBriefProgress, (p) =>
    compactRef.current ? 0 : Number(p),
  )

  /* ONE transform owner for main scale: .phoneSystem — enter × (desktop) morph × studio. */
  const phoneOpacity = useTransform(
    [phoneIn, importProgress],
    ([inn, im]) =>
      Number(inn) *
      (compactRef.current ? 1 : seasonImportLockOpAt(Number(im))),
  )
  const phoneVisibility = useTransform(phoneOpacity, (o) =>
    Number(o) < 0.02 ? ('hidden' as const) : ('visible' as const),
  )
  const phoneScale = useTransform(
    [phoneIn, postBriefVisual, studioProgress, importProgress],
    ([inn, pb, st, im]) => {
      const start = compactRef.current ? PHONE_SCALE_START_COMPACT : PHONE_SCALE_START_DESKTOP
      const enterScale = start + Number(inn) * (1 - start)
      /* Compact 3H: phone stays at established size — no shrink / studio scale. */
      if (compactRef.current) return enterScale
      const studioScale = studioLockScaleAt(Number(st), false)
      const importScale = seasonImportLockScaleAt(Number(im))
      return enterScale * postBriefShrinkScaleAt(Number(pb)) * studioScale * importScale
    },
  )
  /*
   * Compact 3H: enter Y only — native sticky release moves the phone 1:1.
   * Desktop: enter + security morph lift + studio travel (unchanged).
   */
  const phoneY = useTransform(
    [phoneIn, studioProgress, importProgress],
    ([inn, st, im]) => {
      const enterMax = compactRef.current ? PHONE_ENTER_Y_COMPACT : PHONE_ENTER_Y_DESKTOP
      const enterPx = (1 - Number(inn)) * enterMax
      if (compactRef.current) return enterPx
      const studioVh = studioLockYVhAt(Number(st), false)
      const exitPx = seasonImportLockYAt(Number(im))
      const px = enterPx + exitPx
      if (studioVh === 0) return px
      return `calc(${px}px + ${studioVh}vh)`
    },
  )

  const lockMorph = {
    compress: useTransform(postBriefVisual, (p) =>
      compactRef.current ? 0 : postBriefCompressAt(p),
    ),
    chrome: useTransform(postBriefVisual, (p) =>
      compactRef.current ? 1 : postBriefChromeOpAt(p),
    ),
    brief: useTransform(postBriefVisual, (p) =>
      compactRef.current ? 1 : postBriefContentOpAt(p),
    ),
    screenMerge: useTransform(postBriefVisual, (p) =>
      compactRef.current ? 0 : postBriefScreenMergeAt(p),
    ),
    shackle: useTransform(postBriefVisual, (p) =>
      compactRef.current ? 0 : postBriefShackleAt(p),
    ),
    keyhole: useTransform(postBriefVisual, (p) =>
      compactRef.current ? 0 : postBriefKeyholeAt(p),
    ),
  }

  const securityCopyOp = useTransform(
    [postBriefVisual, studioProgress],
    ([pb, st]) => {
      if (compactRef.current) return 0
      return postBriefSecurityCopyAt(Number(pb)) * studioSecurityCopyOpAt(Number(st), false)
    },
  )
  const securityCopyY = useTransform([postBriefVisual, studioProgress], ([pb, st]) => {
    if (compactRef.current) return 0
    return (
      (1 - postBriefSecurityCopyAt(Number(pb))) * 14 + studioSecurityCopyYAt(Number(st), false)
    )
  })
  const paperOp = useTransform(postBriefVisual, (p) => {
    if (compactRef.current) return 0
    if (p <= 0.005) return 0
    return Math.min(1, (p - 0.005) / 0.08)
  })

  if (simple) {
    return (
      <section
        className={styles.static}
        data-testid="lv2-mobile-story"
        data-mobile-theater="static"
        data-mobile-compact={isCompactViewport ? 'true' : 'false'}
        aria-labelledby="lv2-mobile-heading"
      >
        <div className={styles.staticInner}>
          <h2 id="lv2-mobile-heading" className={styles.staticHeadline}>
            <span className={styles.headlineLine}>Wszystko zostaje z Tobą.</span>
            <span className={styles.headlineLine}>Gdziekolwiek pracujesz.</span>
          </h2>
          <div className={styles.staticDevice} data-mobile-device-settled="true">
            <HeroPhoneFrame lockMorph={STATIC_LOCK_MORPH}>
              {isCompactViewport ? (
                <CompactPhoneProductTour
                  theaterProgress={progress}
                  reducedMotion={Boolean(reduced)}
                />
              ) : (
                <MobileOurWedApp appProgress={appProgress} staticMode />
              )}
            </HeroPhoneFrame>
          </div>
          <div className={styles.staticSecurity} data-security-copy="">
            <p className={styles.secEyebrow}>{LV2_SECURITY_COPY.eyebrow}</p>
            <h2 className={styles.secHeadline}>{LV2_SECURITY_COPY.headline}</h2>
            <p className={styles.secSupport}>{LV2_SECURITY_COPY.support}</p>
            <ul className={styles.secMicro}>
              {LV2_SECURITY_MICRO_POINTS.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={trackRef}
      className={styles.track}
      data-testid="lv2-mobile-story"
      data-mobile-theater="scroll"
      data-mobile-compact={isCompactViewport ? 'true' : 'false'}
      data-mobile-phone-lock-owner={isCompactViewport ? 'false' : 'true'}
      data-mobile-post-brief-owner={isCompactViewport ? 'false' : 'true'}
      data-compact-native-exit={isCompactViewport ? '3h2' : 'false'}
      data-compact-phone-release-layer={isCompactViewport ? 'above-security' : 'false'}
      data-phone-security-stack={isCompactViewport ? 'track-over-flow' : 'false'}
      style={
        {
          '--mobile-track-pre-svh': isCompactViewport
            ? MOBILE_TRACK_PRE_SVH_COMPACT
            : MOBILE_TRACK_PRE_SVH,
          '--mobile-track-dash-svh': isCompactViewport
            ? MOBILE_TRACK_DASH_SVH_COMPACT
            : MOBILE_TRACK_DASH_SVH_FALLBACK,
          '--mobile-track-post-svh': isCompactViewport
            ? MOBILE_TRACK_POST_SVH_COMPACT
            : MOBILE_TRACK_POST_SVH,
          /* Compact 3H: zero morph / studio runway — phone unpins after tour. */
          '--mobile-track-post-brief-svh': isCompactViewport ? 0 : postBriefRunwaySvh(false),
          '--mobile-track-studio-history-svh': isCompactViewport
            ? 0
            : MOBILE_TRACK_STUDIO_HISTORY_SVH,
          '--mobile-track-season-import-svh': isCompactViewport
            ? 0
            : MOBILE_TRACK_SEASON_IMPORT_SVH,
          '--mobile-track-import-cover-hold-svh': isCompactViewport
            ? 0
            : MOBILE_TRACK_IMPORT_COVER_HOLD_SVH,
        } as CSSProperties
      }
      aria-labelledby="lv2-mobile-heading"
    >
      <motion.div
        ref={stickyRef}
        className={styles.sticky}
        data-mobile-owned="false"
      >
        <motion.div className={styles.postBriefPaper} style={{ opacity: paperOp }} aria-hidden />
        <div className={styles.stage}>
          <div className={styles.stageCenter} data-mobile-stage-center="">
            <div className={styles.headlineSystem} data-mobile-headline="">
              <h2 id="lv2-mobile-heading" className={styles.headline}>
                <motion.div
                  className={styles.headlineLine}
                  style={{ opacity: headlineLineOpacity, y: line1Y, filter: headlineBlur }}
                >
                  Wszystko zostaje z Tobą.
                </motion.div>
                <motion.div
                  className={styles.headlineLine}
                  style={{ opacity: headlineLineOpacity, y: line2Y, filter: headlineBlur }}
                >
                  Gdziekolwiek pracujesz.
                </motion.div>
              </h2>
            </div>

            <motion.div
              className={styles.phoneSystem}
              data-mobile-phone-system=""
              data-security-real-phone=""
              data-phone-transform-owner="phoneSystem"
              data-security-transition={isCompactViewport ? 'native-exit' : 'continuous-morph'}
              data-compact-native-exit={isCompactViewport ? '3h2' : 'false'}
              data-phone-release-layer={isCompactViewport ? 'above-security' : undefined}
              data-studio-lock={isCompactViewport ? undefined : ''}
              style={{ opacity: phoneOpacity, visibility: phoneVisibility, scale: phoneScale, y: phoneY }}
            >
              <HeroPhoneFrame lockMorph={isCompactViewport ? STATIC_LOCK_MORPH : lockMorph}>
                {isCompactViewport ? (
                  phoneAppMounted ? (
                    <CompactPhoneProductTour theaterProgress={progress} />
                  ) : (
                    <div
                      aria-hidden
                      data-mobile-app-placeholder=""
                      style={{
                        width: '100%',
                        height: '100%',
                        background:
                          'linear-gradient(180deg, #f7f4ef 0%, #efeae3 100%)',
                      }}
                    />
                  )
                ) : phoneAppMounted ? (
                  <MobileOurWedApp appProgress={appProgress} />
                ) : (
                  <div
                    aria-hidden
                    data-mobile-app-placeholder=""
                    style={{
                      width: '100%',
                      height: '100%',
                      background:
                        'linear-gradient(180deg, #f7f4ef 0%, #efeae3 100%)',
                    }}
                  />
                )}
              </HeroPhoneFrame>
            </motion.div>
          </div>

          {!isCompactViewport ? (
            <motion.div
              className={styles.securityCopy}
              data-security-copy=""
              style={{ opacity: securityCopyOp, y: securityCopyY, x: '-50%' }}
            >
              <p className={styles.secEyebrow}>{LV2_SECURITY_COPY.eyebrow}</p>
              <h2 className={styles.secHeadline}>{LV2_SECURITY_COPY.headline}</h2>
              <p className={styles.secSupport}>{LV2_SECURITY_COPY.support}</p>
              <ul className={styles.secMicro}>
                {LV2_SECURITY_MICRO_POINTS.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </motion.div>
          ) : null}

          {!isCompactViewport ? (
            <>
              <StudioHistoryReveal progress={studioProgress} exitProgress={importProgress} />
              <StudioImportReveal progress={importProgress} />
            </>
          ) : null}
        </div>
      </motion.div>
    </section>
  )
}
