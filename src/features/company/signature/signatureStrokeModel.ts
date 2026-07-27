/**
 * Pure signature stroke model — normalized 0–1 coordinates for responsive redraw.
 */

export type SignaturePoint = {
  x: number
  y: number
  timestamp?: number
}

export type SignatureStroke = {
  points: SignaturePoint[]
}

/** Minimum path length (normalized) to count as a meaningful stroke. */
export const MIN_STROKE_LENGTH = 0.012

/** Minimum total stroke length across the pad to allow save. */
export const MIN_SIGNATURE_LENGTH = 0.04

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

export function isMeaningfulStroke(stroke: SignatureStroke): boolean {
  return stroke.points.length >= 2 && strokeLength(stroke) >= MIN_STROKE_LENGTH
}

export function hasMeaningfulSignature(strokes: SignatureStroke[]): boolean {
  const meaningful = strokes.filter(isMeaningfulStroke)
  return (
    meaningful.length > 0 &&
    totalSignatureLength(meaningful) >= MIN_SIGNATURE_LENGTH
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

/** Draw strokes onto a 2D context using CSS-pixel dimensions. */
export function paintSignatureStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: SignatureStroke[],
  cssWidth: number,
  cssHeight: number,
  options?: { strokeStyle?: string; lineWidth?: number },
): void {
  const strokeStyle = options?.strokeStyle ?? '#1a1a1a'
  const lineWidth = options?.lineWidth ?? Math.max(2.2, cssWidth * 0.0045)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue
    ctx.beginPath()
    const first = stroke.points[0]!
    ctx.moveTo(first.x * cssWidth, first.y * cssHeight)
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i]!
      ctx.lineTo(p.x * cssWidth, p.y * cssHeight)
    }
    ctx.stroke()
  }
  ctx.restore()
}
