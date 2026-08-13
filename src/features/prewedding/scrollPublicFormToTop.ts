/**
 * Scroll every plausible public-form scroller to the top.
 * `overflow-x: clip` on html/body/#root can make window.scrollTo a no-op.
 */
export function scrollPublicFormToTop(root?: HTMLElement | null): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.documentElement.scrollLeft = 0
  document.body.scrollTop = 0
  document.body.scrollLeft = 0

  const appRoot = document.getElementById('root')
  if (appRoot) {
    appRoot.scrollTop = 0
    appRoot.scrollLeft = 0
  }

  if (root) {
    root.scrollTop = 0
    root.scrollLeft = 0
    root.scrollIntoView({ block: 'start', inline: 'nearest' })
  }
}
