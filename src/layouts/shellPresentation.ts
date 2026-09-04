import type { InterfaceStyle } from '@/features/interface-style/types'

/**
 * Product shell identifier used by AppLayout / Sidebar CSS.
 * 'v3' is the legacy internal name for the Modern floating shell.
 * Do not treat this as a per-route screen-presentation flag.
 */
export type AppShellPresentation = 'default' | 'v3'

/**
 * Application-wide shell. Independent from resolveScreenPresentation().
 * Authenticated AppLayout routes inherit this; public/auth pages do not use AppLayout.
 */
export function resolveActiveShellPresentation(
  interfaceStyle: InterfaceStyle,
): AppShellPresentation {
  return interfaceStyle === 'modern' ? 'v3' : 'default'
}
