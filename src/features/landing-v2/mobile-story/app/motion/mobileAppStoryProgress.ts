/**
 * Mobile Story — in-phone app scrub (0→1 after phone settled).
 * Theater (Features→phone settle) stays on the pre-track; app progress owns Dashboard scroll + later beats.
 *
 * Motion grammars:
 * - Phone entrance: eased (theater)
 * - Dashboard / Wedding Day / Brief content Y: LINEAR with outer scroll (~1:1)
 * - Screen handoff / nav opacity: soft / linear as noted
 * - Route marker: LINEAR along path (scrubbed)
 *
 * Phase 6G — Navigation arrival → direct Brief (no Wedding Day return):
 *   full Wedding Day scroll → short end hold → nav enter → rest → route travel
 *   → arrival hold → Brief crossfade → Brief rest → Brief document scroll
 */

import {
  easeInOutCubic,
  easeOutCubic,
  keyframeLerp,
  rangeT,
} from '@/features/landing-v2/mobile-story/mobileStoryProgress'

/** svh allocated to Features→phone settle (preserves approved physical scroll). */
export const MOBILE_TRACK_PRE_SVH = 260
/** Compact Features→headline→split→phone runway — same beats, shorter track. */
export const MOBILE_TRACK_PRE_SVH_COMPACT = 200
/** Baseline svh for post-dashboard app story before first day measure. */
export const MOBILE_TRACK_POST_SVH = 220
/**
 * Default dash scroll budget in svh before first geometry measure.
 * Overridden via --mobile-track-dash-svh from measured maxScroll.
 */
export const MOBILE_TRACK_DASH_SVH_FALLBACK = 120
export const MOBILE_TRACK_APP_SVH = MOBILE_TRACK_DASH_SVH_FALLBACK + MOBILE_TRACK_POST_SVH
export const MOBILE_TRACK_TOTAL_SVH = MOBILE_TRACK_PRE_SVH + MOBILE_TRACK_APP_SVH

/** ~1px outer document scroll ≈ 1px Dashboard content (physical ratio target). */
export const DASH_OUTER_TO_INNER_RATIO = 1
/** Same physical feel as Dashboard for Wedding Day content. */
export const DAY_OUTER_TO_INNER_RATIO = 1
/** Same physical feel for Brief document scroll. */
export const BRIEF_OUTER_TO_INNER_RATIO = 1

/** Theater progress at which the phone is settled (unchanged from MOBILE_RANGES.phoneHold.start). */
export const THEATER_PHONE_SETTLED = 0.74

/**
 * @deprecated Phase 6F.3 — Wedding Day scrolls fully before Navigation.
 * Kept for residual references; no longer drives a partial pre-nav budget.
 */
export const DAY_RETURN_FRACTION = 1

/** Physical outer budgets for Navigation chapter (px). */
export const DAY_END_HOLD_OUTER_PX = 50
export const NAV_ENTER_OUTER_PX = 140
export const NAV_REST_OUTER_PX = 50
export const NAV_TRAVEL_OUTER_PX = 650
/** Short “we arrived” hold after route completes — Phase 6G. */
export const NAV_ARRIVAL_OUTER_PX = 70
/**
 * @deprecated Phase 6G — no nav→Wedding Day exit.
 * Alias of NAV_ARRIVAL_OUTER_PX for residual callers.
 */
export const NAV_EXIT_OUTER_PX = NAV_ARRIVAL_OUTER_PX
/** Nav → Brief crossfade physical budget — FROZEN from Phase 6G. */
export const BRIEF_ENTER_OUTER_PX = 180
/**
 * @deprecated Phase 6H — no Brief-internal scroll rest.
 * Zero contribution; kept for residual callers.
 */
export const BRIEF_REST_OUTER_PX = 0
/**
 * Settled one-page Brief inspection hold (no document scroll).
 * Small "breath" beat only — user gets a moment to see the completed Brief,
 * then the next scroll gesture immediately starts the phone→lock morph.
 * Reduced from 240 → 4px: near-instant morph after Brief settles.
 */
export const BRIEF_SETTLE_OUTER_PX = 4
/**
 * @deprecated Phase 6H — merged into BRIEF_SETTLE_OUTER_PX.
 */
