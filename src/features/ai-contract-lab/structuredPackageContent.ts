/**
 * Structured package content — compare attributes, never full legal sentences.
 */

export type PackageAssetType =
  | 'highlight_film'
  | 'main_film'
  | 'photo'
  | 'operator'
  | 'other_asset'
  | 'unknown'

export type PackageDeliveryMethod = 'digital' | 'physical' | 'unknown' | null

export type PackageContent = {
  type: 'asset' | 'delivery' | 'duration' | 'quantity' | 'format' | 'constraint' | 'unknown'
  subtype: PackageAssetType | null
  durationMinutesMax: number | null
  durationMinutesMin: number | null
  quantity: number | null
  deliveryMethod: PackageDeliveryMethod
  format: string | null
  constraints: string[]
  /** Original phrase (debug / display only — never used for equality). */
  raw: string
}

const STOP = new Set([
  'i',
  'oraz',
  'w',
  'z',
  'ze',
  'na',
  'do',
  'od',
  'ok',
  'a',
  'the',
  'of',
  'filmów',
  'filmu',
  'wersji',
])

/** Normalize free text → structured package content. */
export function parsePackageContent(text: string): PackageContent {
  const raw = text.trim()
  const t = raw.toLowerCase().normalize('NFC')

  const hasDigitalDelivery =
    /wersj\w*\s+elektroniczn|online|plik(?:u|iem)?\s+cyfrow|digital|pendrive|przekazan\w*.*elektron|elektron\w*\s+przekaz/i.test(
      t,
    )
  const digitalFormat = hasDigitalDelivery
    ? /pendrive/i.test(t)
      ? 'pendrive'
      : /plik(?:u|iem)?\s+cyfrow/i.test(t)
        ? 'digital_file'
        : 'digital'
    : null

  const dur = parseDurationBounds(t)
  const explicitAssetCue =
    /zmontowan\w*\s+film|film\s+ślub|film\s+slub|główn\w*\s+film|pełn\w*\s+film|reportaż\s+film|teledysk|teaser|zapowied|trailer|highlight/i.test(
      t,
    )

  if (hasDigitalDelivery && !explicitAssetCue && !dur) {
    return {
      type: 'delivery',
      subtype: null,
      durationMinutesMax: null,
      durationMinutesMin: null,
      quantity: null,
      deliveryMethod: 'digital',
      format: digitalFormat,
      constraints: [],
      raw,
    }
  }

  if (dur && !/film|teledysk|teaser|movie|reportaż/i.test(t)) {
    return {
      type: 'duration',
      subtype: null,
      durationMinutesMin: dur.min,
      durationMinutesMax: dur.max,
      quantity: null,
      deliveryMethod: null,
      format: null,
      constraints: [],
      raw,
    }
  }

  if (/teledysk|teaser|zapowied|trailer|highlight|filmow\w*\s+teledysk/i.test(t)) {
    return {
      type: 'asset',
      subtype: 'highlight_film',
      durationMinutesMin: dur?.min ?? null,
      durationMinutesMax: dur?.max ?? null,
      quantity: null,
      deliveryMethod: hasDigitalDelivery ? 'digital' : null,
      format: digitalFormat,
      constraints: [],
      raw,
    }
  }

  if (
    /film\s+ślub|film\s+slub|główn\w*\s+film|pełn\w*\s+film|reportaż\s+film|movie|15[\s-]?min/i.test(
      t,
    ) ||
    (/film/i.test(t) && !/teledysk|teaser/i.test(t))
  ) {
    return {
      type: 'asset',
      subtype: 'main_film',
      durationMinutesMin: dur?.min ?? null,
      durationMinutesMax: dur?.max ?? ( /15/.test(t) ? 15 : null),
      quantity: null,
      deliveryMethod: hasDigitalDelivery ? 'digital' : null,
      format: digitalFormat,
      constraints: [],
      raw,
    }
  }

  if (/operator|kamerzyst/i.test(t)) {
    const qty = /jeden|1\b|pojedync/i.test(t) ? 1 : /dwóch|2\b/i.test(t) ? 2 : null
    return {
      type: 'asset',
      subtype: 'operator',
      durationMinutesMin: null,
      durationMinutesMax: null,
      quantity: qty,
      deliveryMethod: null,
      format: null,
      constraints: [],
      raw,
    }
  }

  if (/zdjęc|fotograf|album|print/i.test(t)) {
    return {
      type: 'asset',
      subtype: 'photo',
      durationMinutesMin: null,
      durationMinutesMax: null,
      quantity: null,
      deliveryMethod: null,
      format: null,
      constraints: [],
      raw,
    }
  }

  // A pure delivery phrase stays a delivery item. If the same source span also
  // identifies an asset, that asset branch above retains the delivery/format
  // attributes instead of reducing the item to only "delivery".
  if (hasDigitalDelivery) {
    return {
      type: 'delivery',
      subtype: null,
      durationMinutesMax: dur?.max ?? null,
      durationMinutesMin: dur?.min ?? null,
      quantity: null,
      deliveryMethod: 'digital',
      format: digitalFormat,
      constraints: [],
      raw,
    }
  }

  return {
    type: 'unknown',
    subtype: 'unknown',
    durationMinutesMin: dur?.min ?? null,
    durationMinutesMax: dur?.max ?? null,
    quantity: null,
    deliveryMethod: null,
    format: null,
    constraints: tokenize(t),
    raw,
  }
}

