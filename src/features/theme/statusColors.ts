/**
 * Shared status colors — identical across every application theme.
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

export type StatusTokenName = keyof typeof SHARED_STATUS_TOKENS