export const BRIEF_END_HOLD_OUTER_PX = BRIEF_SETTLE_OUTER_PX
/** Sum of enter+rest+travel+arrival — kept for diagnostics. */
export const NAV_STORY_OUTER_PX =
  NAV_ENTER_OUTER_PX + NAV_REST_OUTER_PX + NAV_TRAVEL_OUTER_PX + NAV_ARRIVAL_OUTER_PX
/**
 * @deprecated Phase 6H — use BRIEF_ENTER + BRIEF_SETTLE.
 */
export const BRIEF_HOLD_OUTER_PX = BRIEF_ENTER_OUTER_PX + BRIEF_SETTLE_OUTER_PX

/**
 * App-story ranges on local 0→1 (after phone settled).
 * Dashboard scroll ranges are FROZEN from Phase 6D (0 → handoff.end).
 * Day → Nav ranges frozen from Phase 6F.3 through routeTravel.
 * Nav → Brief enter FROZEN from Phase 6G.
 *
 * Phase 6H: after Brief enter, settle hold only — NO Brief-internal scroll.
 * NO Wedding Day return after Navigation.
 */
export const MOBILE_APP_RANGES = {
  /** Brief hold at Dashboard top after settle — no Y motion. */
  dashBreath: { start: 0.0, end: 0.03 },
  /** LINEAR content scroll 0 → maxScroll. */
  dashScroll: { start: 0.03, end: 0.52 },
  /** Short hold at natural content bottom. */
  dashEndHold: { start: 0.52, end: 0.56 },
  /** Overlapping Dashboard ↔ Wedding Day ownership (no blank frame). */
  handoff: { start: 0.56, end: 0.66 },
  /** Wedding Day visible at Y=0 — tiny settle only. */
  dayHold: { start: 0.66, end: 0.665 },
  /** LINEAR Wedding Day scroll 0 → full maxScroll. */
  dayScroll: { start: 0.665, end: 0.78 },
  /** Alias — historical name; same as dayScroll (full pre-nav day scroll). */
  dayScrollPre: { start: 0.665, end: 0.78 },
  /** Tiny breath at Wedding Day bottom before Navigation. */
  dayEndHold: { start: 0.78, end: 0.788 },
  /** Tiny Nawiguj press cue — overlaps mapIn. */
  nawigujPress: { start: 0.788, end: 0.792 },
  /** Fast Day↔Nav crossfade — map visible with Navigation. */
  mapIn: { start: 0.788, end: 0.805 },
  /** Readable map at rest; travelProgress stays 0. */
  navRest: { start: 0.805, end: 0.812 },
  /** LINEAR route scrub. */
  routeTravel: { start: 0.812, end: 0.92 },
  /** Completed navigation — marker at dest; map stable. */
  arriveHold: { start: 0.92, end: 0.932 },
  /** Nav → Brief overlapping crossfade — FROZEN Phase 6G. */
  briefEnter: { start: 0.932, end: 0.958 },
  /**
   * @deprecated Phase 6G — map no longer returns to Wedding Day.
   * Alias of briefEnter so residual mapOut references fade nav under Brief.
   */
  mapOut: { start: 0.932, end: 0.958 },
  /**
   * @deprecated Phase 6H — no pre-scroll breath; Brief is one-page.
   * Zero-length alias at Brief settle start.
   */
  briefRest: { start: 0.958, end: 0.958 },
  /**
   * @deprecated Phase 6H — no Brief-internal document scroll.
   * Zero-length alias; briefScrollYAt always returns 0.
   */
  briefScroll: { start: 0.958, end: 0.958 },
  /** Alias — historical briefOpen maps to briefEnter window. */
  briefOpen: { start: 0.932, end: 0.958 },
  /** Settled one-page Brief inspection hold. */
  briefHold: { start: 0.958, end: 1.0 },
  /**
   * @deprecated Phase 6G — no post-nav day scroll / day return.
   * Zero-length alias so callers that reference it stay safe.
   */
  dayScrollPost: { start: 0.958, end: 0.958 },
} as const

