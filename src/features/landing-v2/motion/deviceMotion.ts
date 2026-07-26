/**
 * Maps a global 0–1 progress into a local 0–1 within [start, end].
 */
export function localProgress(
  global: number,
  start: number,
  end: number,
): number {
  if (end <= start) return 0
  if (global <= start) return 0
  if (global >= end) return 1
  return (global - start) / (end - start)
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Pick discrete beat index from local progress. */
export function beatIndex(local: number, count: number): number {
  if (count <= 1) return 0
  return Math.min(count - 1, Math.floor(local * count * 0.999))
}
