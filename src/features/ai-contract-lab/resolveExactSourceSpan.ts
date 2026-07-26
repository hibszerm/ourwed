/**
 * Resolve AI-proposed source text to an exact contiguous substring
 * of the original anchor. Never trust AI text as the final patch source.
 */

export type SourceSpanCandidate = {
  exactSourceText: string
  start: number
  end: number
}

export type SourceSpanResolution =
  | {
      status: 'exact'
      exactSourceText: string
      start: number
      end: number
    }
  | {
      status: 'normalized_exact'
      exactSourceText: string
      start: number
      end: number
      normalizationUsed: string[]
    }
  | {
      status: 'ambiguous'
      candidates: SourceSpanCandidate[]
    }
  | {
      status: 'not_found'
    }

const MAX_SAFE_VALUE_SPAN = 80
const MAX_ELLIPSIS_GAP = 120

/** Legal / boilerplate tokens that must not be swept into an auto value span. */
const LEGAL_BETWEEN_RE =
  /\b(obejmując\w*|zamieszkał\w*|zgodnie|niniejsz\w*|świadcz\w*|zobowiąz\w*|reportaż\w*|przyjęcia|umow\w*|klauzul\w*)\b/i

const ELLIPSIS_RE = /\.\.\.|…/g

function isSafeValueSpan(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.length > MAX_SAFE_VALUE_SPAN) return false
  if (LEGAL_BETWEEN_RE.test(trimmed)) return false
  // Multi-clause between fragments is not a value
  if (trimmed.includes(';')) return false
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length > 8) return false
  return true
}

function replaceQuotes(ch: string): string {
  if ('“”„‟'.includes(ch)) return '"'
  if ('‘’‚‛'.includes(ch)) return "'"
  return ch
}

type LocateMap = {
  normalized: string
  /** original index for each normalized character */
  map: number[]
  normalizationUsed: string[]
}

/** Build a locate map with only allowed normalizations. */
export function buildLocateMap(anchorText: string): LocateMap {
  const nfc = anchorText.normalize('NFC')
  const normalizationUsed: string[] = []
  if (nfc !== anchorText) normalizationUsed.push('nfc')

  let normalized = ''
  const map: number[] = []
  let i = 0
  let usedNbsp = false
  let usedWs = false
  let usedQuotes = false

  while (i < nfc.length) {
    const ch = nfc[i]!
    if (ch === '\u00a0' || ch === '\u202f') {
      usedNbsp = true
      // treat as space; collapse with surrounding whitespace below
      let j = i
      while (
        j < nfc.length &&
        (nfc[j] === '\u00a0' ||
          nfc[j] === '\u202f' ||
          nfc[j] === ' ' ||
          nfc[j] === '\t' ||
          nfc[j] === '\r' ||
          nfc[j] === '\n' ||
          nfc[j] === '\f')
      ) {
        j += 1
      }
      normalized += ' '
      map.push(i)
      usedWs = j > i + 1
      i = j
      continue
    }
    if (
      ch === ' ' ||
      ch === '\t' ||
      ch === '\r' ||
      ch === '\n' ||
      ch === '\f'
    ) {
      let j = i
      while (
        j < nfc.length &&
        (nfc[j] === ' ' ||
          nfc[j] === '\t' ||
          nfc[j] === '\r' ||
          nfc[j] === '\n' ||
          nfc[j] === '\f' ||
          nfc[j] === '\u00a0' ||
          nfc[j] === '\u202f')
      ) {
        if (nfc[j] === '\u00a0' || nfc[j] === '\u202f') usedNbsp = true
        j += 1
      }
      if (j > i + 1 || ch !== ' ') usedWs = true
      normalized += ' '
      map.push(i)
      i = j
      continue
    }
    const q = replaceQuotes(ch)
    if (q !== ch) usedQuotes = true
    normalized += q
    map.push(i)
    i += 1
  }

  if (usedNbsp) normalizationUsed.push('nbsp')
  if (usedWs) normalizationUsed.push('whitespace')
  if (usedQuotes) normalizationUsed.push('quotes')

  return { normalized, map, normalizationUsed }
}

function normalizeQuery(text: string): string {
  return buildLocateMap(text).normalized
}

function sliceFromMap(
  anchorText: string,
  locate: LocateMap,
  normStart: number,
  normEndExclusive: number,
): SourceSpanCandidate | null {
  if (normStart < 0 || normEndExclusive <= normStart) return null
  if (normEndExclusive > locate.map.length) return null
  const start = locate.map[normStart]!
  const lastOrig = locate.map[normEndExclusive - 1]!
  const end = lastOrig + 1
  return {
    exactSourceText: anchorText.slice(start, end),
    start,
    end,
  }
}

