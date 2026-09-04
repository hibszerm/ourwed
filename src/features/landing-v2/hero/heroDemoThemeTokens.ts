import { resolveDarkThemeTokens } from '@/features/theme/dark/resolveDarkTokens'
import { GRAPHITE_TOKENS } from '@/features/theme/tokens/graphite'

/**
 * Semantic tokens consumed by HeroModernDashboard marketing reconstruction.
 * Light = Graphite theme / light appearance (production Modern default).
 * Dark = Graphite theme / dark appearance (Appearance → dark + Graphite).
 */
export const HERO_DEMO_THEME_TOKEN_KEYS = [
  '--app-background',
  '--surface-primary',
  '--surface-secondary',
  '--sidebar-background',
  '--sidebar-border',
  '--sidebar-text',
  '--sidebar-text-muted',
  '--sidebar-item-hover',
  '--sidebar-item-active-background',
  '--sidebar-item-active-text',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-inverse',
  '--border-subtle',
  '--border-default',
  '--brand-primary',
  '--brand-primary-hover',
  '--button-primary-text',
] as const

export type HeroDemoThemeTokenKey = (typeof HERO_DEMO_THEME_TOKEN_KEYS)[number]

export const HERO_DEMO_LIGHT_TOKENS: Record<HeroDemoThemeTokenKey, string> = {
  '--app-background': GRAPHITE_TOKENS['--app-background'],
  '--surface-primary': GRAPHITE_TOKENS['--surface-primary'],
  '--surface-secondary': GRAPHITE_TOKENS['--surface-secondary'],
  '--sidebar-background': GRAPHITE_TOKENS['--sidebar-background'],
  '--sidebar-border': GRAPHITE_TOKENS['--sidebar-border'],
  '--sidebar-text': GRAPHITE_TOKENS['--sidebar-text'],
  '--sidebar-text-muted': GRAPHITE_TOKENS['--sidebar-text-muted'],
  '--sidebar-item-hover': GRAPHITE_TOKENS['--sidebar-item-hover'],
  '--sidebar-item-active-background':
    GRAPHITE_TOKENS['--sidebar-item-active-background'],
  '--sidebar-item-active-text': GRAPHITE_TOKENS['--sidebar-item-active-text'],
  '--text-primary': GRAPHITE_TOKENS['--text-primary'],
  '--text-secondary': GRAPHITE_TOKENS['--text-secondary'],
  '--text-muted': GRAPHITE_TOKENS['--text-muted'],
  '--text-inverse': GRAPHITE_TOKENS['--text-inverse'],
  '--border-subtle': GRAPHITE_TOKENS['--border-subtle'],
  '--border-default': GRAPHITE_TOKENS['--border-default'],
  '--brand-primary': GRAPHITE_TOKENS['--brand-primary'],
  '--brand-primary-hover': GRAPHITE_TOKENS['--brand-primary-hover'],
  '--button-primary-text': GRAPHITE_TOKENS['--button-primary-text'],
}

const graphiteDark = resolveDarkThemeTokens('graphite')

export const HERO_DEMO_GRAPHITE_TOKENS: Record<HeroDemoThemeTokenKey, string> = {
  '--app-background': graphiteDark['--app-background'],
  '--surface-primary': graphiteDark['--surface-primary'],
  '--surface-secondary': graphiteDark['--surface-secondary'],
  '--sidebar-background': graphiteDark['--sidebar-background'],
  '--sidebar-border': graphiteDark['--sidebar-border'],
  '--sidebar-text': graphiteDark['--sidebar-text'],
  '--sidebar-text-muted': graphiteDark['--sidebar-text-muted'],
  '--sidebar-item-hover': graphiteDark['--sidebar-item-hover'],
  '--sidebar-item-active-background':
    graphiteDark['--sidebar-item-active-background'],
  '--sidebar-item-active-text': graphiteDark['--sidebar-item-active-text'],
  '--text-primary': graphiteDark['--text-primary'],
  '--text-secondary': graphiteDark['--text-secondary'],
  '--text-muted': graphiteDark['--text-muted'],
  '--text-inverse': graphiteDark['--text-inverse'],
  '--border-subtle': graphiteDark['--border-subtle'],
  '--border-default': graphiteDark['--border-default'],
  '--brand-primary': graphiteDark['--brand-primary'],
  '--brand-primary-hover': graphiteDark['--brand-primary-hover'],
  '--button-primary-text': graphiteDark['--button-primary-text'],
}

/** Subtle cascade offsets (~100–200ms scroll equivalent). */
export const HERO_DEMO_THEME_CASCADE: Partial<
  Record<HeroDemoThemeTokenKey, number>
> = {
  '--app-background': 0,
  '--surface-primary': 0.04,
  '--surface-secondary': 0.06,
  '--sidebar-background': 0.1,
  '--sidebar-border': 0.12,
  '--sidebar-text': 0.14,
  '--sidebar-text-muted': 0.14,
  '--sidebar-item-hover': 0.12,
  '--sidebar-item-active-background': 0.12,
  '--sidebar-item-active-text': 0.14,
  '--text-primary': 0.16,
  '--text-secondary': 0.16,
  '--text-muted': 0.16,
  '--text-inverse': 0.14,
  '--border-subtle': 0.18,
  '--border-default': 0.18,
  '--brand-primary': 0.14,
  '--brand-primary-hover': 0.14,
  '--button-primary-text': 0.16,
}