/** Handoff opacity S-curve samples (for tests / QA). */
export const HANDOFF_OPACITY_SAMPLES = [
  { t: 0, dash: 1, day: 0 },
  { t: 0.25, dash: 0.82, day: 0.18 },
  { t: 0.5, dash: 0.5, day: 0.55 },
  { t: 0.75, dash: 0.18, day: 0.88 },
  { t: 1, dash: 0, day: 1 },
] as const

/** Nav → Brief coverage samples (Phase 6G). */
export const NAV_BRIEF_OPACITY_SAMPLES = [
  { t: 0, nav: 1, brief: 0 },
  { t: 0.2, nav: 0.88, brief: 0.16 },
  { t: 0.4, nav: 0.67, brief: 0.4 },
  { t: 0.6, nav: 0.4, brief: 0.68 },
  { t: 0.8, nav: 0.14, brief: 0.92 },
  { t: 1, nav: 0, brief: 1 },
] as const

/** Linear 0→1 across the handoff window (before S-curve). */
export function handoffLinearT(app: number): number {
  return rangeT(app, MOBILE_APP_RANGES.handoff.start, MOBILE_APP_RANGES.handoff.end)
}

/** S-curved handoff progress — opacity / micro-translate only. */
export function handoffT(app: number): number {
  return easeInOutCubic(handoffLinearT(app))
}

/**
 * Dashboard translateY — LINEAR in dashScroll progress (no easeOut).
 * Page scroll already supplies physical feel.
 */
export function dashScrollYAt(app: number, maxScroll = 0): number {
  const max = Math.max(0, maxScroll)
  const t = rangeT(app, MOBILE_APP_RANGES.dashScroll.start, MOBILE_APP_RANGES.dashScroll.end)
  return -t * max
}

const HANDOFF_DASH_OPACITY: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.25, 0.82],
  [0.5, 0.5],
  [0.75, 0.18],
  [1, 0],
]

const HANDOFF_DAY_OPACITY: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.25, 0.18],
  [0.5, 0.55],
  [0.75, 0.88],
  [1, 1],
]

const NAV_BRIEF_NAV_OPACITY: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.2, 0.88],
  [0.4, 0.67],
  [0.6, 0.4],
  [0.8, 0.14],
  [1, 0],
]

const NAV_BRIEF_BRIEF_OPACITY: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.2, 0.16],
  [0.4, 0.4],
  [0.6, 0.68],
  [0.8, 0.92],
  [1, 1],
]

/**
 * Dashboard screen opacity.
 * Fully visible from phone entrance (app=0) through Dashboard scroll;
 * fades only during overlapping handoff (S-curve samples).
 */
export function dashOpacityAt(app: number): number {
  return keyframeLerp(handoffLinearT(app), HANDOFF_DASH_OPACITY)
}

/** @deprecated card focus morph removed — handoff replaces open. */
export function cardFocusAt(_app?: number): number {
  void _app
  return 0
}

/** Alias for title / compact-bar visibility — rises through handoff. */
export function weddingOpenAt(app: number): number {
  return handoffLinearT(app)
}

/**
 * Wedding Day opacity — rises in the SAME handoff window as Dashboard fades.
 * Fades under Navigation enter; NEVER returns after Navigation (Phase 6G).
 */
export function dayOpacityAt(app: number): number {
  const enter = keyframeLerp(handoffLinearT(app), HANDOFF_DAY_OPACITY)
  if (app >= MOBILE_APP_RANGES.mapIn.end) return 0
  if (app >= MOBILE_APP_RANGES.mapIn.start) {
    const inn = rangeT(app, MOBILE_APP_RANGES.mapIn.start, MOBILE_APP_RANGES.mapIn.end)
    return enter * (1 - inn)
  }
  return enter
}

/** Tiny upward drift as Dashboard yields. */
export function dashHandoffYAt(app: number): number {
  return handoffT(app) * -8
}

/** Tiny rise as Wedding Day arrives (handoff only; 0 after settle). */
export function dayHandoffYAt(app: number): number {
  if (app >= MOBILE_APP_RANGES.dayHold.start) return 0
  return (1 - handoffT(app)) * 14
}

