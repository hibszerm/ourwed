/**
 * Phase 2K.4 — pure keyboard-transition presentation model (testable).
 * Does not mutate document scroll / root geometry.
 */

export type KeyboardPresentationMode = 'rest' | 'compact'

/** Compact begins at focus intent — not at final VV height. */
export function keyboardPresentationMode(args: {
  textareaFocused: boolean
  keyboardOpenAttr: boolean
}): KeyboardPresentationMode {
  if (args.textareaFocused || args.keyboardOpenAttr) return 'compact'
  return 'rest'
}

export type TransitionFrame = {
  documentY: number
  vvHeight: number
  focused: boolean
  keyboardAttrOpen: boolean
  presentation: KeyboardPresentationMode
  rootTop: number
  stageTop: number
  stageHeight: number
  headerMounted: boolean
  composerMounted: boolean
  rootOpaque: boolean
  rootVisible: boolean
}

/**
 * Physical opening sequence model (document anchored; stage height follows VV).
 */
export function modelKeyboardOpeningSequence(args?: {
  openingDocumentY?: number
  safariAttemptY?: number
  heights?: number[]
}): TransitionFrame[] {
  const openingY = args?.openingDocumentY ?? 0
  const attemptY = args?.safariAttemptY ?? openingY + 473
  const heights = args?.heights ?? [714, 680, 620, 560, 500, 450, 404]
  const frames: TransitionFrame[] = []

  // Closed
  frames.push({
    documentY: openingY,
    vvHeight: heights[0]!,
    focused: false,
    keyboardAttrOpen: false,
    presentation: 'rest',
    rootTop: 0,
    stageTop: 0,
    stageHeight: heights[0]!,
    headerMounted: true,
    composerMounted: true,
    rootOpaque: true,
    rootVisible: true,
  })

  // Focus — compact immediately; document still anchored
  frames.push({
    documentY: openingY, // after anchor correction (Safari may attempt attemptY)
    vvHeight: heights[0]!,
    focused: true,
    keyboardAttrOpen: false,
    presentation: 'compact',
    rootTop: 0,
    stageTop: 0,
    stageHeight: heights[0]!,
    headerMounted: true,
    composerMounted: true,
    rootOpaque: true,
    rootVisible: true,
  })

  void attemptY // Safari attempt is corrected by 2K.3 anchor — effective Y stays openingY

  for (const h of heights) {
    const kbOpen = heights[0]! - h >= 120
    frames.push({
      documentY: openingY,
      vvHeight: h,
      focused: true,
      keyboardAttrOpen: kbOpen,
      presentation: 'compact',
      rootTop: 0,
      stageTop: 0,
      stageHeight: h,
      headerMounted: true,
      composerMounted: true,
      rootOpaque: true,
      rootVisible: true,
    })
  }

  return frames
}

export function modelKeyboardClosingSequence(args?: {
  openingDocumentY?: number
  heights?: number[]
}): TransitionFrame[] {
  const openingY = args?.openingDocumentY ?? 0
  const heights = args?.heights ?? [404, 450, 500, 560, 620, 680, 714]
  const frames: TransitionFrame[] = []
  for (const h of heights) {
    // Prefer: stay compact while keyboardAttr still open; rest only when closed + unfocused
    const keyboardAttrOpen = h < 650
    const focused = false
    frames.push({
      documentY: openingY,
      vvHeight: h,
      focused,
      keyboardAttrOpen,
      presentation: keyboardPresentationMode({
        textareaFocused: focused,
        keyboardOpenAttr: keyboardAttrOpen,
      }),
      rootTop: 0,
      stageTop: 0,
      stageHeight: h,
      headerMounted: true,
      composerMounted: true,
      rootOpaque: true,
      rootVisible: true,
    })
  }
  // Final rest
  frames.push({
    documentY: openingY,
    vvHeight: 714,
    focused: false,
    keyboardAttrOpen: false,
    presentation: 'rest',
    rootTop: 0,
    stageTop: 0,
    stageHeight: 714,
    headerMounted: true,
    composerMounted: true,
    rootOpaque: true,
    rootVisible: true,
  })
  return frames
}

export function assertTransitionFrameInvariants(
  frame: TransitionFrame,
  label: string,
): void {
  if (frame.rootTop !== 0) throw new Error(`${label}: rootTop`)
  if (frame.stageTop !== 0) throw new Error(`${label}: stageTop`)
  if (!frame.rootOpaque) throw new Error(`${label}: root opaque`)
  if (!frame.rootVisible) throw new Error(`${label}: root visible`)
  if (!frame.headerMounted) throw new Error(`${label}: header`)
  if (!frame.composerMounted) throw new Error(`${label}: composer`)
  if (frame.stageHeight !== frame.vvHeight) {
    throw new Error(`${label}: stageHeight != vvHeight`)
  }
}