function findAllNormalized(
  locate: LocateMap,
  query: string,
): Array<{ normStart: number; normEnd: number }> {
  const q = normalizeQuery(query)
  if (!q) return []
  const hits: Array<{ normStart: number; normEnd: number }> = []
  let from = 0
  while (from <= locate.normalized.length) {
    const idx = locate.normalized.indexOf(q, from)
    if (idx < 0) break
    hits.push({ normStart: idx, normEnd: idx + q.length })
    from = idx + 1
  }
  return hits
}

function findExactLiteral(anchorText: string, proposed: string): SourceSpanResolution {
  if (!proposed) return { status: 'not_found' }
  const hits: SourceSpanCandidate[] = []
  let from = 0
  while (from <= anchorText.length) {
    const idx = anchorText.indexOf(proposed, from)
    if (idx < 0) break
    hits.push({
      exactSourceText: anchorText.slice(idx, idx + proposed.length),
      start: idx,
      end: idx + proposed.length,
    })
    from = idx + 1
  }
  if (hits.length === 0) return { status: 'not_found' }
  if (hits.length > 1) return { status: 'ambiguous', candidates: hits }
  return {
    status: 'exact',
    exactSourceText: hits[0]!.exactSourceText,
    start: hits[0]!.start,
    end: hits[0]!.end,
  }
}

function containsEllipsis(text: string): boolean {
  return /\.\.\.|…/.test(text)
}

/**
 * Ellipsis proposals: locate ordered literal fragments, then prefer a narrow
 * value span between them — never use a broad legal phrase as the patch source.
 */
function resolveEllipsisSpan(
  anchorText: string,
  proposedSourceText: string,
): SourceSpanResolution {
  const fragments = proposedSourceText
    .split(ELLIPSIS_RE)
    .map((f) => f.trim())
    .filter(Boolean)
  if (fragments.length < 2) return { status: 'not_found' }

  const locate = buildLocateMap(anchorText)
  type Ordered = {
    firstNormStart: number
    lastNormEnd: number
    betweenNormStart: number
    betweenNormEnd: number
  }
  const ordered: Ordered[] = []

  function searchFrom(fragIndex: number, cursor: number, state: Ordered | null) {
    if (fragIndex >= fragments.length) {
      if (state) ordered.push(state)
      return
    }
    const frag = fragments[fragIndex]!
    const q = normalizeQuery(frag)
    if (!q) return
    let from = cursor
    while (from <= locate.normalized.length) {
      const idx = locate.normalized.indexOf(q, from)
      if (idx < 0) break
      const end = idx + q.length
      if (fragIndex === 0) {
        searchFrom(1, end, {
          firstNormStart: idx,
          lastNormEnd: end,
          betweenNormStart: end,
          betweenNormEnd: end,
        })
      } else if (state) {
        const next: Ordered = {
          firstNormStart: state.firstNormStart,
          lastNormEnd: end,
          betweenNormStart: state.betweenNormStart,
          betweenNormEnd: idx,
        }
        if (fragIndex === fragments.length - 1) {
          ordered.push(next)
        } else {
          searchFrom(fragIndex + 1, end, {
            ...next,
            betweenNormEnd: idx,
          })
        }
      }
      from = idx + 1
      // Limit branching for performance
      if (from - cursor > 500 && fragIndex === 0) break
    }
  }

  searchFrom(0, 0, null)

  // Deduplicate by original range
  const unique = new Map<string, Ordered>()
  for (const o of ordered) {
    const cand = sliceFromMap(
      anchorText,
      locate,
      o.firstNormStart,
      o.lastNormEnd,
    )
    if (!cand) continue
    const gap = cand.end - cand.start
    if (gap > MAX_ELLIPSIS_GAP * 2) continue
    unique.set(`${cand.start}:${cand.end}`, o)
  }

  if (unique.size === 0) return { status: 'not_found' }
  function betweenCandidate(o: Ordered): SourceSpanCandidate | null {
    const between = sliceFromMap(
      anchorText,
      locate,
      o.betweenNormStart,
      o.betweenNormEnd,
    )
    if (!between) return null
    const trimmed = between.exactSourceText.trim()
    if (!isSafeValueSpan(trimmed)) return null
    const start = anchorText.indexOf(trimmed, between.start)
    if (start < 0) return null
    const region = anchorText.slice(between.start, between.end)
    if (region.indexOf(trimmed) !== region.lastIndexOf(trimmed)) return null
    return {
      exactSourceText: trimmed,
      start,
      end: start + trimmed.length,
    }
  }

  if (unique.size > 1) {
    const candidates: SourceSpanCandidate[] = []
    for (const o of unique.values()) {
      const c = betweenCandidate(o)
      if (c) candidates.push(c)
      else {
        const broad = sliceFromMap(
          anchorText,
          locate,
          o.firstNormStart,
          o.lastNormEnd,
        )
        if (broad) candidates.push(broad)
      }
    }
    return {
      status: 'ambiguous',
      candidates,
    }
  }

  const only = [...unique.values()][0]!
  const value = betweenCandidate(only)
  if (value) {
    return {
      status: 'normalized_exact',
      exactSourceText: value.exactSourceText,
      start: value.start,
      end: value.end,
      normalizationUsed: ['ellipsis_value_span', ...locate.normalizationUsed],
    }
  }

  // Never use first→last as a patch when it would sweep legal wording
  const broad = sliceFromMap(
    anchorText,
    locate,
    only.firstNormStart,
    only.lastNormEnd,
  )
  return {
    status: 'ambiguous',
    candidates: broad ? [broad] : [],
  }
}

