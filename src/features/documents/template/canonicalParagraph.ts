/**
 * One canonical paragraph text model for analysis AND generation.
 * Offsets are only valid in this representation.
 */

/** Normalize DOCX/XML visible text to a stable character stream. */
export function canonicalizeParagraphText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\u00a0/g, ' ') // NBSP
    .replace(/\u202f/g, ' ') // narrow NBSP
    .replace(/\u2007/g, ' ') // figure space
    .replace(/\t/g, ' ')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // smart double quotes
    .replace(/\u2013/g, '–') // en dash stay as en dash (normalize variants)
    .replace(/\u2014/g, '—')
}

/**
 * Extract + canonicalize text from a DOCX paragraph XML node (`<w:p>…</w:p>`).
 */
export function extractCanonicalParagraphText(paragraphXml: string): string {
  const parts: string[] = []
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(paragraphXml))) {
    parts.push(unescapeXml(m[1] ?? ''))
  }
  return canonicalizeParagraphText(parts.join(''))
}

export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Lightweight normalize for comparison without changing length semantics of already-canonical text. */
export function normalizeForMatch(text: string): string {
  return canonicalizeParagraphText(text).replace(/\s+/g, ' ').trim()
}

export interface DocxRunSlice {
  runIndex: number
  /** Raw (unescaped) text inside this run's w:t nodes, joined. */
  rawText: string
  /** Canonical form of rawText (may differ in length from raw). */
  canonicalText: string
}

export interface ParagraphCharMapEntry {
  /** Offset in the CANONICAL paragraph string. */
  globalOffset: number
  runIndex: number
  /** Offset within the run's canonical text. */
  localOffset: number
}

export interface ParagraphRunModel {
  /** Canonical paragraph text (offsets live here). */
  canonicalText: string
  runs: DocxRunSlice[]
  /** Map each canonical character to its run. */
  charMap: ParagraphCharMapEntry[]
}

/**
 * Build a character map over the CANONICAL paragraph string.
 * Multi-run slots are supported by walking this map.
 */
export function buildParagraphRunModel(paragraphXml: string): ParagraphRunModel {
  const runs: DocxRunSlice[] = []
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g
  let rm: RegExpExecArray | null
  let runIndex = 0
  while ((rm = runRe.exec(paragraphXml))) {
    const texts: string[] = []
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
    let tm: RegExpExecArray | null
    while ((tm = tRe.exec(rm[0]!))) {
      texts.push(unescapeXml(tm[1] ?? ''))
    }
    const rawText = texts.join('')
    runs.push({
      runIndex,
      rawText,
      canonicalText: canonicalizeParagraphText(rawText),
    })
    runIndex += 1
  }

  // Prefer concatenating canonical run texts so map aligns with
  // extractCanonicalParagraphText (which NFC-joins then canonicalizes whole).
  // Whole-paragraph canonicalize can differ slightly from per-run when
  // combining marks sit at run boundaries — use whole-paragraph as source of truth.
  const canonicalText = extractCanonicalParagraphText(paragraphXml)

  // Rebuild char map by walking canonical runs and aligning to canonicalText.
  // If per-run concat equals whole text, map 1:1. Otherwise fall back to
  // a single synthetic run covering the paragraph.
  const concatCanonical = runs.map((r) => r.canonicalText).join('')
  const charMap: ParagraphCharMapEntry[] = []

  if (concatCanonical === canonicalText) {
    let global = 0
    for (const run of runs) {
      for (let i = 0; i < run.canonicalText.length; i++) {
        charMap.push({
          globalOffset: global,
          runIndex: run.runIndex,
          localOffset: i,
        })
        global += 1
      }
    }
  } else {
    // Boundary combining-mark edge case — treat as one logical run for mapping.
    for (let i = 0; i < canonicalText.length; i++) {
      charMap.push({
        globalOffset: i,
        runIndex: 0,
        localOffset: i,
      })
    }
  }

  return { canonicalText, runs, charMap }
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx < 0) break
    count += 1
    from = idx + Math.max(1, needle.length)
  }
  return count
}
