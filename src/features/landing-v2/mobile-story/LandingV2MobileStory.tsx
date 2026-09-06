import { useEffect, useRef, type CSSProperties } from 'react'
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
import {
  clearMobileStoryProgress,
  publishMobileAppProgress,
  publishMobileStoryProgress,
} from '@/features/landing-v2/mobile-story/mobileStoryClock'
import { StudioHistoryReveal } from '@/features/landing-v2/mobile-story/StudioHistoryReveal'
import { StudioImportReveal } from '@/features/landing-v2/mobile-story/StudioImportReveal'
import { MOBILE_TRACK_IMPORT_COVER_HOLD_SVH } from '@/features/landing-v2/mobile-story/founderStoryProgress'
import {
  MOBILE_TRACK_POST_BRIEF_SVH,
  postBriefChromeOpAt,
  postBriefCompressAt,
  postBriefContentOpAt,
  postBriefKeyholeAt,
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
import styles from './LandingV2MobileStory.module.css'

const OWNED_EPS = 0.002
/** Compact headline split — shorter travel, same desktop relationship. */
const HEADLINE_SEP_COMPACT_SCALE = 110 / 155
/** Compact phone enter rise — slightly less than desktop 100px. */
const PHONE_ENTER_Y_COMPACT = 72
const PHONE_ENTER_Y_DESKTOP = 100

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
 * → post-Brief shrink → SAME phone becomes CLOSED lock → security copy → hold
 * → SAME lock scales/lifts into Studio History (appended chapter)
 * → Season Import (appended after History final)
 * → Import sticky cover-hold runway (Founder is a separate normal-flow sibling).
 *
 * Compact + normal motion runs the full scroll theater (same beats as desktop).
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
  const dashSvhRef = useRef(MOBILE_TRACK_DASH_SVH_FALLBACK)
  const postSvhRef = useRef(MOBILE_TRACK_POST_SVH)
  const compactRef = useRef(isCompactViewport)
  compactRef.current = isCompactViewport

  /* Theater on compact; only accessibility reduces to static. */
  const simple = Boolean(reduced)

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
      const contentSvh =
        preSvh + dashSvhRef.current + (postSvhRef.current || MOBILE_TRACK_POST_SVH)
      const mappingSvh = contentSvh + MOBILE_TRACK_POST_BRIEF_SVH
      const legacyChapterSvh = MOBILE_TRACK_STUDIO_HISTORY_SVH + MOBILE_TRACK_SEASON_IMPORT_SVH
      const chapterSvh = legacyChapterSvh + MOBILE_TRACK_IMPORT_COVER_HOLD_SVH
      const totalSvh = mappingSvh + chapterSvh
      const liveTravel = Math.max(1, el.offsetHeight - usable)
      const mappingHeight = el.offsetHeight * (mappingSvh / totalSvh)
      const liveMappingTravel = Math.max(1, mappingHeight - usable)
      const liveContentTravel = Math.max(1, liveMappingTravel * (contentSvh / mappingSvh))
      const livePostBriefTravel = Math.max(1, liveMappingTravel - liveContentTravel)
      const livePostMappingTravel = Math.max(1, liveTravel - liveMappingTravel)
      const liveLegacyChapterTravel = Math.max(
        1,
        livePostMappingTravel * (legacyChapterSvh / chapterSvh),
      )
      const liveCoverHoldTravel = Math.max(1, livePostMappingTravel - liveLegacyChapterTravel)
      const liveStudioTravel = Math.max(
        1,
        liveLegacyChapterTravel * (MOBILE_TRACK_STUDIO_HISTORY_SVH / legacyChapterSvh),
      )
      const liveImportTravel = Math.max(1, liveLegacyChapterTravel - liveStudioTravel)
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
      appProgress.set(app)
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
        scrollDist <= mappingEnd
          ? 0
          : scrollDist >= studioEnd
            ? 1
            : Math.min(1, Math.max(0, (scrollDist - mappingEnd) / studioTravel))
      const seasonImport =
        scrollDist <= studioEnd
          ? 0
          : scrollDist >= importEnd
            ? 1
            : Math.min(1, Math.max(0, (scrollDist - studioEnd) / importTravel))
      postBriefProgress.set(pb)
      studioProgress.set(studio)
      importProgress.set(seasonImport)
      publishMobileStoryProgress(theater)
      publishMobileAppProgress(app)

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
      stickyRef.current?.setAttribute('data-mobile-app-progress', app.toFixed(4))
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

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      unsubDash()
      unsubDay()
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      clearMobileStoryProgress()
    }
  }, [simple, progress, appProgress, postBriefProgress, studioProgress, importProgress])

  useMotionValueEvent(progress, 'change', (p) => {
    const sticky = stickyRef.current
    if (!sticky) return
    sticky.setAttribute('data-mobile-owned', p > OWNED_EPS ? 'true' : 'false')
    sticky.setAttribute(
      'data-mobile-device-settled',
      phoneSettled(p) ? 'true' : 'false',
    )
  })

  const phoneIn = useTransform(progress, (p) => phoneInT(p))

  const headlineLineOpacity = useTransform(progress, (p) => headlineCompositeOpacityAt(p))
  const headlineBlur = useTransform(progress, (p) => {
    const b = Math.max(headlineEnterBlurPxAt(p), headlineExitBlurPxAt(p))
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })
  const enterY = useTransform(progress, (p) => headlineEnterYAt(p))
  const sepOffset = useTransform(progress, (p) => {
    const sep = headlineSepYAt(p)
    return compactRef.current ? sep * HEADLINE_SEP_COMPACT_SCALE : sep
  })
  const line1Y = useTransform([enterY, sepOffset], ([ey, sep]) => Number(ey) - Number(sep))
  const line2Y = useTransform([enterY, sepOffset], ([ey, sep]) => Number(ey) + Number(sep))

  /* ONE transform owner for main scale: .phoneSystem — enter × post-Brief LINEAR shrink × studio lift. */
  const phoneOpacity = useTransform(
    [phoneIn, importProgress],
    ([inn, im]) => Number(inn) * seasonImportLockOpAt(Number(im)),
  )
  const phoneVisibility = useTransform(phoneOpacity, (o) =>
    Number(o) < 0.02 ? ('hidden' as const) : ('visible' as const),
  )
  const phoneScale = useTransform(
    [phoneIn, postBriefProgress, studioProgress, importProgress],
    ([inn, pb, st, im]) =>
      (0.86 + Number(inn) * 0.14) *
      postBriefShrinkScaleAt(Number(pb)) *
      studioLockScaleAt(Number(st)) *
      seasonImportLockScaleAt(Number(im)),
  )
  const phoneY = useTransform([phoneIn, studioProgress, importProgress], ([inn, st, im]) => {
    const enterMax = compactRef.current ? PHONE_ENTER_Y_COMPACT : PHONE_ENTER_Y_DESKTOP
    const enterPx = (1 - Number(inn)) * enterMax
    const studioVh = studioLockYVhAt(Number(st))
    const exitPx = seasonImportLockYAt(Number(im))
    const px = enterPx + exitPx
    if (studioVh === 0) return px
    return `calc(${px}px + ${studioVh}vh)`
  })

  const lockMorph = {
    compress: useTransform(postBriefProgress, (p) => postBriefCompressAt(p)),
    chrome: useTransform(postBriefProgress, (p) => postBriefChromeOpAt(p)),
    brief: useTransform(postBriefProgress, (p) => postBriefContentOpAt(p)),
    screenMerge: useTransform(postBriefProgress, (p) => postBriefScreenMergeAt(p)),
    shackle: useTransform(postBriefProgress, (p) => postBriefShackleAt(p)),
    keyhole: useTransform(postBriefProgress, (p) => postBriefKeyholeAt(p)),
  }

  const securityCopyOp = useTransform(
    [postBriefProgress, studioProgress],
    ([pb, st]) => postBriefSecurityCopyAt(Number(pb)) * studioSecurityCopyOpAt(Number(st)),
  )
  const securityCopyY = useTransform([postBriefProgress, studioProgress], ([pb, st]) => {
    return (1 - postBriefSecurityCopyAt(Number(pb))) * 14 + studioSecurityCopyYAt(Number(st))
  })
  const paperOp = useTransform(postBriefProgress, (p) => {
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
              <MobileOurWedApp appProgress={appProgress} staticMode />
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
      data-mobile-phone-lock-owner="true"
      data-mobile-post-brief-owner="true"
      style={
        {
          '--mobile-track-pre-svh': isCompactViewport
            ? MOBILE_TRACK_PRE_SVH_COMPACT
            : MOBILE_TRACK_PRE_SVH,
          '--mobile-track-dash-svh': MOBILE_TRACK_DASH_SVH_FALLBACK,
          '--mobile-track-post-svh': MOBILE_TRACK_POST_SVH,
          '--mobile-track-post-brief-svh': MOBILE_TRACK_POST_BRIEF_SVH,
          '--mobile-track-studio-history-svh': MOBILE_TRACK_STUDIO_HISTORY_SVH,
          '--mobile-track-season-import-svh': MOBILE_TRACK_SEASON_IMPORT_SVH,
          '--mobile-track-import-cover-hold-svh': MOBILE_TRACK_IMPORT_COVER_HOLD_SVH,
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
              data-studio-lock=""
              style={{ opacity: phoneOpacity, visibility: phoneVisibility, scale: phoneScale, y: phoneY }}
            >
              <HeroPhoneFrame lockMorph={lockMorph}>
                <MobileOurWedApp appProgress={appProgress} />
              </HeroPhoneFrame>
            </motion.div>
          </div>

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

          <StudioHistoryReveal progress={studioProgress} exitProgress={importProgress} />
          <StudioImportReveal progress={importProgress} />
        </div>
      </motion.div>
    </section>
  )
}
