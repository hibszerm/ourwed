/**
 * Company signature stroke model + smooth rendering acceptance.
 * Run: npm run test:company-signature
 */

import {
  appendPoint,
  cleanupStrokePoints,
  drawSmoothSignatureStroke,
  expandBoundsForStroke,
  hasMeaningfulSignature,
  isDotStroke,
  isMeaningfulStroke,
  paintSignatureStrokes,
  strokeLength,
  toNormalizedPoint,
  totalSignatureLength,
  type SignaturePoint,
  type SignatureStroke,
} from './signatureStrokeModel'
import { findOpaqueBounds } from './signatureImageProcessing'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

/** Minimal canvas 2d mock that records drawing ops. */
function mockCtx() {
  const ops: string[] = []
  const ctx = {
    ops,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    save() {
      ops.push('save')
    },
    restore() {
      ops.push('restore')
    },
    beginPath() {
      ops.push('beginPath')
    },
    moveTo(x: number, y: number) {
      ops.push(`moveTo:${x.toFixed(2)},${y.toFixed(2)}`)
    },
    lineTo(x: number, y: number) {
      ops.push(`lineTo:${x.toFixed(2)},${y.toFixed(2)}`)
    },
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
      ops.push(
        `quad:${cpx.toFixed(2)},${cpy.toFixed(2)}->${x.toFixed(2)},${y.toFixed(2)}`,
      )
    },
    arc(x: number, y: number, r: number) {
      ops.push(`arc:${x.toFixed(2)},${y.toFixed(2)},r${r.toFixed(2)}`)
    },
    stroke() {
      ops.push('stroke')
    },
    fill() {
      ops.push('fill')
    },
  }
  return ctx as unknown as CanvasRenderingContext2D & { ops: string[] }
}

run('pointer stroke model creates and accumulates points', () => {
  let stroke: SignatureStroke = { points: [{ x: 0.1, y: 0.2 }] }
  stroke = appendPoint(stroke, { x: 0.2, y: 0.25 })
  stroke = appendPoint(stroke, { x: 0.35, y: 0.4 })
  assertEq(stroke.points.length, 3, 'points')
  assert(isMeaningfulStroke(stroke), 'meaningful')
})

run('multiple strokes + undo semantics via array slice', () => {
  const a: SignatureStroke = {
    points: [
      { x: 0, y: 0 },
      { x: 0.2, y: 0.1 },
      { x: 0.4, y: 0.2 },
    ],
  }
  const b: SignatureStroke = {
    points: [
      { x: 0.5, y: 0.5 },
      { x: 0.7, y: 0.55 },
      { x: 0.9, y: 0.6 },
    ],
  }
  let strokes = [a, b]
  assert(hasMeaningfulSignature(strokes), 'has content')
  strokes = strokes.slice(0, -1)
  assertEq(strokes.length, 1, 'undo')
  strokes = []
  assert(!hasMeaningfulSignature(strokes), 'clear')
})

run('empty / micro strokes rejected for save; dots renderable', () => {
  const tap: SignatureStroke = { points: [{ x: 0.5, y: 0.5 }] }
  assert(isDotStroke(tap), 'dot')
  assert(isMeaningfulStroke(tap), 'dot meaningful for render')
  assert(!hasMeaningfulSignature([tap]), 'dot alone not enough to save')
  const micro: SignatureStroke = {
    points: [
      { x: 0.5, y: 0.5 },
      { x: 0.501, y: 0.501 },
    ],
  }
  assert(!hasMeaningfulSignature([micro]), 'micro alone')
})

run('normalized coordinates stay in 0–1 after clamp', () => {
  const p = toNormalizedPoint(150, 80, {
    left: 100,
    top: 50,
    width: 200,
    height: 100,
  })
  assertEq(p.x, 0.25, 'x')
  assertEq(p.y, 0.3, 'y')
  const outside = toNormalizedPoint(-10, 999, {
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  })
  assertEq(outside.x, 0, 'clamp x')
  assertEq(outside.y, 1, 'clamp y')
})

run('responsive redraw uses same normalized strokes', () => {
  const stroke: SignatureStroke = {
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.8 },
    ],
  }
  const len = strokeLength(stroke)
  assert(Math.abs(len - Math.hypot(0.8, 0.6)) < 1e-9, 'length')
  assertEq(totalSignatureLength([stroke]), len, 'total')
})

run('smooth renderer: zero / one / two / many points', () => {
  const bounds = { width: 100, height: 100 }

  const empty = mockCtx()
  drawSmoothSignatureStroke(empty, [], bounds)
  assert(!empty.ops.includes('stroke') && !empty.ops.includes('fill'), 'zero')

  const one = mockCtx()
  drawSmoothSignatureStroke(one, [{ x: 0.5, y: 0.5 }], bounds, {
    lineWidth: 4,
  })
  assert(one.ops.some((o) => o.startsWith('arc:')), 'dot arc')
  assert(one.ops.includes('fill'), 'dot fill')

  const two = mockCtx()
  drawSmoothSignatureStroke(
    two,
    [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.9 },
    ],
    bounds,
  )
  assert(two.ops.some((o) => o.startsWith('lineTo:')), 'two-point line')
  assert(two.ops.includes('stroke'), 'two stroke')

  const many = mockCtx()
  const pts: SignaturePoint[] = [
    { x: 0.1, y: 0.2 },
    { x: 0.3, y: 0.8 },
    { x: 0.5, y: 0.2 },
    { x: 0.9, y: 0.5 },
  ]
  drawSmoothSignatureStroke(many, pts, bounds)
  assert(many.ops.some((o) => o.startsWith('quad:')), 'quadratic smoothing')
  assert(many.ops.includes('stroke'), 'many stroke')
  const lastQuad = [...many.ops].reverse().find((o) => o.startsWith('quad:'))
  assert(Boolean(lastQuad?.includes('90.00,50.00')), 'reaches last point')
})

