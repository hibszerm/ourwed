/**
 * Company signature stroke model + crop bounds acceptance.
 * Run: npm run test:company-signature
 */

import {
  appendPoint,
  hasMeaningfulSignature,
  isMeaningfulStroke,
  strokeLength,
  toNormalizedPoint,
  totalSignatureLength,
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

run('empty / micro strokes rejected', () => {
  const tap: SignatureStroke = { points: [{ x: 0.5, y: 0.5 }] }
  assert(!isMeaningfulStroke(tap), 'single point')
  const micro: SignatureStroke = {
    points: [
      { x: 0.5, y: 0.5 },
      { x: 0.501, y: 0.501 },
    ],
  }
  assert(!isMeaningfulStroke(micro), 'micro')
  assert(!hasMeaningfulSignature([micro]), 'empty signature')
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
  // Length is coordinate-space invariant (normalized)
  const len = strokeLength(stroke)
  assert(Math.abs(len - Math.hypot(0.8, 0.6)) < 1e-9, 'length')
  assertEq(totalSignatureLength([stroke]), len, 'total')
})

run('crop bounds keep opaque ink and reject empty', () => {
  const width = 20
  const height = 10
  const data = new Uint8ClampedArray(width * height * 4)
  // ink at (5,3)–(8,6)
  for (let y = 3; y <= 6; y++) {
    for (let x = 5; x <= 8; x++) {
      const i = (y * width + x) * 4
      data[i] = 20
      data[i + 1] = 20
      data[i + 2] = 20
      data[i + 3] = 255
    }
  }
  const bounds = findOpaqueBounds({ data, width, height, colorSpace: 'srgb' } as ImageData)
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
  assert(svc.includes('removeStorageObject'), 'remove object')
  assert(svc.includes('signature_updated_at'), 'updated at')
  assert(
    !svc.includes("getPublicUrl(path)\n    const { data } = supabase.storage.from('document-files').getPublicUrl"),
    'no raw public url for private bucket',
  )

  const ui = readFileSync(
    resolve('src/features/company/signature/CompanySignatureSection.tsx'),
    'utf8',
  )
  assert(ui.includes('Narysuj podpis'), 'draw CTA')
  assert(ui.includes('Wgraj podpis'), 'upload CTA')
  assert(ui.includes('Zapisz podpis'), 'save')
  assert(ui.includes('Usuń'), 'delete')

  const padCss = readFileSync(
    resolve('src/features/company/signature/SignaturePad.module.css'),
    'utf8',
  )
  assert(padCss.includes('touch-action: none'), 'no scroll while drawing')

  const page = readFileSync(resolve('src/pages/CompanyDetailsPage.tsx'), 'utf8')
  assert(page.includes('CompanySignatureSection'), 'integrated')
  assert(!page.includes("onUpload('signature'"), 'no old signature file-only')
})

if (!process.exitCode) {
  console.log('\nAll company-signature tests passed.')
}
