/**
 * Product shell identifier used by AppLayout / Sidebar CSS.
 * 'v3' is the legacy internal name for the Modern floating shell.
 * OurWed authenticated shell is always v3 (Modern).
 */
export type AppShellPresentation = 'v3'

/**
 * Application-wide shell. Authenticated AppLayout routes always use v3.
 * Public/auth pages do not use AppLayout.
 */
export function resolveActiveShellPresentation(): AppShellPresentation {
  return 'v3'
}
