/**
 * Phase 2K.3 — VisualViewport provides usable HEIGHT only.
 *
 * Document scroll is owned by useAssistantDocumentScrollAnchor.
 * Do NOT position root/stage with offsetTop / pageTop / left.
 *
 * BACKDROP (surfaceRoot): fixed inset:0 — opaque CRM cover.
 * STAGE (mobileViewportFrame): top:0 left:0 width:100%, height = vv.height.
 * INSIDE STAGE: CSS grid header / content / composer.
 */

import { useLayoutEffect, useRef, type RefObject } from 'react'
import {
  readVisualViewportBounds,
  subscribeVisualViewport,
  type VisualViewportBounds,
} from '@/components/ui/visualViewportBounds'

/** Shrink below this (px) counts as keyboard open — presentation only. */
export const ASSISTANT_KEYBOARD_THRESHOLD_PX = 120

/** Reject implausibly tiny VV samples. */
export const ASSISTANT_VV_MIN_SIZE_PX = 100

export type AssistantMobileViewportState = {
  viewportHeight: number
  /** Observed only — NEVER used for positioning. */
  viewportOffsetTop: number
  viewportWidth: number
  viewportOffsetLeft: number
  layoutHeight: number
  keyboardOpen: boolean
  keyboardHeight: number
  fromVisualViewport: boolean
}

/**
 * Keyboard detection from HEIGHT shrink only (ignore offsetTop for geometry).
 */
export function computeAssistantMobileViewport(
  bounds: VisualViewportBounds,
  layoutHeight: number,
  thresholdPx: number = ASSISTANT_KEYBOARD_THRESHOLD_PX,
): AssistantMobileViewportState {
  const keyboardHeight = Math.max(0, layoutHeight - bounds.height)
  const keyboardOpen = keyboardHeight >= thresholdPx
  return {
    viewportHeight: bounds.height,
    viewportOffsetTop: bounds.top,
    viewportWidth: bounds.width,
    viewportOffsetLeft: bounds.left,
    layoutHeight,
    keyboardOpen,
    keyboardHeight,
    fromVisualViewport: bounds.fromVisualViewport,
  }
}

export function isValidAssistantViewportSample(
  bounds: VisualViewportBounds,
): boolean {
  return (
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.left) &&
    bounds.width >= ASSISTANT_VV_MIN_SIZE_PX &&
    bounds.height >= ASSISTANT_VV_MIN_SIZE_PX
  )
}

function resolveAssistantRoot(frame: HTMLElement): HTMLElement | null {
  if (typeof frame.closest !== 'function') return null
  return frame.closest('[data-testid="assistant-surface"]') as HTMLElement | null
}

/**
 * Size STAGE to visualViewport.height only.
 * Never writes top/left/transform from offsetTop/pageTop.
 * Skips no-op height writes to avoid same-frame layout thrash.
 */
export function applyAssistantStageHeightToElement(
  frame: HTMLElement,
  bounds: VisualViewportBounds,
  layoutHeight: number,
): void {
  if (!isValidAssistantViewportSample(bounds)) return

  const height = Math.round(bounds.height)
  const prevHeight = frame.style.height
  const nextHeight = `${height}px`
  const heightChanged = prevHeight !== nextHeight

  if (heightChanged) {
    frame.style.position = 'absolute'
    frame.style.top = '0px'
    frame.style.left = '0px'
    frame.style.right = '0'
    frame.style.width = '100%'
    frame.style.height = nextHeight
    frame.style.bottom = 'auto'
    frame.style.inset = 'auto'
    frame.style.removeProperty('transform')
    frame.style.setProperty('--assistant-vv-height', nextHeight)
    frame.style.removeProperty('--assistant-vv-top')
    frame.style.removeProperty('--assistant-vv-left')
    frame.style.removeProperty('--assistant-vv-width')
  }

  const state = computeAssistantMobileViewport(bounds, layoutHeight)
  const kb = state.keyboardOpen ? 'open' : 'closed'
  if (frame.getAttribute('data-keyboard') !== kb) {
    frame.setAttribute('data-keyboard', kb)
  }
  const root = resolveAssistantRoot(frame)
  if (root && root.getAttribute('data-keyboard') !== kb) {
    root.setAttribute('data-keyboard', kb)
  }
  const panel = frame.querySelector?.('[role="dialog"]') as HTMLElement | null
  if (panel && panel.getAttribute('data-keyboard') !== kb) {
    panel.setAttribute('data-keyboard', kb)
  }
}

