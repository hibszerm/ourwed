/**
 * Iteration 3D — compact Problem/Product scroll architecture classification.
 *
 * BEFORE (990177f) classification:
 * A NORMAL DOCUMENT FLOW — black sticky unpin; Product sticky unpin exit
 * B NATIVE CSS SCROLL-DRIVEN — none for narrative copy
 * C JS REQUIRED — narrative statementVisualAtScroll → DOM each rAF;
 *     scene07HandoffMv publish; Product exit data-attrs; theater gate
 * D TIME-DRIVEN — FlattenedProductAutoplay (1750/420)
 * E STATIC — Hero flatten; tablet chrome; transparent Product stage
 *
 * AFTER:
 * A NORMAL DOCUMENT FLOW — black exit; Product exit (unchanged)
 * B NATIVE CSS SCROLL-DRIVEN — statement transform/opacity via scroll()
 * C JS REQUIRED — layout/resize geometry + CSS range setup only;
 *     hysteretic IntersectionObserver for autoplay (not pixel motion)
 * D TIME-DRIVEN — FlattenedProductAutoplay (unchanged timing)
 * E STATIC — tablet silhouette wrappers transparent
 */

export const COMPACT_SCROLL_ARCH_ITERATION = '3D'

export const COMPACT_STICKY_COUNT_BEFORE = 2
/** Narrative sticky + Product sticky (Lifecycle excluded — after Product). */
export const COMPACT_STICKY_COUNT_AFTER = 2

export const COMPACT_SCROLL_LISTENERS_BEFORE = 2
/** Narrative CSS path: 0. Product: 0. (resize/IO only) */
export const COMPACT_SCROLL_LISTENERS_AFTER = 0

export const COMPACT_RAF_SCROLL_LOOPS_BEFORE = 2
export const COMPACT_RAF_SCROLL_LOOPS_AFTER = 0

export const COMPACT_MOTIONVALUES_VISIBLE_MOTION_BEFORE = 1
/** scene07HandoffMv was autoplay-only after 3C.3; narrative used direct DOM. */
export const COMPACT_MOTIONVALUES_VISIBLE_MOTION_AFTER = 0

export const COMPACT_PER_SCROLL_REACT_SETTERS_BEFORE =
  'autoplay gate on handoff Mv + optional IO'
export const COMPACT_PER_SCROLL_REACT_SETTERS_AFTER =
  'none for pixel motion; hysteretic IO only for autoplay'

export const COMPACT_MAX_PRODUCT_BITMAP_LAYERS = 2
