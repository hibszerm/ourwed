import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import {
  appendPoint,
  hasMeaningfulSignature,
  paintSignatureStrokes,
  toNormalizedPoint,
  type SignatureStroke,
} from './signatureStrokeModel'
import styles from './SignaturePad.module.css'

export type SignaturePadHandle = {
  getStrokes: () => SignatureStroke[]
  clear: () => void
  undo: () => void
  hasContent: () => boolean
  /** Paint strokes onto an offscreen canvas sized for export and return it. */
  exportCanvas: () => HTMLCanvasElement | null
}

type Props = {
  className?: string
  disabled?: boolean
  ariaLabel?: string
  onStrokesChange?: (strokes: SignatureStroke[]) => void
  /** Imperative handle via callback ref pattern. */
  padRef?: MutableRefObject<SignaturePadHandle | null>
}

/**
 * Pointer-Events signature pad — mouse, touch, and stylus.
 * Internal stroke model uses normalized coordinates for retina + resize.
 */
export function SignaturePad({
  className,
  disabled = false,
  ariaLabel = 'Pole do narysowania podpisu',
  onStrokesChange,
  padRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const strokesRef = useRef<SignatureStroke[]>([])
  const activeRef = useRef<SignatureStroke | null>(null)
  const [strokes, setStrokes] = useState<SignatureStroke[]>([])

  const notify = useEffectEvent((next: SignatureStroke[]) => {
    strokesRef.current = next
    setStrokes(next)
    onStrokesChange?.(next)
  })

  const redraw = useEffectEvent(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const cssW = Math.max(1, Math.floor(rect.width))
    const cssH = Math.max(1, Math.floor(rect.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 3)

    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    const live = activeRef.current
      ? [...strokesRef.current, activeRef.current]
      : strokesRef.current
    paintSignatureStrokes(ctx, live, cssW, cssH)
  })

  useEffect(() => {
    redraw()
  }, [strokes, redraw])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      redraw()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [redraw])

  useEffect(() => {
    if (!padRef) return
    padRef.current = {
      getStrokes: () => strokesRef.current,
      clear: () => {
        activeRef.current = null
        notify([])
      },
      undo: () => {
        activeRef.current = null
        notify(strokesRef.current.slice(0, -1))
      },
      hasContent: () => hasMeaningfulSignature(strokesRef.current),
      exportCanvas: () => {
        if (!hasMeaningfulSignature(strokesRef.current)) return null
        const exportW = 1000
        const exportH = 360
        const out = document.createElement('canvas')
        out.width = exportW
        out.height = exportH
        const ctx = out.getContext('2d')
        if (!ctx) return null
        ctx.clearRect(0, 0, exportW, exportH)
        paintSignatureStrokes(ctx, strokesRef.current, exportW, exportH, {
          lineWidth: 3.2,
        })
        return out
      },
    }
    return () => {
      padRef.current = null
    }
  }, [padRef, notify])

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return toNormalizedPoint(e.clientX, e.clientY, rect, e.timeStamp)
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    const point = pointFromEvent(e)
    if (!point) return
    canvasRef.current?.setPointerCapture(e.pointerId)
    activeRef.current = { points: [point] }
    redraw()
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !activeRef.current) return
    e.preventDefault()
    const point = pointFromEvent(e)
    if (!point) return
    activeRef.current = appendPoint(activeRef.current, point)
    redraw()
  }

  function endStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current) return
    e.preventDefault()
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    const finished = activeRef.current
    activeRef.current = null
    if (finished.points.length >= 2) {
      notify([...strokesRef.current, finished])
    } else {
      redraw()
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${className ?? ''}`}
      data-disabled={disabled || undefined}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label={ariaLabel}
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
    </div>
  )
}