function resolveWithPrefixSuffix(
  anchorText: string,
  proposedValueHint: string | null | undefined,
  prefixContext?: string | null,
  suffixContext?: string | null,
): SourceSpanResolution | null {
  if (!prefixContext?.trim() && !suffixContext?.trim()) return null
  const locate = buildLocateMap(anchorText)

  const prefixHits = prefixContext?.trim()
    ? findAllNormalized(locate, prefixContext.trim())
    : [{ normStart: 0, normEnd: 0 }]
  const suffixHits = suffixContext?.trim()
    ? findAllNormalized(locate, suffixContext.trim())
    : [{ normStart: locate.normalized.length, normEnd: locate.normalized.length }]

  const candidates: SourceSpanCandidate[] = []
  for (const p of prefixHits) {
    for (const s of suffixHits) {
      if (s.normStart < p.normEnd) continue
      const between = sliceFromMap(anchorText, locate, p.normEnd, s.normStart)
      if (!between) continue
      const trimmed = between.exactSourceText.trim()
      if (!trimmed || trimmed.length > MAX_SAFE_VALUE_SPAN) continue
      const start = anchorText.indexOf(trimmed, between.start)
      if (start < 0) continue
      if (
        proposedValueHint &&
        normalizeQuery(trimmed) === normalizeQuery(proposedValueHint)
      ) {
        // Prefer spans that currently look like the old value region
      }
      candidates.push({
        exactSourceText: trimmed,
        start,
        end: start + trimmed.length,
      })
    }
  }

  const uniq = new Map(candidates.map((c) => [`${c.start}:${c.end}`, c]))
  if (uniq.size === 0) return null
  if (uniq.size > 1) return { status: 'ambiguous', candidates: [...uniq.values()] }
  const only = [...uniq.values()][0]!
  return {
    status: 'normalized_exact',
    exactSourceText: only.exactSourceText,
    start: only.start,
    end: only.end,
    normalizationUsed: ['prefix_suffix', ...locate.normalizationUsed],
  }
}

/**
 * Resolve AI-proposed source text against the real anchor.
 * Always returns an exact slice of `anchorText` when status is exact/normalized_exact.
 */
export function resolveExactSourceSpan(
  anchorText: string,
  proposedSourceText: string,
  options?: {
    prefixContext?: string | null
    suffixContext?: string | null
    proposedValue?: string | null
  },
): SourceSpanResolution {
  const proposed = proposedSourceText ?? ''
  if (!anchorText || !proposed.trim()) return { status: 'not_found' }

  const hasCtx =
    Boolean(options?.prefixContext?.trim()) ||
    Boolean(options?.suffixContext?.trim())

  // 1) Prefer locating the proposed value among duplicates using surrounding context
  if (hasCtx) {
    const contextual = resolveSourceTextWithContext(
      anchorText,
      proposed,
      options?.prefixContext,
      options?.suffixContext,
    )
    if (contextual.status === 'exact' || contextual.status === 'normalized_exact') {
      return contextual
    }
    // Fall through if context didn't uniquely locate the value
  }

  // 2) Prefer prefix/suffix value-span when provided (between prefix and suffix)
  const viaCtx = resolveWithPrefixSuffix(
    anchorText,
    options?.proposedValue,
    options?.prefixContext,
    options?.suffixContext,
  )
  if (viaCtx && (viaCtx.status === 'exact' || viaCtx.status === 'normalized_exact')) {
    return viaCtx
  }

  // 3) Exact literal
  const exact = findExactLiteral(anchorText, proposed)
  if (exact.status === 'exact') return exact
  if (exact.status === 'ambiguous') {
    // With context still ambiguous → true ambiguity inside this anchor
    if (hasCtx && viaCtx?.status === 'ambiguous') return viaCtx
    return exact
  }

  // 4) Ellipsis proposals — never use literally
  if (containsEllipsis(proposed)) {
    return resolveEllipsisSpan(anchorText, proposed)
  }

  // 5) Normalized exact locate
  const locate = buildLocateMap(anchorText)
  const hits = findAllNormalized(locate, proposed)
  if (hits.length === 0) return { status: 'not_found' }
  const candidates = hits
    .map((h) => sliceFromMap(anchorText, locate, h.normStart, h.normEnd))
    .filter((c): c is SourceSpanCandidate => c != null)
  if (candidates.length === 0) return { status: 'not_found' }
  if (candidates.length > 1) {
    if (hasCtx) {
      const filtered = filterCandidatesByContext(
        anchorText,
        candidates,
        options?.prefixContext,
        options?.suffixContext,
      )
      if (filtered.length === 1) {
        const only = filtered[0]!
        return {
          status: 'normalized_exact',
          exactSourceText: only.exactSourceText,
          start: only.start,
          end: only.end,
          normalizationUsed: ['context_disambiguation', ...locate.normalizationUsed],
        }
      }
      if (filtered.length > 1) return { status: 'ambiguous', candidates: filtered }
    }
    return { status: 'ambiguous', candidates }
  }

  const only = candidates[0]!
  if (locate.normalizationUsed.length === 0 && only.exactSourceText === proposed) {
    return {
      status: 'exact',
      exactSourceText: only.exactSourceText,
      start: only.start,
      end: only.end,
    }
  }
  return {
    status: 'normalized_exact',
    exactSourceText: only.exactSourceText,
    start: only.start,
    end: only.end,
    normalizationUsed: locate.normalizationUsed,
  }
}

