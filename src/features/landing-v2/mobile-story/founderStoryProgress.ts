/**
 * Import sticky hold + single normal-flow Founder cover.
 *
 * After Season Import reaches its final state, a one-viewport hold keeps Import
 * stationary while the ONE Founder section (normal document flow, higher z-index,
 * margin-top: -100svh) scrolls over it 1:1.
 *
 * Desktop: hold lives on the Mobile Story sticky track.
 * Compact: hold lives on LandingV2SeasonImportStory coverTrack padding-bottom.
 *
 * No Founder translateY cover. No dual paint owners.
 */

/** Sticky hold after Import final ≈ one viewport of cover runway (svh). */
export const MOBILE_TRACK_IMPORT_COVER_HOLD_SVH = 100

/**
 * @deprecated Use MOBILE_TRACK_IMPORT_COVER_HOLD_SVH.
 * Kept as alias so older travel-math call sites keep compiling during migration.
 */
export const MOBILE_TRACK_FOUNDER_SVH = MOBILE_TRACK_IMPORT_COVER_HOLD_SVH

/** @deprecated No post-cover story budget — always 0. */
export const MOBILE_TRACK_FOUNDER_STORY_SVH = 0

/** @deprecated Alias of cover-hold runway. */
export const MOBILE_TRACK_FOUNDER_COVER_SVH = MOBILE_TRACK_IMPORT_COVER_HOLD_SVH
