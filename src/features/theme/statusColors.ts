import {
  DEFAULT_APPEARANCE,
  type Appearance,
} from '@/features/appearance/types'

/**
 * Shared status colors — identical across every application theme in Light.
 * Brand palette colors must never replace these.
 */

export const SHARED_STATUS_TOKENS = {
  '--status-success': '#067647',
  '--status-success-text': '#067647',
  '--status-success-soft': '#ecfdf3',
  '--status-success-border': '#abefc6',

  '--status-warning': '#b45309',
  '--status-warning-text': '#92400e',
  '--status-warning-soft': '#fef3c7',
  '--status-warning-border': '#fde68a',

  '--status-error': '#b42318',
  '--status-error-text': '#b42318',
  '--status-error-soft': '#fef3f2',
  '--status-error-border': '#fecdca',

  '--status-info': '#175cd3',
  '--status-info-text': '#175cd3',
  '--status-info-soft': '#eff8ff',
  '--status-info-border': '#b2ddff',
} as const

export const DARK_STATUS_TOKENS = {
  '--status-success': '#6BB892',
  '--status-success-text': '#9AD4B4',
  '--status-success-soft': '#152820',
  '--status-success-border': '#2A4A38',

  '--status-warning': '#D4A054',
  '--status-warning-text': '#E8C078',
  '--status-warning-soft': '#241C10',
  '--status-warning-border': '#3D3020',

  '--status-error': '#E07068',
  '--status-error-text': '#F0A09A',
  '--status-error-soft': '#241514',
  '--status-error-border': '#3D2424',

  '--status-info': '#6A9FD4',
  '--status-info-text': '#94BDE8',
  '--status-info-soft': '#141E28',
  '--status-info-border': '#243448',
} as const

export type StatusTokenName = keyof typeof SHARED_STATUS_TOKENS

export type StatusColorTokens = typeof SHARED_STATUS_TOKENS

export function resolveStatusColors(
  appearance: Appearance = DEFAULT_APPEARANCE,
): StatusColorTokens {
  return (appearance === 'dark'
    ? DARK_STATUS_TOKENS
    : SHARED_STATUS_TOKENS) as StatusColorTokens
}
