/**
 * Studio History → Season Import chapter — AFTER approved Studio History final.
 *
 * importProgress = 0 is identity: Studio History remains pixel-equivalent
 * to studioProgress = 1. No 2027 card morph — History exits as one chapter.
 */

import { easeOutCubic, rangeT } from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'

export const MOBILE_TRACK_SEASON_IMPORT_SVH = 150

export const SEASON_IMPORT_RANGES = {
  historyHold: { start: 0.0, end: 0.05 },
  /** Whole History composition: Y up + fade + tiny scale. */
  historyShellExit: { start: 0.05, end: 0.24 },
  /** Lock leaves with History — slightly earlier so it never hangs behind. */
  lockExit: { start: 0.05, end: 0.22 },

  importIcon: { start: 0.18, end: 0.32 },
  importEyebrow: { start: 0.18, end: 0.32 },
  importHeadline: { start: 0.22, end: 0.38 },
  importSupport: { start: 0.28, end: 0.42 },
  importProcess: { start: 0.34, end: 0.46 },

  panelContainer: { start: 0.4, end: 0.52 },
  sheetPanel: { start: 0.4, end: 0.54 },
  rowSelect: { start: 0.48, end: 0.58 },
  pdfAttach: { start: 0.52, end: 0.62 },
  assignPanel: { start: 0.56, end: 0.7 },
  assignFields: { start: 0.62, end: 0.74 },
  readyState: { start: 0.7, end: 0.82 },
  finalHold: { start: 0.82, end: 1.0 },
} as const

/** History recess: translateY 0 → −130px, scale 1 → 0.97. */
export const SEASON_IMPORT_SHELL_SCALE_END = 0.97
export const SEASON_IMPORT_SHELL_Y_PX = -130

/** Lock recess: matches History direction (px). */
export const SEASON_IMPORT_LOCK_SCALE_END = 0.96
export const SEASON_IMPORT_LOCK_Y_PX = -130

function exitRemain(p: number, start: number, end: number): number {
  return 1 - easeOutCubic(rangeT(p, start, end))
}

function enterOp(p: number, start: number, end: number): number {
  return easeOutCubic(rangeT(p, start, end))
}

export function seasonImportHistoryShellOpAt(p: number): number {
  return exitRemain(
    p,
    SEASON_IMPORT_RANGES.historyShellExit.start,
    SEASON_IMPORT_RANGES.historyShellExit.end,
  )
}

export function seasonImportHistoryShellScaleAt(p: number): number {
  const t = easeOutCubic(
    rangeT(
      p,
      SEASON_IMPORT_RANGES.historyShellExit.start,
      SEASON_IMPORT_RANGES.historyShellExit.end,
    ),
  )
  return 1 - t * (1 - SEASON_IMPORT_SHELL_SCALE_END)
}

export function seasonImportHistoryShellYAt(p: number): number {
  const t = easeOutCubic(
    rangeT(
      p,
      SEASON_IMPORT_RANGES.historyShellExit.start,
      SEASON_IMPORT_RANGES.historyShellExit.end,
    ),
  )
  return t * SEASON_IMPORT_SHELL_Y_PX
}

/** Intro / seasons / timeline all leave with the shell — one History chapter. */
export function seasonImportHistoryIntroOpAt(p: number): number {
  return seasonImportHistoryShellOpAt(p)
}

export function seasonImportHistoryTimelineOpAt(p: number): number {
  return seasonImportHistoryShellOpAt(p)
}

export function seasonImportHistoryYear2026OpAt(p: number): number {
  return seasonImportHistoryShellOpAt(p)
}

export function seasonImportHistoryYear2027OpAt(p: number): number {
  return seasonImportHistoryShellOpAt(p)
}

export function seasonImportHistoryYear2028OpAt(p: number): number {
  return seasonImportHistoryShellOpAt(p)
}

export function seasonImportHistoryCardsOpAt(p: number): number {
  return seasonImportHistoryShellOpAt(p)
}

export function seasonImportLockOpAt(p: number): number {
  return exitRemain(p, SEASON_IMPORT_RANGES.lockExit.start, SEASON_IMPORT_RANGES.lockExit.end)
}

export function seasonImportLockYAt(p: number): number {
  const op = seasonImportLockOpAt(p)
  if (op < 0.02) return 0
  const t = easeOutCubic(
    rangeT(p, SEASON_IMPORT_RANGES.lockExit.start, SEASON_IMPORT_RANGES.lockExit.end),
  )
  return t * SEASON_IMPORT_LOCK_Y_PX
}

export function seasonImportLockScaleAt(p: number): number {
  const op = seasonImportLockOpAt(p)
  if (op < 0.02) return 1
  const t = easeOutCubic(
    rangeT(p, SEASON_IMPORT_RANGES.lockExit.start, SEASON_IMPORT_RANGES.lockExit.end),
  )
  return 1 - t * (1 - SEASON_IMPORT_LOCK_SCALE_END)
}

/** Hero enter: Y 20 → 0. */
export function seasonImportRevealYAt(op: number): number {
  return (1 - op) * 20
}

/** Product workspace enter: Y 28 → 0. */
export function seasonImportPanelsYAt(op: number): number {
  return (1 - op) * 28
}

export function seasonImportIconOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.importIcon.start, SEASON_IMPORT_RANGES.importIcon.end)
}

export function seasonImportEyebrowOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.importEyebrow.start, SEASON_IMPORT_RANGES.importEyebrow.end)
}

export function seasonImportHeadlineOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.importHeadline.start, SEASON_IMPORT_RANGES.importHeadline.end)
}

export function seasonImportSupportOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.importSupport.start, SEASON_IMPORT_RANGES.importSupport.end)
}

export function seasonImportProcessOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.importProcess.start, SEASON_IMPORT_RANGES.importProcess.end)
}

export function seasonImportPanelContainerOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.panelContainer.start, SEASON_IMPORT_RANGES.panelContainer.end)
}

export function seasonImportSheetOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.sheetPanel.start, SEASON_IMPORT_RANGES.sheetPanel.end)
}

export function seasonImportRowSelectAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.rowSelect.start, SEASON_IMPORT_RANGES.rowSelect.end)
}

export function seasonImportPdfOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.pdfAttach.start, SEASON_IMPORT_RANGES.pdfAttach.end)
}

export function seasonImportAssignOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.assignPanel.start, SEASON_IMPORT_RANGES.assignPanel.end)
}

export function seasonImportAssignFieldsOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.assignFields.start, SEASON_IMPORT_RANGES.assignFields.end)
}

export function seasonImportReadyOpAt(p: number): number {
  return enterOp(p, SEASON_IMPORT_RANGES.readyState.start, SEASON_IMPORT_RANGES.readyState.end)
}