export function parseDurationBounds(
  text: string,
): { min: number; max: number } | null {
  const t = text.toLowerCase().replace(/\u00a0/g, ' ')
  const m =
    t.match(/(\d+)\s*[-–—do]+\s*(\d+)\s*min/) ||
    t.match(/ok\.?\s*(\d+)\s*[-–—do]+\s*(\d+)\s*min/) ||
    t.match(/(\d+)\s*do\s*(\d+)\s*min/)
  if (m) {
    return { min: Number(m[1]), max: Number(m[2]) }
  }
  const single = t.match(/(\d+)\s*min/)
  if (single) {
    const n = Number(single[1])
    return { min: n, max: n }
  }
  return null
}

function tokenize(text: string): string[] {
  return text
    .replace(/[„”"'`.,;:!?()]/g, ' ')
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && !STOP.has(x))
}

export type StructuredPackageCompareStatus =
  | 'UNCHANGED'
  | 'REPLACEMENT'
  | 'DOCUMENT_ONLY'
  | 'REVIEW'

/**
 * Compare structured attributes only.
 * Delivery never matches asset; duration only matches duration/asset duration.
 */
export function compareStructuredPackageContent(input: {
  document: PackageContent
  canonical: PackageContent[]
}): {
  status: StructuredPackageCompareStatus
  matched: PackageContent | null
  reason: string
} {
  const doc = input.document

  if (doc.type === 'delivery') {
    const match = input.canonical.find(
      (c) =>
        c.type === 'delivery' &&
        c.deliveryMethod != null &&
        c.deliveryMethod === doc.deliveryMethod,
    )
    if (match) {
      return {
        status: 'UNCHANGED',
        matched: match,
        reason: 'Delivery method matches structurally',
      }
    }
    return {
      status: 'DOCUMENT_ONLY',
      matched: null,
      reason: 'Delivery clause has no canonical delivery equivalent',
    }
  }

  if (doc.type === 'duration') {
    const match = input.canonical.find((c) => durationsCompatible(doc, c))
    if (match) {
      return {
        status: 'UNCHANGED',
        matched: match,
        reason: 'Duration bounds match',
      }
    }
    return {
      status: 'DOCUMENT_ONLY',
      matched: null,
      reason: 'Duration has no canonical equivalent',
    }
  }

  if (doc.type === 'asset' && doc.subtype && doc.subtype !== 'unknown') {
    const sameSubtype = input.canonical.filter(
      (c) => c.type === 'asset' && c.subtype === doc.subtype,
    )
    if (sameSubtype.length === 0) {
      return {
        status: 'DOCUMENT_ONLY',
        matched: null,
        reason: `No canonical asset of type ${doc.subtype}`,
      }
    }
    const best =
      sameSubtype.find((c) => durationsCompatible(doc, c)) ?? sameSubtype[0]!
    const wordingDiffers =
      normalizePhrase(best.raw) !== normalizePhrase(doc.raw)
    return {
      status: wordingDiffers ? 'REPLACEMENT' : 'UNCHANGED',
      matched: best,
      reason: wordingDiffers
        ? 'Same asset type, different wording'
        : 'Structured asset match',
    }
  }

  // Unknown — weak token overlap only within unknown/constraint
  let best: { c: PackageContent; score: number } | null = null
  for (const c of input.canonical) {
    if (c.type === 'delivery') continue
    const score = jaccard(doc.constraints, c.constraints)
    if (!best || score > best.score) best = { c, score }
  }
  if (!best || best.score < 0.5) {
    return {
      status: 'DOCUMENT_ONLY',
      matched: null,
      reason: 'No structured canonical equivalent',
    }
  }
  if (best.score >= 0.8) {
    return {
      status: 'UNCHANGED',
      matched: best.c,
      reason: 'Weak structured match',
    }
  }
  return {
    status: 'REVIEW',
    matched: best.c,
    reason: 'Ambiguous structured package match',
  }
}

function durationsCompatible(a: PackageContent, b: PackageContent): boolean {
  if (a.durationMinutesMax == null && b.durationMinutesMax == null) return true
  if (a.durationMinutesMax == null || b.durationMinutesMax == null) {
    // One has duration, other asset without — still same subtype OK
    return a.subtype != null && a.subtype === b.subtype
  }
  return (
    a.durationMinutesMax === b.durationMinutesMax &&
    (a.durationMinutesMin ?? a.durationMinutesMax) ===
      (b.durationMinutesMin ?? b.durationMinutesMax)
  )
}

function normalizePhrase(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[„”"'`.,;:!?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const sa = new Set(a)
  const sb = new Set(b)
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter += 1
  return inter / new Set([...sa, ...sb]).size
}
