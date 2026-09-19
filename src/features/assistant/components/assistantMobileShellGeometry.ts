/**
 * Phase 2K.3 — geometry model: document-anchored root + VV HEIGHT stage.
 *
 * Frame top is ALWAYS 0 in Assistant coordinates.
 * visualViewport.offsetTop / pageTop never position the stage.
 * Stage height = visualViewport.height.
 */

export type Rect = {
  top: number
  left: number
  width: number
  height: number
  bottom: number
  right: number
}

export type AssistantShellGeometry = {
  viewportWidth: number
  viewportHeight: number
  /** Observed VV offset — never applied to frame.top. */
  offsetTop: number
  offsetLeft: number
  /** Layout-viewport backdrop (full). */
  backdrop: Rect
  /** Stage: top=0, height=vv.height. */
  frame: Rect
  header: Rect
  content: Rect
  composer: Rect
  textarea: Rect
}

function rect(top: number, left: number, width: number, height: number): Rect {
  return {
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
  }
}

export type LayoutOptions = {
  layoutWidth?: number
  layoutHeight?: number
  viewportWidth: number
  viewportHeight: number
  /** Ignored for positioning (telemetry observation only). */
  offsetTop?: number
  offsetLeft?: number
  headerHeight?: number
  composerHeight?: number
}

/**
 * Layout: stage at top=0 with height=vv.height; rows fill the stage.
 * Document scroll anchoring keeps this coordinate system stable on device.
 */
export function layoutAssistantMobileShell(
  options: LayoutOptions,
): AssistantShellGeometry {
  const {
    viewportWidth: vw,
    viewportHeight: vh,
    offsetTop = 0,
    offsetLeft = 0,
    headerHeight = 64,
    composerHeight = 78,
  } = options
  const layoutWidth = options.layoutWidth ?? vw
  const layoutHeight = options.layoutHeight ?? Math.max(vh + offsetTop, vh)

  const backdrop = rect(0, 0, layoutWidth, layoutHeight)
  // Phase 2K.3: NEVER use offsetTop for frame.top
  const frame = rect(0, 0, vw, vh)

  const headerH = Math.min(headerHeight, vh)
  const composerH = Math.min(composerHeight, Math.max(0, vh - headerH))
  const contentH = Math.max(0, vh - headerH - composerH)

  const header = rect(frame.top, frame.left, vw, headerH)
  const content = rect(frame.top + headerH, frame.left, vw, contentH)
  const composer = rect(frame.top + headerH + contentH, frame.left, vw, composerH)
  const textarea = rect(
    composer.top + 12,
    frame.left + 16,
    Math.max(0, vw - 32),
    Math.min(54, composerH - 16),
  )

  return {
    viewportWidth: vw,
    viewportHeight: vh,
    offsetTop,
    offsetLeft,
    backdrop,
    frame,
    header,
    content,
    composer,
    textarea,
  }
}

/** @deprecated */
export function layoutAssistantMobileShellLegacy(options: {
  viewportWidth: number
  viewportHeight: number
  headerHeight?: number
  composerHeight?: number
  offsetTop?: number
}): AssistantShellGeometry {
  const offsetTop = options.offsetTop ?? 0
  return layoutAssistantMobileShell({
    layoutWidth: options.viewportWidth,
    layoutHeight: options.viewportHeight + offsetTop,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    offsetTop,
    headerHeight: options.headerHeight,
    composerHeight: options.composerHeight,
  })
}

export function assertFrameMatchesStage(
  g: AssistantShellGeometry,
  label: string,
): void {
  if (Math.abs(g.frame.top - 0) > 0.5) {
    throw new Error(`${label}: frame.top must be 0 (got ${g.frame.top})`)
  }
  if (Math.abs(g.frame.height - g.viewportHeight) > 0.5) {
    throw new Error(`${label}: frame.height != vv.height`)
  }
  if (Math.abs(g.frame.bottom - g.viewportHeight) > 0.5) {
    throw new Error(`${label}: frame.bottom != vv.height`)
  }
}

