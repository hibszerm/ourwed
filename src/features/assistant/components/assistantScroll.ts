/** Near-bottom threshold for stick-to-bottom auto-scroll (px). */
export const ASSISTANT_SCROLL_STICK_THRESHOLD_PX = 48

/** Distance from the bottom edge of a scroll container (px). */
export function distanceFromBottom(
  el: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

/** True when the scroll container is at / near its bottom edge. */
export function isScrollNearBottom(
  el: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
  thresholdPx = ASSISTANT_SCROLL_STICK_THRESHOLD_PX,
): boolean {
  return distanceFromBottom(el) <= thresholdPx
}

export function scrollElementToBottom(el: HTMLElement): void {
  el.scrollTop = el.scrollHeight
}

/**
 * Phase 2K.8 — on transcript viewport height change (e.g. keyboard),
 * keep bottom only when the user was following latest.
 * Instant scrollTop write — no animated scroll, no scrollIntoView.
 * Returns true when a bottom correction was applied.
 */
export function applyTranscriptBottomFollowOnHeightChange(
  el: HTMLElement,
  followingLatest: boolean,
): boolean {
  if (!followingLatest) return false
  scrollElementToBottom(el)
  return true
}
