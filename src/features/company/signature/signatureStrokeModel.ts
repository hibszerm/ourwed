/**
 * Pure signature stroke model — normalized 0–1 coordinates for responsive redraw.
 * Smooth rendering lives in paintSignatureStrokes (midpoint quadratic Bézier).
 */

export type SignaturePoint = {
  x: number
  y: number
  timestamp?: number
}

export type SignatureStroke = {
  points: SignaturePoint[]
}

export type SignatureStrokeRenderOptions = {
  strokeStyle?: string
  /** CSS-pixel line width (not device pixels). */
  lineWidth?: number
}

/** Minimum path length (normalized) to count as a meaningful ink stroke. */
export const MIN_STROKE_LENGTH = 0.012

/** Minimum total stroke length across the pad to allow save. */
export const MIN_SIGNATURE_LENGTH = 0.04

/**
 * Drop consecutive duplicates / micro-jitter while preserving endpoints.
 * Threshold is in normalized 0–1 space (~0.15% of the shorter canvas side).
 */
export const POINT_CLEANUP_MIN_DISTANCE = 0.0015

export function strokeLength(stroke: SignatureStroke): number {
  let len = 0
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1]!
    const b = stroke.points[i]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    len += Math.hypot(dx, dy)
  }
  return len
}

export function totalSignatureLength(strokes: SignatureStroke[]): number {
  return strokes.reduce((sum, s) => sum + strokeLength(s), 0)
}

export function isDotStroke(stroke: SignatureStroke): boolean {
  return stroke.points.length === 1
}

export function isMeaningfulStroke(stroke: SignatureStroke): boolean {
  if (isDotStroke(stroke)) return true
  return stroke.points.length >= 2 && strokeLength(stroke) >= MIN_STROKE_LENGTH
}

export function hasMeaningfulSignature(strokes: SignatureStroke[]): boolean {
  const ink = strokes.filter(
    (s) => s.points.length >= 2 && strokeLength(s) >= MIN_STROKE_LENGTH,
  )
  return (
    ink.length > 0 && totalSignatureLength(ink) >= MIN_SIGNATURE_LENGTH
  )
}

export function appendPoint(
  stroke: SignatureStroke,
  point: SignaturePoint,
): SignatureStroke {
  const last = stroke.points[stroke.points.length - 1]
  if (
    last &&
    Math.abs(last.x - point.x) < 0.0005 &&
    Math.abs(last.y - point.y) < 0.0005
  ) {
    return stroke
  }
  return { points: [...stroke.points, point] }
}

export function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export function toNormalizedPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  timestamp?: number,
): SignaturePoint {
  const w = Math.max(rect.width, 1)
  const h = Math.max(rect.height, 1)
  return {
    x: clamp01((clientX - rect.left) / w),
    y: clamp01((clientY - rect.top) / h),
    timestamp,
  }
}

/**
 * Lightweight deterministic cleanup for rendering (does not mutate input).
 * Keeps first and last points; drops near-duplicates and tiny jitter.
 */
export function cleanupStrokePoints(
  points: SignaturePoint[],
  minDistance = POINT_CLEANUP_MIN_DISTANCE,
): SignaturePoint[] {
  if (points.length <= 1) return points.slice()
  const out: SignaturePoint[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!
    const prev = out[out.length - 1]!
    const dist = Math.hypot(p.x - prev.x, p.y - prev.y)
    if (dist >= minDistance) out.push(p)
  }
  const last = points[points.length - 1]!
  const prev = out[out.length - 1]!
  if (last !== prev) {
    const dist = Math.hypot(last.x - prev.x, last.y - prev.y)
    if (dist < 1e-9) {
      // identical endpoint — keep single
    } else {
      out.push(last)
    }
  }
  return out
}

export function defaultSignatureLineWidth(cssWidth: number): number {
  return Math.max(2.4, cssWidth * 0.005)
}

/**
 * Midpoint quadratic Bézier stroke — single source of truth for live, resize, export.
 * Coordinates are normalized 0–1; converted to CSS pixels only here.
 */
export function drawSmoothSignatureStroke(
  ctx: CanvasRenderingContext2D,
  points: SignaturePoint[],
  bounds: { width: number; height: number },
  options?: SignatureStrokeRenderOptions,
): void {
  const cleaned = cleanupStrokePoints(points)
  if (cleaned.length === 0) return

  const strokeStyle = options?.strokeStyle ?? '#1a1a1a'
  const lineWidth =
    options?.lineWidth ?? defaultSignatureLineWidth(bounds.width)
  const w = bounds.width
  const h = bounds.height

  const px = (p: SignaturePoint) => p.x * w
  const py = (p: SignaturePoint) => p.y * h

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = strokeStyle
  ctx.fillStyle = strokeStyle
  ctx.lineWidth = lineWidth

  if (cleaned.length === 1) {
    const p = cleaned[0]!
    ctx.beginPath()
    ctx.arc(px(p), py(p), lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  if (cleaned.length === 2) {
    const a = cleaned[0]!
    const b = cleaned[1]!
    ctx.beginPath()
    ctx.moveTo(px(a), py(a))
    ctx.lineTo(px(b), py(b))
    ctx.stroke()
    ctx.restore()
    return
  }

  // Midpoint quadratic smoothing for 3+ points
  ctx.beginPath()
  const p0 = cleaned[0]!
  ctx.moveTo(px(p0), py(p0))

  for (let i = 1; i < cleaned.length - 1; i++) {
    const current = cleaned[i]!
    const next = cleaned[i + 1]!
    const midX = (px(current) + px(next)) / 2
    const midY = (py(current) + py(next)) / 2
    ctx.quadraticCurveTo(px(current), py(current), midX, midY)
  }

  const last = cleaned[cleaned.length - 1]!
  const prev = cleaned[cleaned.length - 2]!
  ctx.quadraticCurveTo(px(prev), py(prev), px(last), py(last))
  ctx.stroke()
  ctx.restore()
}

/** Draw all strokes with the shared smooth renderer (CSS-pixel dimensions). */
export function paintSignatureStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: SignatureStroke[],
  cssWidth: number,
  cssHeight: number,
  options?: SignatureStrokeRenderOptions,
): void {
  const strokeStyle = options?.strokeStyle ?? '#1a1a1a'
  const lineWidth =
    options?.lineWidth ?? defaultSignatureLineWidth(cssWidth)
  for (const stroke of strokes) {
    drawSmoothSignatureStroke(
      ctx,
      stroke.points,
      { width: cssWidth, height: cssHeight },
      { strokeStyle, lineWidth },
    )
  }
}

/**
 * Expand opaque pixel bounds by half stroke width + AA pad so round caps
 * and anti-aliased edges are not clipped after crop.
 */
export function expandBoundsForStroke(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  lineWidth: number,
  imageWidth: number,
  imageHeight: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const pad = Math.ceil(lineWidth / 2) + 2
  return {
    minX: Math.max(0, bounds.minX - pad),
    minY: Math.max(0, bounds.minY - pad),
    maxX: Math.min(imageWidth - 1, bounds.maxX + pad),
    maxY: Math.min(imageHeight - 1, bounds.maxY + pad),
  }
}