/** @deprecated Alias — 2K.3 stage is top=0. */
export function assertFrameMatchesVisualViewport(
  g: AssistantShellGeometry,
  label: string,
): void {
  assertFrameMatchesStage(g, label)
}

export function assertStructuralOrder(
  g: AssistantShellGeometry,
  label: string,
): void {
  assertFrameMatchesStage(g, label)

  const stageTop = 0
  const stageBottom = g.viewportHeight

  if (g.header.top + 0.5 < stageTop) {
    throw new Error(
      `${label}: header above stage (header.top=${g.header.top})`,
    )
  }
  if (g.header.top < 0) {
    throw new Error(`${label}: header.top < 0 — broken screenshot`)
  }
  if (g.composer.bottom > stageBottom + 0.5) {
    throw new Error(`${label}: composer below stage bottom`)
  }
  if (g.composer.top < g.header.bottom - 0.5) {
    throw new Error(`${label}: composer jumped above/into header`)
  }
  if (Math.abs(g.content.top - g.header.bottom) > 0.5) {
    throw new Error(`${label}: content must follow header`)
  }
  if (Math.abs(g.composer.top - g.content.bottom) > 0.5) {
    throw new Error(`${label}: composer must follow content`)
  }
  if (g.header.top >= g.composer.top) {
    throw new Error(`${label}: header must be above composer`)
  }
  const composerInStage = g.composer.top - stageTop
  if (g.viewportHeight >= 400 && composerInStage < g.viewportHeight * 0.25) {
    throw new Error(
      `${label}: composer near top of stage (relative=${composerInStage})`,
    )
  }
  if (g.composer.bottom <= stageTop || g.composer.top >= stageBottom) {
    throw new Error(`${label}: composer outside stage`)
  }
  // offsetTop must never have been applied to frame
  if (g.offsetTop !== 0 && Math.abs(g.frame.top - g.offsetTop) < 0.5) {
    throw new Error(
      `${label}: frame.top incorrectly equals offsetTop=${g.offsetTop}`,
    )
  }
}

export function keyboardLifecycleFrames(
  _width: number,
  fullHeight: number,
  keyboardHeight: number,
): number[] {
  void _width
  const openH = Math.max(200, fullHeight - keyboardHeight)
  const steps = 5
  const frames: number[] = [fullHeight]
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    frames.push(Math.round(fullHeight + (openH - fullHeight) * t))
  }
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    frames.push(Math.round(openH + (fullHeight - openH) * t))
  }
  return frames
}

/**
 * Broken pre-2K.3 class: document scrolled + frame chased VV offsetTop
 * → header above visible stage.
 */
export function brokenFocusScrollGeometry(options: {
  layoutWidth: number
  layoutHeight: number
  viewportWidth: number
  viewportHeight: number
  /** Document scroll after Safari focus (e.g. 473). */
  windowScrollY: number
  offsetTop: number
}): AssistantShellGeometry {
  // Represents root rect.top = -offsetTop after document/visual movement.
  const shift = -options.offsetTop
  const g = layoutAssistantMobileShell({
    layoutWidth: options.layoutWidth,
    layoutHeight: options.layoutHeight,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    offsetTop: options.offsetTop,
  })
  return {
    ...g,
    frame: rect(shift, 0, options.viewportWidth, options.viewportHeight),
    header: rect(shift, 0, options.viewportWidth, 64),
    content: rect(shift + 64, 0, options.viewportWidth, Math.max(0, options.viewportHeight - 64 - 78)),
    composer: rect(
      shift + options.viewportHeight - 78,
      0,
      options.viewportWidth,
      78,
    ),
  }
}

/** @deprecated 2K.1 name — maps to broken focus-scroll class. */
export function brokenUncorrectedPanGeometry(options: {
  layoutWidth: number
  layoutHeight: number
  viewportWidth: number
  viewportHeight: number
  offsetTop: number
}): AssistantShellGeometry {
  return brokenFocusScrollGeometry({
    ...options,
    windowScrollY: options.offsetTop,
  })
}