/** @deprecated Use full day maxScroll; retained for legacy callers. */
export function dayReturnScrollPx(maxScroll: number): number {
  return Math.max(0, maxScroll)
}

/**
 * Wedding Day translateY — LINEAR 0 → -maxScroll during dayScroll,
 * then held at -max (day stays under nav/brief; not shown again).
 */
export function dayScrollYAt(app: number, maxScroll = 0): number {
  const max = Math.max(0, maxScroll)
  const r = MOBILE_APP_RANGES

  if (app < r.dayScroll.start) return 0
  if (app < r.dayScroll.end) {
    const t = rangeT(app, r.dayScroll.start, r.dayScroll.end)
    return -t * max
  }
  return -max
}

export function nawigujPressAt(app: number): number {
  return easeOutCubic(rangeT(app, MOBILE_APP_RANGES.nawigujPress.start, MOBILE_APP_RANGES.nawigujPress.end))
}

function briefEnterLinearT(app: number): number {
  return rangeT(app, MOBILE_APP_RANGES.briefEnter.start, MOBILE_APP_RANGES.briefEnter.end)
}

/**
 * Navigation layer opacity.
 * Enter: LINEAR across mapIn.
 * Hold through arriveHold.
 * Exit: keyframed across briefEnter (direct to Brief — no day return).
 */
export function mapLayerOpacityAt(app: number): number {
  const inn = rangeT(app, MOBILE_APP_RANGES.mapIn.start, MOBILE_APP_RANGES.mapIn.end)
  if (app < MOBILE_APP_RANGES.briefEnter.start) return inn
  return inn * keyframeLerp(briefEnterLinearT(app), NAV_BRIEF_NAV_OPACITY)
}

/** Nav micro-exit Y during Brief handoff (0 → -8). */
export function navExitYAt(app: number): number {
  return briefEnterLinearT(app) * -8
}

/**
 * Canonical navigation travel progress — LINEAR 0→1 across routeTravel.
 * Remains 0 through mapIn + navRest; stays 1 through arrival / Brief.
 */
export function travelProgressAt(app: number): number {
  return rangeT(app, MOBILE_APP_RANGES.routeTravel.start, MOBILE_APP_RANGES.routeTravel.end)
}

/** Alias — prefer travelProgressAt for new call sites. */
export function routeProgressAt(app: number): number {
  return travelProgressAt(app)
}

/** Path fraction for marker + dark travelled stroke (identical). */
export const NAV_PATH_END = 1

export function travelPathProgressAt(app: number): number {
  return travelProgressAt(app) * NAV_PATH_END
}

/** App progress where Navigation/map is considered clearly readable (op ≥ 0.9). */
export function navMapReadableAppProgress(): number {
  const { start, end } = MOBILE_APP_RANGES.mapIn
  return start + 0.9 * (end - start)
}

/** Brief layer opacity — keyframed with Navigation exit (coverage ≥ 0.95). */
export function briefOpenAt(app: number): number {
  return keyframeLerp(briefEnterLinearT(app), NAV_BRIEF_BRIEF_OPACITY)
}

/** Brief enter micro-Y (+10 → 0). */
export function briefEnterYAt(app: number): number {
  return (1 - briefEnterLinearT(app)) * 10
}

/** Optional paper scale polish (0.985 → 1). */
export function briefPaperScaleAt(app: number): number {
  return 0.985 + briefEnterLinearT(app) * 0.015
}

/** Brief document translateY — always 0 (Phase 6H: one-page, no internal scroll). */
export function briefScrollYAt(_app?: number, _maxScroll = 0): number {
  void _app
  void _maxScroll
  return 0
}

export function appScreenAt(app: number): 'dashboard' | 'wedding-day' | 'map' | 'brief' {
  if (briefOpenAt(app) > 0.5) return 'brief'
  if (mapLayerOpacityAt(app) > 0.5) return 'map'
  if (handoffLinearT(app) >= 0.5) return 'wedding-day'
  return 'dashboard'
}

/**
 * Fraction of the dash-phase app range (0 → handoff.end) spent on LINEAR content scroll.
 * Used so outer dash-phase distance yields ~1:1 with maxScroll during dashScroll only.
 */