/** Prefer occurrences of sourceText preceded/followed by context snippets. */
function resolveSourceTextWithContext(
  anchorText: string,
  sourceText: string,
  prefixContext?: string | null,
  suffixContext?: string | null,
): SourceSpanResolution {
  const exact = findExactLiteral(anchorText, sourceText)
  let candidates: SourceSpanCandidate[] = []
  if (exact.status === 'exact') {
    candidates = [
      {
        exactSourceText: exact.exactSourceText,
        start: exact.start,
        end: exact.end,
      },
    ]
  } else if (exact.status === 'ambiguous') {
    candidates = exact.candidates
  } else {
    const locate = buildLocateMap(anchorText)
    candidates = findAllNormalized(locate, sourceText)
      .map((h) => sliceFromMap(anchorText, locate, h.normStart, h.normEnd))
      .filter((c): c is SourceSpanCandidate => c != null)
  }

  if (candidates.length === 0) return { status: 'not_found' }
  if (candidates.length === 1) {
    const only = candidates[0]!
    return {
      status: 'exact',
      exactSourceText: only.exactSourceText,
      start: only.start,
      end: only.end,
    }
  }

  const filtered = filterCandidatesByContext(
    anchorText,
    candidates,
    prefixContext,
    suffixContext,
  )
  if (filtered.length === 1) {
    const only = filtered[0]!
    return {
      status: 'normalized_exact',
      exactSourceText: only.exactSourceText,
      start: only.start,
      end: only.end,
      normalizationUsed: ['context_disambiguation'],
    }
  }
  if (filtered.length > 1) return { status: 'ambiguous', candidates: filtered }
  return { status: 'ambiguous', candidates }
}

function filterCandidatesByContext(
  anchorText: string,
  candidates: SourceSpanCandidate[],
  prefixContext?: string | null,
  suffixContext?: string | null,
): SourceSpanCandidate[] {
  const prefix = prefixContext?.trim() ?? ''
  const suffix = suffixContext?.trim() ?? ''
  if (!prefix && !suffix) return candidates

  const prefixQ = prefix ? normalizeQuery(prefix) : ''
  const suffixQ = suffix ? normalizeQuery(suffix) : ''

  const scored = candidates.map((c) => {
    const before = anchorText.slice(Math.max(0, c.start - 80), c.start)
    const after = anchorText.slice(c.end, Math.min(anchorText.length, c.end + 80))
    const beforeN = normalizeQuery(before)
    const afterN = normalizeQuery(after)
    let score = 0
    let ok = true
    if (prefixQ) {
      if (beforeN.endsWith(prefixQ)) score += 2
      else if (beforeN.includes(prefixQ)) score += 1
      else ok = false
    }
    if (suffixQ) {
      if (afterN.startsWith(suffixQ)) score += 2
      else if (afterN.includes(suffixQ)) score += 1
      else ok = false
    }
    return { c, score, ok }
  })

  const matched = scored.filter((s) => s.ok)
  if (matched.length === 0) return []
  const best = Math.max(...matched.map((s) => s.score))
  return matched.filter((s) => s.score === best).map((s) => s.c)
}

/**
 * Validate a manually entered source span: must occur exactly once.
 */
export function validateManualSourceSpan(
  anchorText: string,
  exactSourceText: string,
): SourceSpanResolution {
  const trimmed = exactSourceText
  if (!trimmed) return { status: 'not_found' }
  return findExactLiteral(anchorText, trimmed)
}

export function isEllipsisProposal(text: string): boolean {
  return containsEllipsis(text)
}
