/** Mobile DOCX preview: scale entire A4 page(s) to fit host width. */

export const DOCX_MOBILE_PREVIEW_MQ = '(max-width: 767px)'

export type DocxMobileFitResult = {
  scale: number
  pageWidth: number
  availableWidth: number
  visualWidth: number
  /** translateX applied after top-left scale origin (centers the visual page). */
  offsetX: number
  leftGap: number
  rightGap: number
}

export function resetDocxPreviewFit(host: HTMLElement): void {
  const wrapper = host.querySelector<HTMLElement>('.docx-wrapper')
  if (!wrapper) return
  wrapper.style.transform = ''
  wrapper.style.transformOrigin = ''
  wrapper.style.marginBottom = ''
  wrapper.removeAttribute('data-docx-fit-scale')
  wrapper.removeAttribute('data-docx-fit-offset')
  wrapper.removeAttribute('data-docx-fit-visual-width')
}

/**
 * Fit every rendered DOCX page into the preview host width as one scaled unit.
 * Desktop (above 767px): no-op / reset.
 *
 * Uses transform-origin: top left + translateX so the VISUAL scaled page is
 * centered in the host content box. (top-center origin on a left-aligned
 * overflowing A4 wrapper leaves a large empty gap on the left.)
 */
export function fitMobileDocxPreview(
  host: HTMLElement,
): DocxMobileFitResult | null {
  const wrapper = host.querySelector<HTMLElement>('.docx-wrapper')
  if (!wrapper) return null

  const media =
    typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia(DOCX_MOBILE_PREVIEW_MQ)
      : null
  if (!media?.matches) {
    resetDocxPreviewFit(host)
    return null
  }

  // Measure natural A4 layout before applying scale.
  wrapper.style.transform = 'none'
  wrapper.style.marginBottom = '0px'
  wrapper.style.transformOrigin = 'top left'

  const page = wrapper.querySelector<HTMLElement>('section.docx')
  if (!page) {
    resetDocxPreviewFit(host)
    return null
  }

  const pageWidth = page.offsetWidth
  const naturalHeight = wrapper.scrollHeight
  if (pageWidth <= 0 || naturalHeight <= 0) return null

  const styles = globalThis.getComputedStyle(host)
  const padX =
    (parseFloat(styles.paddingLeft) || 0) +
    (parseFloat(styles.paddingRight) || 0)
  const available = Math.max(0, host.clientWidth - padX)
  if (available <= 0) return null

  const scale = Math.min(1, available / pageWidth)
  const visualWidth = pageWidth * scale
  // Center the scaled visual page inside the usable host content width.
  const offsetX = (available - visualWidth) / 2

  wrapper.style.transformOrigin = 'top left'
  wrapper.style.transform = `translateX(${offsetX}px) scale(${scale})`
  // Collapse phantom layout height left by CSS transforms.
  wrapper.style.marginBottom = `${(scale - 1) * naturalHeight}px`
  wrapper.dataset.docxFitScale = String(scale)
  wrapper.dataset.docxFitOffset = String(offsetX)
  wrapper.dataset.docxFitVisualWidth = String(visualWidth)

  return {
    scale,
    pageWidth,
    availableWidth: available,
    visualWidth,
    offsetX,
    leftGap: offsetX,
    rightGap: available - visualWidth - offsetX,
  }
}
