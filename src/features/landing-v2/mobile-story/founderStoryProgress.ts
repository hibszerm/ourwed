/**
 * Import sticky hold + single normal-flow Founder cover.
 *
 * After Season Import reaches its final state, a one-viewport hold keeps Import
 * stationary while the ONE Founder section (normal document flow, higher z-index,
 * margin-top: -100svh) scrolls over it 1:1.
 *
 * Desktop: hold lives on the Mobile Story sticky track.
 * Compact: hold lives on LandingV2SeasonImportStory coverTrack + holdRunway.
 *
 * No Founder translateY cover. No dual paint owners.
 */

/** Sticky hold after Import final ≈ one viewport of cover runway (svh). */
export const MOBILE_TRACK_IMPORT_COVER_HOLD_SVH = 100

/**
 * Compact final-frame beige gap below Import cards before Founder cover (px).
 * Responsive: ~48@375 → ~56@402 → ~60–64@430.
 */
export const SEASON_IMPORT_COVER_BOTTOM_GAP_MIN_PX = 48
export const SEASON_IMPORT_COVER_BOTTOM_GAP_MAX_PX = 64

/**
 * Beige breathing room under the pinned Import frame (compact only).
 * stickyTop = viewportHeight - gap - frameHeight
 */
export function seasonImportCoverBottomGapPx(viewportWidth: number): number {
  const t = (viewportWidth - 375) / (430 - 375)
  const gap = SEASON_IMPORT_COVER_BOTTOM_GAP_MIN_PX + t * 16
  return Math.round(
    Math.min(SEASON_IMPORT_COVER_BOTTOM_GAP_MAX_PX, Math.max(SEASON_IMPORT_COVER_BOTTOM_GAP_MIN_PX, gap)),
  )
}

/**
 * @deprecated Use MOBILE_TRACK_IMPORT_COVER_HOLD_SVH.
 * Kept as alias so older travel-math call sites keep compiling during migration.
 */
export const MOBILE_TRACK_FOUNDER_SVH = MOBILE_TRACK_IMPORT_COVER_HOLD_SVH

/** @deprecated No post-cover story budget — always 0. */
export const MOBILE_TRACK_FOUNDER_STORY_SVH = 0

/** @deprecated Alias of cover-hold runway. */
export const MOBILE_TRACK_FOUNDER_COVER_SVH = MOBILE_TRACK_IMPORT_COVER_HOLD_SVH