run('point cleanup removes duplicates and tiny jitter, keeps ends', () => {
  const raw: SignaturePoint[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0.0005, y: 0 },
    { x: 0.2, y: 0.1 },
    { x: 0.2004, y: 0.1002 },
    { x: 0.8, y: 0.9 },
  ]
  const cleaned = cleanupStrokePoints(raw)
  assertEq(cleaned[0]!.x, 0, 'first')
  assertEq(cleaned[cleaned.length - 1]!.x, 0.8, 'last')
  assert(cleaned.length < raw.length, 'reduced')
  assert(cleaned.length >= 3, 'curve preserved')
})

run('expandBoundsForStroke pads round caps', () => {
  const expanded = expandBoundsForStroke(
    { minX: 10, minY: 10, maxX: 20, maxY: 20 },
    4,
    100,
    100,
  )
  assert(expanded.minX < 10, 'pad left')
  assert(expanded.minY < 10, 'pad top')
  assert(expanded.maxX > 20, 'pad right')
  assert(expanded.maxY > 20, 'pad bottom')
})

run('paintSignatureStrokes uses drawSmoothSignatureStroke (no polyline loop)', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const model = readFileSync(
    resolve('src/features/company/signature/signatureStrokeModel.ts'),
    'utf8',
  )
  assert(model.includes('quadraticCurveTo'), 'smooth algorithm')
  assert(model.includes('drawSmoothSignatureStroke'), 'shared fn')
  assert(model.includes('cleanupStrokePoints'), 'cleanup')
  // paintSignatureStrokes must call drawSmoothSignatureStroke, not lineTo loops
  const paintIdx = model.indexOf('export function paintSignatureStrokes')
  const paintBody = model.slice(paintIdx, paintIdx + 500)
  assert(paintBody.includes('drawSmoothSignatureStroke'), 'paint delegates')
  assert(!paintBody.includes('lineTo('), 'paint has no lineTo')

  const pad = readFileSync(
    resolve('src/features/company/signature/SignaturePad.tsx'),
    'utf8',
  )
  assert(pad.includes('paintSignatureStrokes'), 'live uses shared')
  assert(pad.includes('requestAnimationFrame'), 'raf')
  assert(pad.includes('getCoalescedEvents'), 'coalesced')
  assert(pad.includes('cancelAnimationFrame'), 'cleanup raf')
  // export path uses same paintSignatureStrokes
  const exportIdx = pad.indexOf('exportCanvas:')
  const exportBody = pad.slice(exportIdx, exportIdx + 600)
  assert(exportBody.includes('paintSignatureStrokes'), 'export uses shared')
})

run('crop bounds keep opaque ink and reject empty', () => {
  const width = 20
  const height = 10
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 3; y <= 6; y++) {
    for (let x = 5; x <= 8; x++) {
      const i = (y * width + x) * 4
      data[i] = 20
      data[i + 1] = 20
      data[i + 2] = 20
      data[i + 3] = 255
    }
  }
  const bounds = findOpaqueBounds({
    data,
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData)
  assert(bounds != null, 'bounds')
  assertEq(bounds!.minX, 5, 'minX')
  assertEq(bounds!.minY, 3, 'minY')
  assertEq(bounds!.maxX, 8, 'maxX')
  assertEq(bounds!.maxY, 6, 'maxY')

  const empty = findOpaqueBounds({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData)
  assertEq(empty, null, 'empty rejected')
})

run('service path conventions exist in source', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const svc = readFileSync(
    resolve('src/lib/api/companyDetailsService.ts'),
    'utf8',
  )
  assert(svc.includes('saveSignature'), 'saveSignature')
  assert(svc.includes('deleteSignature'), 'deleteSignature')
  assert(svc.includes('getSignedUrl'), 'signed url')

  const ui = readFileSync(
    resolve('src/features/company/signature/CompanySignatureSection.tsx'),
    'utf8',
  )
  assert(ui.includes('Narysuj podpis'), 'draw CTA')
  assert(ui.includes('Zapisz podpis'), 'save')

  const padCss = readFileSync(
    resolve('src/features/company/signature/SignaturePad.module.css'),
    'utf8',
  )
  assert(padCss.includes('touch-action: none'), 'no scroll while drawing')

  const page = readFileSync(resolve('src/pages/CompanyDetailsPage.tsx'), 'utf8')
  assert(page.includes('CompanySignatureSection'), 'integrated')
})

// silence unused import when tree-shaken in some runners
void paintSignatureStrokes

if (!process.exitCode) {
  console.log('\nAll company-signature tests passed.')
}