/** @deprecated Alias — 2K.3 path is height-only. */
export function applyAssistantViewportFrameToElement(
  frame: HTMLElement,
  bounds: VisualViewportBounds,
  layoutHeight: number,
): void {
  applyAssistantStageHeightToElement(frame, bounds, layoutHeight)
}

/** @deprecated */
export function applyAssistantStageViewportToElement(
  el: HTMLElement,
  state: AssistantMobileViewportState,
): void {
  applyAssistantStageHeightToElement(
    el,
    {
      top: state.viewportOffsetTop,
      left: state.viewportOffsetLeft,
      width: state.viewportWidth,
      height: state.viewportHeight,
      fromVisualViewport: state.fromVisualViewport,
    },
    state.layoutHeight,
  )
}

/** @deprecated */
export function applyAssistantKeyboardInsetToElement(
  el: HTMLElement,
  state: AssistantMobileViewportState,
): void {
  applyAssistantStageViewportToElement(el, state)
}

/** @deprecated */
export function applyAssistantMobileViewportToElement(
  el: HTMLElement,
  state: AssistantMobileViewportState,
  _left: number = 0,
): void {
  void _left
  applyAssistantStageViewportToElement(el, state)
}

/** Restore CSS full-height fallback (opening / cleanup). */
export function clearAssistantViewportFrameFromElement(frame: HTMLElement): void {
  frame.style.removeProperty('top')
  frame.style.removeProperty('left')
  frame.style.removeProperty('width')
  frame.style.removeProperty('height')
  frame.style.removeProperty('right')
  frame.style.removeProperty('bottom')
  frame.style.removeProperty('inset')
  frame.style.removeProperty('position')
  frame.style.removeProperty('transform')
  frame.style.removeProperty('--assistant-vv-top')
  frame.style.removeProperty('--assistant-vv-left')
  frame.style.removeProperty('--assistant-vv-width')
  frame.style.removeProperty('--assistant-vv-height')
  frame.style.removeProperty('--assistant-usable-height')
  frame.style.removeProperty('--assistant-keyboard-height')
  frame.removeAttribute('data-keyboard')
  if (typeof frame.closest === 'function') {
    const root = frame.closest('[data-testid="assistant-surface"]') as
      | HTMLElement
      | null
    if (root) root.removeAttribute('data-keyboard')
  }
  const panel = frame.querySelector?.('[role="dialog"]') as HTMLElement | null
  if (panel) panel.removeAttribute('data-keyboard')
}

/** @deprecated */
export function clearAssistantMobileViewportFromElement(el: HTMLElement): void {
  clearAssistantViewportFrameFromElement(el)
}

/**
 * Assert apply path never positions via offsetTop (for tests).
 */
export function stageApplyUsesOffsetTopForPosition(source: string): boolean {
  // Height-only apply must not assign style.top from bounds.top / offsetTop.
  return /style\.top\s*=\s*`\$\{.*(?:bounds\.top|offsetTop)/.test(source)
}

/**
 * Subscribe to VisualViewport; RAF-coalesce HEIGHT writes only.
 * Missing/invalid VV → leave CSS inset:0 fallback (Assistant stays visible).
 */
export function useAssistantMobileViewport(
  enabled: boolean,
  frameRef: RefObject<HTMLElement | null>,
): void {
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<VisualViewportBounds | null>(null)

  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const flush = () => {
      rafRef.current = null
      const bounds = pendingRef.current
      pendingRef.current = null
      const frame = frameRef.current
      if (!frame || !bounds) return
      if (!isValidAssistantViewportSample(bounds)) return
      applyAssistantStageHeightToElement(frame, bounds, window.innerHeight)
    }

    const schedule = (bounds: VisualViewportBounds) => {
      pendingRef.current = bounds
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(flush)
    }

    const initial = readVisualViewportBounds(window)
    if (isValidAssistantViewportSample(initial)) {
      schedule(initial)
    }
    const unsub = subscribeVisualViewport(schedule, window)

    return () => {
      unsub()
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      pendingRef.current = null
      const frame = frameRef.current
      if (frame) clearAssistantViewportFrameFromElement(frame)
    }
  }, [enabled, frameRef])
}
