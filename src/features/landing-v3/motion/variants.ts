/** Motion constants for Landing V3 */

export const premiumEase: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** @deprecated prefer premiumEase */
export const EASE_PREMIUM = premiumEase

export const DURATION = {
  micro: 0.2,
  control: 0.32,
  state: 0.32,
  panel: 0.55,
  scene: 0.8,
  shared: 0.9,
  heroMorph: 0.9,
} as const

export const LAYOUT_IDS = {
  assignmentCard: 'lv3-assignment-card',
  coupleTitle: 'lv3-couple-title',
  statusBadge: 'lv3-status-badge',
  date: 'lv3-date',
  venue: 'lv3-venue',
} as const