export function dashScrollShareOfDashPhase(): number {
  const phase = MOBILE_APP_RANGES.handoff.end
  const scroll = MOBILE_APP_RANGES.dashScroll.end - MOBILE_APP_RANGES.dashScroll.start
  return phase > 0 ? scroll / phase : 0.74
}

/** Outer px for app 0 → handoff.end so dashScroll itself is ~1:1 with maxScroll. */
export function dashPhaseOuterPxFromMaxScroll(maxScroll: number): number {
  const share = Math.max(0.35, dashScrollShareOfDashPhase())
  return Math.max(0, maxScroll) / Math.max(0.5, DASH_OUTER_TO_INNER_RATIO) / share
}

/** Convert measured Dashboard max scroll → svh budget for ~1:1 outer:inner. */
export function dashTrackSvhFromMaxScroll(maxScroll: number, viewportHeightPx: number): number {
  const vh = Math.max(320, viewportHeightPx)
  const outerPx = dashPhaseOuterPxFromMaxScroll(maxScroll)
  const svh = (outerPx / vh) * 100
  return Math.min(280, Math.max(100, Math.round(svh)))
}

/** Full Wedding Day outer scroll (~1:1 with measured maxScroll). */
export function dayScrollOuterPxFromMaxScroll(maxScroll: number): number {
  return Math.max(0, maxScroll) / Math.max(0.5, DAY_OUTER_TO_INNER_RATIO)
}

/** Full Brief document outer scroll — always 0 in Phase 6H (one-page Brief). */
export function briefScrollOuterPxFromMaxScroll(_maxScroll: number): number {
  void _maxScroll
  return 0
}

/** @deprecated Use dayScrollOuterPxFromMaxScroll. */
export function dayPreOuterPxFromMaxScroll(maxScroll: number): number {
  return dayScrollOuterPxFromMaxScroll(maxScroll)
}

/** @deprecated No post-nav day scroll (6F.3 / 6G). */
export function dayPostOuterPxFromMaxScroll(_maxScroll: number): number {
  void _maxScroll
  return 0
}

/** Post-story outer distance (full day + nav + brief enter + settle). */
export function postPhaseOuterPxFromDayMaxScroll(dayMax: number, _briefMax = 0): number {
  void _briefMax
  const b = postPhaseBudgetsFromDayMax(dayMax)
  return (
    b.dayScrollOuter +
    b.dayEndHoldOuter +
    b.navEnterOuter +
    b.navRestOuter +
    b.navTravelOuter +
    b.navArrivalOuter +
    b.briefEnterOuter +
    b.briefSettleOuter
  )
}

export function postTrackSvhFromDayMaxScroll(
  dayMax: number,
  viewportHeightPx: number,
  _briefMax = 0,
): number {
  void _briefMax
  const vh = Math.max(320, viewportHeightPx)
  const outerPx = postPhaseOuterPxFromDayMaxScroll(dayMax)
  const svh = (outerPx / vh) * 100
  return Math.min(560, Math.max(80, Math.round(svh)))
}

export function totalTrackSvh(
  dashSvh: number,
  postSvh = MOBILE_TRACK_POST_SVH,
): number {
  return MOBILE_TRACK_PRE_SVH + dashSvh + postSvh
}

export type PostPhaseBudgets = {
  dayScrollOuter: number
  dayEndHoldOuter: number
  navEnterOuter: number
  navRestOuter: number
  navTravelOuter: number
  navArrivalOuter: number
  briefEnterOuter: number
  briefSettleOuter: number
  /** @deprecated Phase 6H always 0 */
  briefRestOuter: number
  /** @deprecated Phase 6H always 0 */
  briefScrollOuter: number
  /** @deprecated alias of briefSettleOuter */
  briefEndHoldOuter: number
  /** @deprecated alias of navArrivalOuter */
  navExitOuter: number
  /** @deprecated sum of brief enter + settle */
  briefOuter: number
  /** @deprecated alias of dayScrollOuter */
  dayPreOuter: number
  /** @deprecated always 0 */
  dayPostOuter: number
  /** Sum of nav enter+rest+travel+arrival */
  navOuter: number
}

