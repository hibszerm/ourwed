/**
 * PNG crop / normalize for company signatures (transparent background).
 */

import {
  defaultSignatureLineWidth,
  expandBoundsForStroke,
} from './signatureStrokeModel'

const MAX_WIDTH = 1200
const MAX_HEIGHT = 500
const MARGIN_RATIO = 0.06
const ALPHA_THRESHOLD = 8

export type SignatureProcessError =
  | 'empty'
  | 'invalid'
  | 'too_large'
  | 'unsupported_type'

export class SignatureImageError extends Error {
  readonly code: SignatureProcessError
  constructor(code: SignatureProcessError, message: string) {
    super(message)
    this.code = code
  }
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new SignatureImageError('invalid', 'Nie udało się odczytać obrazu.'))
    }
    img.src = url
  })
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new SignatureImageError('invalid', 'Nie udało się wyeksportować PNG.'),
          )
          return
        }
        resolve(blob)
      },
      'image/png',
    )
  })
}

/**
 * Find bounding box of non-transparent pixels.
 * Returns null when the image is effectively empty.
 */
export function findOpaqueBounds(
  imageData: ImageData,
  alphaThreshold = ALPHA_THRESHOLD,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { data, width, height } = imageData
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]!
      if (a > alphaThreshold) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null
  return { minX, minY, maxX, maxY }
}

/**
 * Crop transparent whitespace, add margin, fit within max dimensions.
 * Does not upscale small images.
 */
export async function processSignaturePngBlob(
  source: Blob,
): Promise<Blob> {
  const img = await loadImageFromBlob(source)
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  if (srcW < 2 || srcH < 2) {
    throw new SignatureImageError('empty', 'Podpis jest pusty.')
  }

  const probe = document.createElement('canvas')
  probe.width = srcW
  probe.height = srcH
  const pctx = probe.getContext('2d')
  if (!pctx) {
    throw new SignatureImageError('invalid', 'Brak kontekstu canvas.')
  }
  pctx.clearRect(0, 0, srcW, srcH)
  pctx.drawImage(img, 0, 0)
  const rawBounds = findOpaqueBounds(pctx.getImageData(0, 0, srcW, srcH))
  if (!rawBounds) {
    throw new SignatureImageError('empty', 'Narysuj podpis przed zapisaniem.')
  }

  // Pad for round caps / AA so smooth stroke ends are not clipped.
  const strokePad = defaultSignatureLineWidth(srcW)
  const bounds = expandBoundsForStroke(rawBounds, strokePad, srcW, srcH)

  const contentW = bounds.maxX - bounds.minX + 1
  const contentH = bounds.maxY - bounds.minY + 1
  const margin = Math.max(
    4,
    Math.round(Math.max(contentW, contentH) * MARGIN_RATIO),
  )

  let outW = contentW + margin * 2
  let outH = contentH + margin * 2
  const scale = Math.min(1, MAX_WIDTH / outW, MAX_HEIGHT / outH)
  outW = Math.max(1, Math.round(outW * scale))
  outH = Math.max(1, Math.round(outH * scale))

  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const octx = out.getContext('2d')
  if (!octx) {
    throw new SignatureImageError('invalid', 'Brak kontekstu canvas.')
  }
  octx.clearRect(0, 0, outW, outH)
  octx.drawImage(
    probe,
    bounds.minX,
    bounds.minY,
    contentW,
    contentH,
    Math.round(margin * scale),
    Math.round(margin * scale),
    Math.round(contentW * scale),
    Math.round(contentH * scale),
  )

  return canvasToPngBlob(out)
}

export async function exportCanvasSignaturePng(
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  const blob = await canvasToPngBlob(canvas)
  return processSignaturePngBlob(blob)
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export async function normalizeUploadedSignatureFile(
  file: File,
): Promise<File> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new SignatureImageError(
      'too_large',
      'Plik jest za duży (maks. 5 MB).',
    )
  }
  const type = file.type.toLowerCase()
  if (type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    throw new SignatureImageError(
      'unsupported_type',
      'SVG nie jest obsługiwane. Wgraj PNG.',
    )
  }
  if (
    type &&
    type !== 'image/png' &&
    type !== 'image/jpeg' &&
    type !== 'image/jpg' &&
    type !== 'image/webp' &&
    type !== 'application/octet-stream'
  ) {
    throw new SignatureImageError(
      'unsupported_type',
      'Obsługiwane formaty: PNG, JPEG, WebP.',
    )
  }

  const processed = await processSignaturePngBlob(file)
  return new File([processed], 'signature.png', { type: 'image/png' })
}
