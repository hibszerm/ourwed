import type { ThemeTokenMap } from '@/features/theme/tokenKeys'

/**
 * Classic Dark — warm editorial charcoal. Base for all dark themes.
 * Workspace stays warm-neutral; sidebar reads deeper and more anchored.
 */
export const CLASSIC_DARK_TOKENS: ThemeTokenMap = {
  '--app-background': '#131110',
  '--app-background-subtle': '#171514',
  '--app-background-raised': '#1A1917',

  '--surface-primary': '#1E1C19',
  '--surface-secondary': '#222019',
  '--surface-tertiary': '#0F0E0D',
  '--surface-elevated': '#242220',
  '--surface-inverse': '#EDE8E0',
  '--surface-hover': '#252320',
  '--surface-selected': '#2A2724',

  '--sidebar-background': '#0C0B0A',
  '--sidebar-border': 'rgba(237, 232, 224, 0.08)',
  '--sidebar-text': 'rgba(237, 232, 224, 0.55)',
  '--sidebar-text-muted': 'rgba(237, 232, 224, 0.35)',
  '--sidebar-item-hover': 'rgba(237, 232, 224, 0.06)',
  '--sidebar-item-active-background': 'rgba(237, 232, 224, 0.10)',
  '--sidebar-item-active-text': '#EDE8E0',
  '--navigation-active-indicator': '#EDE8E0',

  '--text-primary': '#EDE8E0',
  '--text-secondary': '#B5AEA4',
  '--text-muted': '#948C84',
  '--text-disabled': '#5E5852',
  '--text-inverse': '#131110',
  '--text-link': '#D4CCC2',
  '--text-link-hover': '#EDE8E0',

  '--border-subtle': 'rgba(237, 232, 224, 0.06)',
  '--border-default': 'rgba(237, 232, 224, 0.09)',
  '--border-strong': 'rgba(237, 232, 224, 0.14)',
  '--border-interactive': 'rgba(237, 232, 224, 0.18)',
  '--border-hover': 'rgba(237, 232, 224, 0.22)',

  '--brand-primary': '#EDE8E0',
  '--brand-primary-hover': '#F2EDE6',
  '--brand-primary-active': '#D4CCC2',
  '--brand-primary-text': '#131110',
  '--brand-primary-soft': '#2A2724',
  '--brand-primary-soft-text': '#EDE8E0',
  '--brand-secondary': '#9A9288',
  '--brand-secondary-hover': '#B5AEA4',
  '--brand-secondary-text': '#131110',

  '--button-primary-background': '#EDE8E0',
  '--button-primary-background-hover': '#F2EDE6',
  '--button-primary-background-active': '#D4CCC2',
  '--button-primary-text': '#131110',
  '--button-primary-border': 'transparent',
  '--button-secondary-background': '#222019',
  '--button-secondary-background-hover': '#252320',
  '--button-secondary-text': '#EDE8E0',
  '--button-secondary-border': 'rgba(237, 232, 224, 0.12)',
  '--button-ghost-background-hover': 'rgba(237, 232, 224, 0.06)',
  '--button-ghost-text': '#EDE8E0',

  '--input-background': '#1A1917',
  '--input-background-disabled': '#171514',
  '--input-border': 'rgba(237, 232, 224, 0.10)',
  '--input-border-hover': 'rgba(237, 232, 224, 0.16)',
  '--input-border-focus': 'rgba(237, 232, 224, 0.28)',
  '--input-text': '#EDE8E0',
  '--input-placeholder': '#948C84',
  '--input-selection': 'rgba(237, 232, 224, 0.18)',
  '--focus-ring': '0 0 0 3px rgba(237, 232, 224, 0.10)',
  '--focus-ring-strong': '0 0 0 3px rgba(237, 232, 224, 0.18)',

  '--tab-text': '#B5AEA4',
  '--tab-text-hover': '#EDE8E0',
  '--tab-text-active': '#EDE8E0',
  '--tab-background-hover': 'rgba(237, 232, 224, 0.05)',
  '--tab-background-active': '#222019',
  '--tab-border-active': '#EDE8E0',

  '--card-background': '#1E1C19',
  '--card-background-hover': '#222019',
  '--card-border': 'rgba(237, 232, 224, 0.08)',
  '--card-border-hover': 'rgba(237, 232, 224, 0.12)',
  '--panel-background': '#1E1C19',
  '--panel-border': 'rgba(237, 232, 224, 0.08)',

  '--badge-neutral-background': '#252320',
  '--badge-neutral-text': '#B5AEA4',
  '--badge-neutral-border': 'rgba(237, 232, 224, 0.08)',
  '--badge-accent-background': '#EDE8E0',
  '--badge-accent-text': '#131110',
  '--badge-accent-border': 'rgba(237, 232, 224, 0.14)',

  '--overlay-background': 'rgba(0, 0, 0, 0.56)',
  '--dialog-background': '#1E1C19',
  '--dialog-border': 'rgba(237, 232, 224, 0.10)',
  '--drawer-background': '#171514',
  '--tooltip-background': '#242220',
  '--tooltip-text': '#EDE8E0',
  '--popover-background': '#222019',
  '--popover-border': 'rgba(237, 232, 224, 0.10)',

  '--row-background': '#1E1C19',
  '--row-background-hover': '#222019',
  '--row-background-selected': '#2A2724',
  '--row-border': 'rgba(237, 232, 224, 0.06)',
  '--table-header-background': '#171514',
  '--table-header-text': '#B5AEA4',

  '--calendar-today-background': '#252320',
  '--calendar-today-text': '#EDE8E0',
  '--calendar-event-background': '#EDE8E0',
  '--calendar-event-text': '#131110',
  '--timeline-line': 'rgba(237, 232, 224, 0.12)',
  '--timeline-node': '#877F76',
  '--timeline-node-active': '#EDE8E0',

  '--separator': 'rgba(237, 232, 224, 0.08)',
  '--skeleton-background': '#171514',
  '--skeleton-highlight': '#222019',
  '--selection-background': 'rgba(237, 232, 224, 0.14)',
  '--selection-text': '#EDE8E0',
  '--scrollbar-thumb': 'rgba(237, 232, 224, 0.18)',
  '--scrollbar-thumb-hover': 'rgba(237, 232, 224, 0.28)',

  '--shadow-xs': '0 1px 2px rgba(0, 0, 0, 0.32)',
  '--shadow-sm':
    '0 1px 2px rgba(0, 0, 0, 0.28), 0 6px 16px rgba(0, 0, 0, 0.24)',
  '--shadow-md':
    '0 2px 6px rgba(0, 0, 0, 0.32), 0 14px 34px rgba(0, 0, 0, 0.36)',
  '--shadow-lg':
    '0 8px 20px rgba(0, 0, 0, 0.40), 0 28px 60px rgba(0, 0, 0, 0.48)',
  '--shadow-drawer': '12px 2px 32px rgba(0, 0, 0, 0.45)',

  '--browser-chrome-color': '#131110',
}