export function postPhaseBudgetsFromDayMax(dayMax: number, _briefMax = 0): PostPhaseBudgets {
  void _briefMax
  const dayScrollOuter = Math.max(1, dayScrollOuterPxFromMaxScroll(dayMax))
  const navOuter =
    NAV_ENTER_OUTER_PX + NAV_REST_OUTER_PX + NAV_TRAVEL_OUTER_PX + NAV_ARRIVAL_OUTER_PX
  return {
    dayScrollOuter,
    dayEndHoldOuter: DAY_END_HOLD_OUTER_PX,
    navEnterOuter: NAV_ENTER_OUTER_PX,
    navRestOuter: NAV_REST_OUTER_PX,
    navTravelOuter: NAV_TRAVEL_OUTER_PX,
    navArrivalOuter: NAV_ARRIVAL_OUTER_PX,
    briefEnterOuter: BRIEF_ENTER_OUTER_PX,
    briefSettleOuter: BRIEF_SETTLE_OUTER_PX,
    briefRestOuter: 0,
    briefScrollOuter: 0,
    briefEndHoldOuter: BRIEF_SETTLE_OUTER_PX,
    navExitOuter: NAV_ARRIVAL_OUTER_PX,
    briefOuter: BRIEF_ENTER_OUTER_PX + BRIEF_SETTLE_OUTER_PX,
    dayPreOuter: dayScrollOuter,
    dayPostOuter: 0,
    navOuter,
  }
}

/** Dev diagnostic — physical + normalized boundaries (no UI). */
export function mobileNavPacingDiagnostics(dayMax: number, _briefMax = 0) {
  void _briefMax
  const b = postPhaseBudgetsFromDayMax(dayMax)
  const r = MOBILE_APP_RANGES
  return {
    dayMaxScrollPx: Math.max(0, dayMax),
    briefMaxScrollPx: 0,
    dayScrollBudgetPx: b.dayScrollOuter,
    dayEndHoldPx: b.dayEndHoldOuter,
    navEnterPx: b.navEnterOuter,
    navRestPx: b.navRestOuter,
    navTravelPx: b.navTravelOuter,
    navArrivalPx: b.navArrivalOuter,
    briefEnterPx: b.briefEnterOuter,
    briefSettlePx: b.briefSettleOuter,
    briefScrollPx: 0,
    appTrackPx: postPhaseOuterPxFromDayMaxScroll(dayMax),
    DAY_SCROLL_START: r.dayScroll.start,
    DAY_SCROLL_END: r.dayScroll.end,
    DAY_HOLD_END: r.dayEndHold.end,
    NAV_ENTER_START: r.mapIn.start,
    NAV_ENTER_END: r.mapIn.end,
    NAV_REST_END: r.navRest.end,
    NAV_TRAVEL_START: r.routeTravel.start,
    NAV_TRAVEL_END: r.routeTravel.end,
    NAV_ARRIVAL_END: r.arriveHold.end,
    BRIEF_ENTER_START: r.briefEnter.start,
    BRIEF_ENTER_END: r.briefEnter.end,
    BRIEF_HOLD_START: r.briefHold.start,
    BRIEF_HOLD_END: r.briefHold.end,
  }
}

function lerpApp(a: number, b: number, t: number): number {
  return a + Math.min(1, Math.max(0, t)) * (b - a)
}

/**
 * Split master scroll into theater (Features→phone) and app scrub.
 * After phone settle:
 *   dashPhase → app 0 → handoff.end
 *   dayScroll → full maxScroll (~1:1)
 *   dayEndHold → short breath at bottom
 *   navEnter → mapIn
 *   navRest → map established, travel=0
 *   navTravel → routeTravel
 *   navArrival → arriveHold
 *   briefEnter → Brief crossfade (FROZEN 6G)
 *   briefSettle → one-page Brief inspection hold (6H — no document scroll)
 *
 * NO Wedding Day return after Navigation (Phase 6G).
 * NO Brief-internal scroll (Phase 6H).
 * NO leftover holdPad before day scroll.
 */
