import {
  HERO_DEMO_GRAPHITE_TOKENS,
  HERO_DEMO_LIGHT_TOKENS,
  HERO_DEMO_THEME_CASCADE,
  HERO_DEMO_THEME_TOKEN_KEYS,
} from '@/features/landing-v2/hero/heroDemoThemeTokens'

type Rgba = { r: number; g: number; b: number; a: number }

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

function parseHex(hex: string): Rgba | null {
  const raw = hex.trim().replace('#', '')
  if (raw.length === 3) {
    const r = parseInt(raw[0]! + raw[0], 16)
    const g = parseInt(raw[1]! + raw[1], 16)
    const b = parseInt(raw[2]! + raw[2], 16)
    return { r, g, b, a: 1 }
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16)
    const g = parseInt(raw.slice(2, 4), 16)
    const b = parseInt(raw.slice(4, 6), 16)
    return { r, g, b, a: 1 }
  }
  return null
}

function parseRgbFn(color: string): Rgba | null {
  const m = color
    .trim()
    .match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
    )
  if (!m) return null
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] !== undefined ? Number(m[4]) : 1,
  }
}

function parseColor(color: string): Rgba | null {
  if (color.startsWith('#')) return parseHex(color)
  if (color.startsWith('rgb')) return parseRgbFn(color)
  return null
}

function formatColor({ r, g, b, a }: Rgba): string {
  const ri = Math.round(r)
  const gi = Math.round(g)
  const bi = Math.round(b)
  if (a >= 0.999) return `rgb(${ri}, ${gi}, ${bi})`
  return `rgba(${ri}, ${gi}, ${bi}, ${Number(a.toFixed(4))})`
}

function interpolateColor(from: string, to: string, t: number): string {
  const a = parseColor(from)
  const b = parseColor(to)
  if (!a || !b) return t < 0.5 ? from : to
  return formatColor({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  })
}

function localProgress(global: number, offset: number): number {
  if (global <= 0) return 0
  if (global >= 1) return 1
  const start = offset
  const span = 1 - start
  if (span <= 0) return global
  return clamp01((global - start) / span)
}

/** Interpolate marketing demo semantic tokens — one dashboard DOM, real Graphite dark values. */
export function interpolateHeroDemoTheme(progress: number): Record<string, string> {
  const t = clamp01(progress)
  const out: Record<string, string> = {}

  for (const key of HERO_DEMO_THEME_TOKEN_KEYS) {
    const offset = HERO_DEMO_THEME_CASCADE[key] ?? 0
    const local = localProgress(t, offset)
    out[key] = interpolateColor(
      HERO_DEMO_LIGHT_TOKENS[key],
      HERO_DEMO_GRAPHITE_TOKENS[key],
      local,
    )
  }

  return out
}

export function applyHeroDemoThemeToElement(el: HTMLElement, progress: number) {
  const vars = interpolateHeroDemoTheme(progress)
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value)
  }
}
