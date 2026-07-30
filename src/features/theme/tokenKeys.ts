/**
 * Required semantic CSS custom properties for every theme.
 * Product components must consume these (or legacy --color-* bridges), never raw hex.
 */

export const SEMANTIC_TOKEN_KEYS = [
  // Application
  '--app-background',
  '--app-background-subtle',
  '--app-background-raised',
  // Surfaces
  '--surface-primary',
  '--surface-secondary',
  '--surface-tertiary',
  '--surface-elevated',
  '--surface-inverse',
  '--surface-hover',
  '--surface-selected',
  // Sidebar / nav
  '--sidebar-background',
  '--sidebar-border',
  '--sidebar-text',
  '--sidebar-text-muted',
  '--sidebar-item-hover',
  '--sidebar-item-active-background',
  '--sidebar-item-active-text',
  '--navigation-active-indicator',
  // Text
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-disabled',
  '--text-inverse',
  '--text-link',
  '--text-link-hover',
  // Borders
  '--border-subtle',
  '--border-default',
  '--border-strong',
  '--border-interactive',
  '--border-hover',
  // Brand
  '--brand-primary',
  '--brand-primary-hover',
  '--brand-primary-active',
  '--brand-primary-text',
  '--brand-primary-soft',
  '--brand-primary-soft-text',
  '--brand-secondary',
  '--brand-secondary-hover',
  '--brand-secondary-text',
  // Buttons
  '--button-primary-background',
  '--button-primary-background-hover',
  '--button-primary-background-active',
  '--button-primary-text',
  '--button-primary-border',
  '--button-secondary-background',
  '--button-secondary-background-hover',
  '--button-secondary-text',
  '--button-secondary-border',
  '--button-ghost-background-hover',
  '--button-ghost-text',
  // Forms
  '--input-background',
  '--input-background-disabled',
  '--input-border',
  '--input-border-hover',
  '--input-border-focus',
  '--input-text',
  '--input-placeholder',
  '--input-selection',
  '--focus-ring',
  '--focus-ring-strong',
  // Tabs
  '--tab-text',
  '--tab-text-hover',
  '--tab-text-active',
  '--tab-background-hover',
  '--tab-background-active',
  '--tab-border-active',
  // Cards / panels
  '--card-background',
  '--card-background-hover',
  '--card-border',
  '--card-border-hover',
  '--panel-background',
  '--panel-border',
  // Badges
  '--badge-neutral-background',
  '--badge-neutral-text',
  '--badge-neutral-border',
  '--badge-accent-background',
  '--badge-accent-text',
  '--badge-accent-border',
  // Overlays
  '--overlay-background',
  '--dialog-background',
  '--dialog-border',
  '--drawer-background',
  '--tooltip-background',
  '--tooltip-text',
  '--popover-background',
  '--popover-border',
  // Tables / lists
  '--row-background',
  '--row-background-hover',
  '--row-background-selected',
  '--row-border',
  '--table-header-background',
  '--table-header-text',
  // Calendar / timeline
  '--calendar-today-background',
  '--calendar-today-text',
  '--calendar-event-background',
  '--calendar-event-text',
  '--timeline-line',
  '--timeline-node',
  '--timeline-node-active',
  // Misc
  '--separator',
  '--skeleton-background',
  '--skeleton-highlight',
  '--selection-background',
  '--selection-text',
  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',
  // Elevation
  '--shadow-xs',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--shadow-drawer',
] as const

export type SemanticTokenKey = (typeof SEMANTIC_TOKEN_KEYS)[number]

export type ThemeTokenMap = Record<SemanticTokenKey, string>

/**
 * Map semantic tokens → legacy --color-* used throughout existing CSS.
 * Keeps Classic visually identical while migrating gradually.
 */
export function buildLegacyColorBridge(
  tokens: ThemeTokenMap,
): Record<string, string> {
  return {
    '--color-bg': tokens['--app-background'],
    '--color-bg-subtle': tokens['--app-background-subtle'],
    '--color-bg-sunken': tokens['--surface-tertiary'],
    '--color-bg-elevated': tokens['--app-background-raised'],
    '--color-surface': tokens['--surface-primary'],
    '--color-surface-hover': tokens['--surface-hover'],
    '--color-surface-muted': tokens['--surface-secondary'],
    '--color-border': tokens['--border-default'],
    '--color-border-strong': tokens['--border-strong'],
    '--color-overlay': tokens['--overlay-background'],

    '--color-text-primary': tokens['--text-primary'],
    '--color-text-secondary': tokens['--text-secondary'],
    '--color-text-tertiary': tokens['--text-muted'],
    '--color-text': tokens['--text-primary'],
    '--color-text-muted': tokens['--text-muted'],

    '--color-accent': tokens['--brand-primary'],
    '--color-accent-hover': tokens['--brand-primary-hover'],
    '--color-accent-light': tokens['--brand-secondary'],
    '--color-accent-subtle': tokens['--brand-primary-soft'],
    '--color-accent-subtle-hover': tokens['--surface-selected'],
    '--color-primary': tokens['--brand-primary'],

    '--color-sidebar-bg': tokens['--sidebar-background'],
    '--color-sidebar-text': tokens['--sidebar-text'],
    '--color-sidebar-text-active': tokens['--sidebar-item-active-text'],
    '--color-sidebar-hover': tokens['--sidebar-item-hover'],
    '--color-sidebar-active': tokens['--sidebar-item-active-background'],
    '--color-sidebar-border': tokens['--sidebar-border'],
    '--color-sidebar-muted': tokens['--sidebar-text-muted'],

    // Status — always from shared status tokens (also set on root)
    '--color-warning': 'var(--status-warning)',
    '--color-warning-bg': 'var(--status-warning-soft)',
    '--color-warning-text': 'var(--status-warning-text)',
    '--color-success': 'var(--status-success)',
    '--color-success-bg': 'var(--status-success-soft)',
    '--color-success-text': 'var(--status-success-text)',
    '--color-info-bg': tokens['--surface-secondary'],
    '--color-info-text': tokens['--text-secondary'],
    '--color-error': 'var(--status-error)',
    '--color-error-bg': 'var(--status-error-soft)',
    '--color-danger': 'var(--status-error)',
    '--color-danger-text': 'var(--status-error-text)',

    '--color-neutral-50': tokens['--surface-secondary'],
    '--color-neutral-100': tokens['--surface-tertiary'],
    '--color-danger-50': 'var(--status-error-soft)',
    '--color-danger-500': 'var(--status-error)',
    '--color-danger-600': 'var(--status-error)',
    '--color-danger-700': 'var(--status-error-text)',
    '--color-success-50': 'var(--status-success-soft)',
    '--color-success-700': 'var(--status-success-text)',
    '--color-info-50': tokens['--surface-secondary'],
    '--color-info-700': tokens['--text-secondary'],
    '--color-focus-ring': tokens['--focus-ring'],

    '--shadow-xs': tokens['--shadow-xs'],
    '--shadow-sm': tokens['--shadow-sm'],
    '--shadow-md': tokens['--shadow-md'],
    '--shadow-lg': tokens['--shadow-lg'],
    '--shadow-drawer': tokens['--shadow-drawer'],
    '--focus-ring': tokens['--focus-ring'],
    '--focus-ring-strong': tokens['--focus-ring-strong'],
  }
}
