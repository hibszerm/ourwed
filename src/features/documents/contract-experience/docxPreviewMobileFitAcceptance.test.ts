/**
 * Mobile DOCX preview fit — scale A4 page to host width (no reflow / no h-pan).
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/contract-experience/docxPreviewMobileFitAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DOCX_MOBILE_PREVIEW_MQ,
  fitMobileDocxPreview,
  resetDocxPreviewFit,
} from './docxPreviewMobileFit'

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

assert(DOCX_MOBILE_PREVIEW_MQ.includes('767px'), 'mobile breakpoint 767')

const preview = source(
  'src/features/documents/contract-experience/ContractDocxPreview.tsx',
)
const css = source(
  'src/features/documents/contract-experience/ContractDocxPreview.module.css',
)
const fit = source(
  'src/features/documents/contract-experience/docxPreviewMobileFit.ts',
)

assert(preview.includes('fitMobileDocxPreview'), 'wires mobile fit')
assert(preview.includes('ResizeObserver'), 'recomputes on resize')
assert(fit.includes('transform'), 'uses transform scale')
assert(fit.includes('marginBottom'), 'collapses phantom height')
assert(fit.includes('section.docx'), 'measures rendered page')
assert(fit.includes('translateX'), 'centers with translateX')
assert(fit.includes("top left"), 'transform origin top left')
assert(!fit.includes("top center"), 'no top-center origin (causes right-shift)')
assert(!css.includes('touch-action: pan-x'), 'no horizontal pan gesture')
assert(
  css.includes('overflow-x: hidden'),
  'mobile clips horizontal overflow',
)
assert(
  css.includes('max-width: none'),
  'mobile keeps natural page width before scale',
)
assert(
  css.includes('margin-inline: 0'),
  'wrapper not margin-auto centered while overflowing',
)

// DOM fit simulation (jsdom-free minimal stubs).
const host = {
  clientWidth: 350,
  style: {} as CSSStyleDeclaration,
  querySelector(selector: string) {
    if (selector === '.docx-wrapper') return wrapper
    return null
  },
} as unknown as HTMLElement

const page = {
  offsetWidth: 794,
} as unknown as HTMLElement

const wrapperStyle: Record<string, string> = {}
const wrapper = {
  style: wrapperStyle,
  dataset: {} as DOMStringMap,
  scrollHeight: 1123,
  querySelector(selector: string) {
    if (selector === 'section.docx') return page
    return null
  },
  removeAttribute(name: string) {
    if (name === 'data-docx-fit-scale') delete wrapper.dataset.docxFitScale
    if (name === 'data-docx-fit-offset') delete wrapper.dataset.docxFitOffset
    if (name === 'data-docx-fit-visual-width')
      delete wrapper.dataset.docxFitVisualWidth
  },
} as unknown as HTMLElement

const originalMatchMedia = globalThis.matchMedia
const originalGetComputedStyle = globalThis.getComputedStyle

globalThis.matchMedia = ((query: string) =>
  ({
    matches: query.includes('767'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof matchMedia

globalThis.getComputedStyle = (() =>
  ({
    paddingLeft: '12px',
    paddingRight: '12px',
  })) as unknown as typeof getComputedStyle

const result = fitMobileDocxPreview(host)
assert(result !== null, 'returns fit result on mobile')
const fitResult = result!
const expectedScale = (350 - 24) / 794
assert(Math.abs(fitResult.scale - expectedScale) < 0.0001, 'scale = available/pageWidth')
assert(Math.abs(fitResult.visualWidth - 794 * expectedScale) < 0.0001, 'visual width')
assert(Math.abs(fitResult.offsetX) < 0.0001, 'exact fit → offsetX ≈ 0')
assert(Math.abs(fitResult.leftGap - fitResult.rightGap) < 0.0001, 'equal gaps')
assert(Math.abs(fitResult.leftGap) < 0.0001, 'no left empty void when fitting exactly')
assert(wrapperStyle.transformOrigin === 'top left', 'origin top left')
assert(
  wrapperStyle.transform.includes('translateX(') &&
    wrapperStyle.transform.includes('scale('),
  'translateX + scale transform',
)
assert(wrapperStyle.marginBottom.startsWith('-'), 'negative margin collapses phantom height')

// Non-exact fit (available wider than scaled page when scale capped… use smaller page)
;(page as { offsetWidth: number }).offsetWidth = 200
const loose = fitMobileDocxPreview(host)!
assert(loose.scale === 1, 'does not upscale past 1')
assert(Math.abs(loose.leftGap - loose.rightGap) < 0.0001, 'centered when scale=1')
assert(loose.leftGap > 0, 'equal side gaps when page narrower than host')

resetDocxPreviewFit(host)
assert(wrapperStyle.transform === '', 'reset clears transform')

globalThis.matchMedia = ((query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof matchMedia

wrapperStyle.transform = 'scale(0.5)'
const desktop = fitMobileDocxPreview(host)
assert(desktop === null, 'desktop does not scale')
assert(wrapperStyle.transform === '', 'desktop resets scale')

// Geometry table for common phone widths (padding 12+12).
globalThis.matchMedia = ((query: string) =>
  ({
    matches: query.includes('767'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof matchMedia
;(page as { offsetWidth: number }).offsetWidth = 794

const widths = [320, 375, 390, 393, 402, 430, 720, 767]
console.log('mobile fit geometry (pageWidth=794, padX=24):')
for (const w of widths) {
  ;(host as { clientWidth: number }).clientWidth = w
  const r = fitMobileDocxPreview(host)!
  const gapDelta = Math.abs(r.leftGap - r.rightGap)
  assert(gapDelta < 0.05, `${w}px unequal gaps`)
  console.log(
    `  ${w}: available=${r.availableWidth.toFixed(1)} scale=${r.scale.toFixed(4)} visual=${r.visualWidth.toFixed(1)} left=${r.leftGap.toFixed(1)} right=${r.rightGap.toFixed(1)}`,
  )
}

globalThis.matchMedia = originalMatchMedia
globalThis.getComputedStyle = originalGetComputedStyle

const previewPage = source('src/pages/WeddingContractPreviewPage.tsx')
assert(previewPage.includes('ContractReadyPreview'), 'ready preview retained')
assert(!previewPage.includes('startEditing'), 'edit CTA entry removed')

console.log('ok — docx preview mobile fit acceptance')
