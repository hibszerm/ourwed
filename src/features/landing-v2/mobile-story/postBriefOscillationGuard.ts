/**
 * DEV/runtime helpers for phone→lock oscillation diagnosis.
 * Detects forward-scroll regressions in morph-critical values.
 */

export type MorphSample = {
  postBrief: number
  aspect: number
  screen: number
  shackle: number
  classification: 'PHONE' | 'PHONE_LOCK' | 'LOCK'
}

export function classifyMorph(aspect: number, screen: number, shackle: number): MorphSample['classification'] {
  const phoneAspect = 430 / 932
  const lockAspect = 0.78
  const towardLock = (phoneAspect - aspect) / (phoneAspect - lockAspect)
  if (towardLock < 0.12 && screen > 0.85 && shackle < 0.08) return 'PHONE'
  if (towardLock > 0.72 && screen < 0.2 && shackle > 0.55) return 'LOCK'
  return 'PHONE_LOCK'
}

/**
 * Forward-only monotonicity: once a value has moved toward lock, it must not
 * regress toward phone beyond tolerance while postBrief is non-decreasing.
 *
 * Body aspect: PHONE_ASPECT_RATIO (≈0.46) → LOCK_ASPECT_RATIO (≈1.27) — increases.
 * Screen opacity: decreases. Shackle opacity: increases.
 */
export type OscillationHit = {
  index: number
  field: 'aspect' | 'screen' | 'shackle' | 'classification'
  prev: number | string
  next: number | string
}

const CLASS_RANK: Record<MorphSample['classification'], number> = {
  PHONE: 0,
  PHONE_LOCK: 1,
  LOCK: 2,
}

export function findForwardMorphOscillations(
  samples: MorphSample[],
  opts: { aspectEps?: number; opacityEps?: number } = {},
): OscillationHit[] {
  const aspectEps = opts.aspectEps ?? 0.008
  const opacityEps = opts.opacityEps ?? 0.02
  const hits: OscillationHit[] = []
  if (samples.length < 2) return hits

  let maxAspect = samples[0].aspect /* lock-ward = larger aspect */
  let minScreen = samples[0].screen
  let maxShackle = samples[0].shackle
  let maxClass = CLASS_RANK[samples[0].classification]
  const phoneAspect = 430 / 932

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]
    const prev = samples[i - 1]
    if (s.postBrief + 1e-9 < prev.postBrief) continue /* reverse scroll — skip */

    /* Aspect must not shrink back toward phone once compressing toward lock. */
    if (s.aspect < maxAspect - aspectEps && maxAspect > phoneAspect + 0.02) {
      hits.push({ index: i, field: 'aspect', prev: maxAspect, next: s.aspect })
    }
    maxAspect = Math.max(maxAspect, s.aspect)

    if (s.screen > minScreen + opacityEps && minScreen < 0.98) {
      hits.push({ index: i, field: 'screen', prev: minScreen, next: s.screen })
    }
    minScreen = Math.min(minScreen, s.screen)

    if (s.shackle < maxShackle - opacityEps && maxShackle > 0.05) {
      hits.push({ index: i, field: 'shackle', prev: maxShackle, next: s.shackle })
    }
    maxShackle = Math.max(maxShackle, s.shackle)

    const rank = CLASS_RANK[s.classification]
    if (rank < maxClass) {
      hits.push({
        index: i,
        field: 'classification',
        prev: samples[i - 1].classification,
        next: s.classification,
      })
    }
    maxClass = Math.max(maxClass, rank)
  }
  return hits
}
