export const LANDING_SCROLL_VH = 860

/** Normalized master timeline ranges (0–1). */
export const SCENE = {
  hero: { start: 0, end: 0.1 },
  open: { start: 0.1, end: 0.22 },
  desktop: { start: 0.22, end: 0.5 },
  contract: { start: 0.5, end: 0.62 },
  morph: { start: 0.62, end: 0.74 },
  mobile: { start: 0.74, end: 0.9 },
  sync: { start: 0.9, end: 0.96 },
  cta: { start: 0.96, end: 1 },
} as const

export const DESKTOP_BEATS = [
  'dashboard',
  'wedding',
  'tasks',
  'payments',
  'contractCue',
] as const

export const CONTRACT_BEATS = [
  'upload',
  'prepare',
  'ready',
  'generate',
  'preview',
] as const

export const MOBILE_BEATS = [
  'today',
  'nav',
  'timeline',
  'checklist',
  'contact',
  'offline',
] as const

export type DesktopBeat = (typeof DESKTOP_BEATS)[number]
export type ContractBeat = (typeof CONTRACT_BEATS)[number]
export type MobileBeat = (typeof MOBILE_BEATS)[number]
