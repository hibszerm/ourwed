import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  appendPoint,
  defaultSignatureLineWidth,
  hasMeaningfulSignature,
  paintSignatureStrokes,
  toNormalizedPoint,
  type SignaturePoint,
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
 * Live preview, resize redraw, and PNG export share paintSignatureStrokes.
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
  const rafRef = useRef<number | null>(null)
  const [strokes, setStrokes] = useState<SignatureStroke[]>([])

  const notify = useEffectEvent((next: SignatureStroke[]) => {
    strokesRef.current = next
    setStrokes(next)
    onStrokesChange?.(next)
  })

  const redrawNow = useEffectEvent(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const cssW = Math.max(1, Math.floor(rect.width))
    const cssH = Math.max(1, Math.floor(rect.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 3)

    const targetW = Math.floor(cssW * dpr)
    const targetH = Math.floor(cssH * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
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

  const scheduleRedraw = useEffectEvent(() => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      redrawNow()
    })
  })

  useEffect(() => {
    scheduleRedraw()
  }, [strokes, scheduleRedraw])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      scheduleRedraw()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [scheduleRedraw])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

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
        // Same smooth renderer as live preview (CSS-pixel line width).
        paintSignatureStrokes(ctx, strokesRef.current, exportW, exportH, {
          lineWidth: defaultSignatureLineWidth(exportW),
        })
        return out
      },
    }
    return () => {
      padRef.current = null
    }
  }, [padRef, notify])

  function pointFromClient(
    clientX: number,
    clientY: number,
    timestamp?: number,
  ): SignaturePoint | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return toNormalizedPoint(clientX, clientY, rect, timestamp)
  }

  function appendFromPointerEvent(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current) return
    const native = e.nativeEvent
    const coalesced =
      typeof native.getCoalescedEvents === 'function'
        ? native.getCoalescedEvents()
        : null

    if (coalesced && coalesced.length > 0) {
      for (const ce of coalesced) {
        const point = pointFromClient(ce.clientX, ce.clientY, ce.timeStamp)
        if (!point) continue
        activeRef.current = appendPoint(activeRef.current, point)
      }
    } else {
      const point = pointFromClient(e.clientX, e.clientY, e.timeStamp)
      if (!point) return
      activeRef.current = appendPoint(activeRef.current, point)
    }
    scheduleRedraw()
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    const point = pointFromClient(e.clientX, e.clientY, e.timeStamp)
    if (!point) return
    canvasRef.current?.setPointerCapture(e.pointerId)
    activeRef.current = { points: [point] }
    scheduleRedraw()
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || !activeRef.current) return
    e.preventDefault()
    appendFromPointerEvent(e)
  }

  function endStroke(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current) return
    e.preventDefault()
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    // Include final sample(s) before closing the stroke
    appendFromPointerEvent(e)
    const finished = activeRef.current
    activeRef.current = null
    if (finished.points.length >= 1) {
      notify([...strokesRef.current, finished])
    } else {
      scheduleRedraw()
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