export function splitMobileMasterProgress(
  scrollDist: number,
  _totalTravel: number,
  preTravel: number,
  dashPhaseOuterPx = dashPhaseOuterPxFromMaxScroll(0),
  postBudgets: PostPhaseBudgets = postPhaseBudgetsFromDayMax(0),
): { theater: number; app: number } {
  void _totalTravel
  const pre = Math.max(1, preTravel)
  const settleDist = pre * THEATER_PHONE_SETTLED
  const theater = Math.min(1, Math.max(0, scrollDist / pre))
  if (scrollDist <= settleDist) {
    return { theater, app: 0 }
  }

  const afterSettle = scrollDist - settleDist
  const dashSpan = Math.max(1, dashPhaseOuterPx)
  const appAtDashEnd = MOBILE_APP_RANGES.handoff.end

  if (afterSettle <= dashSpan) {
    return { theater, app: (afterSettle / dashSpan) * appAtDashEnd }
  }

  let rem = afterSettle - dashSpan
  const r = MOBILE_APP_RANGES
  const {
    dayScrollOuter,
    dayEndHoldOuter,
    navEnterOuter,
    navRestOuter,
    navTravelOuter,
    navArrivalOuter,
    briefEnterOuter,
    briefSettleOuter,
  } = postBudgets

  const dayTopSettle = 8
  if (rem <= dayTopSettle) {
    return { theater, app: lerpApp(r.dayHold.start, r.dayHold.end, rem / dayTopSettle) }
  }
  rem -= dayTopSettle

  if (rem <= dayScrollOuter) {
    return {
      theater,
      app: lerpApp(r.dayScroll.start, r.dayScroll.end, rem / Math.max(1, dayScrollOuter)),
    }
  }
  rem -= dayScrollOuter

  if (rem <= dayEndHoldOuter) {
    return {
      theater,
      app: lerpApp(r.dayEndHold.start, r.dayEndHold.end, rem / Math.max(1, dayEndHoldOuter)),
    }
  }
  rem -= dayEndHoldOuter

  if (rem <= navEnterOuter) {
    return {
      theater,
      app: lerpApp(r.mapIn.start, r.mapIn.end, rem / Math.max(1, navEnterOuter)),
    }
  }
  rem -= navEnterOuter

  if (rem <= navRestOuter) {
    return {
      theater,
      app: lerpApp(r.navRest.start, r.navRest.end, rem / Math.max(1, navRestOuter)),
    }
  }
  rem -= navRestOuter

  if (rem <= navTravelOuter) {
    return {
      theater,
      app: lerpApp(r.routeTravel.start, r.routeTravel.end, rem / Math.max(1, navTravelOuter)),
    }
  }
  rem -= navTravelOuter

  if (rem <= navArrivalOuter) {
    return {
      theater,
      app: lerpApp(r.arriveHold.start, r.arriveHold.end, rem / Math.max(1, navArrivalOuter)),
    }
  }
  rem -= navArrivalOuter

  if (rem <= briefEnterOuter) {
    return {
      theater,
      app: lerpApp(r.briefEnter.start, r.briefEnter.end, rem / Math.max(1, briefEnterOuter)),
    }
  }
  rem -= briefEnterOuter

  const settleSpan = Math.max(1, briefSettleOuter)
  return {
    theater,
    app: lerpApp(r.briefHold.start, 1, rem / settleSpan),
  }
}

export function preTrackFraction(dashSvh = MOBILE_TRACK_DASH_SVH_FALLBACK): number {
  return MOBILE_TRACK_PRE_SVH / totalTrackSvh(dashSvh)
}

/** Debug helper for tests. */
export function appKeyframeSample(app: number, maxScroll = 0, dayMax = 0, briefMax = 0) {
  return {
    dashY: dashScrollYAt(app, maxScroll),
    dashOp: dashOpacityAt(app),
    dayY: dayScrollYAt(app, dayMax),
    dayOp: dayOpacityAt(app),
    mapOp: mapLayerOpacityAt(app),
    route: routeProgressAt(app),
    brief: briefOpenAt(app),
    briefY: briefScrollYAt(app, briefMax),
    screen: appScreenAt(app),
    handoff: handoffT(app),
  }
}

export { keyframeLerp, rangeT, easeOutCubic, easeInOutCubic }
