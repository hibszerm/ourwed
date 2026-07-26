/**
 * Typed source-span fallback for Phase A/B.
 * Order: exact → unicode → whitespace → typed token → context-constrained → manual.
 * Never broad fuzzy search across the document.
 */

import {
  resolveExactSourceSpan,
  buildLocateMap,
  type SourceSpanResolution,
} from '@/features/ai-contract-lab/resolveExactSourceSpan'
import {
  parseFlexibleDate,
} from '@/features/ai-contract-lab/semanticValueEquality'

export type FlattenedAnchorText = {
  text: string
  segments: Array<{
    start: number
    end: number
    runId: string
    runStart: number
    runEnd: number
  }>
}

/** Flatten visible anchor text (single segment when run metadata is absent). */
export function flattenAnchorText(input: {
  text: string
  runStart?: number
  runEnd?: number
  anchorId?: string
}): FlattenedAnchorText {
  const text = input.text.normalize('NFC')
  return {
    text,
    segments: [
      {
        start: 0,
        end: text.length,
        runId: input.anchorId ?? 'run:0',
        runStart: input.runStart ?? 0,
        runEnd: input.runEnd ?? text.length,
      },
    ],
  }
}

export type TypedSpanStrategy =
  | 'exact_literal'
  | 'unicode_normalized'
  | 'whitespace_normalized'
  | 'typed_date_match'
  | 'typed_money_match'
  | 'typed_token_match'
  | 'typed_account_match'
  | 'typed_package_attribute'
  | 'typed_time_range'
  | 'context_constrained'
  | 'manual_required'

export type TypedSourceSpanResult = {
  exactSourceText: string
  normalizedValue: string | null
  start: number
  end: number
  strategy: TypedSpanStrategy
  confidence: number
}

const DATE_TOKEN_RE =
  /(\d{1,2}[./-]\d{1,2}[./-]\d{4}\s*r\.?|\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]+\s+\d{4}(?:\s*r\.?)?)/gi

const MONEY_TOKEN_RE =
  /(\d{1,3}(?:[\s\u00a0\u202f.]\d{3})*(?:[.,]\d{2})?\s*(?:zł|pln|zl)|\d+(?:[.,]\d{2})?\s*(?:zł|pln|zl))/gi
const NRB_TOKEN_RE =
  /(?<!\d)(\d{2}(?:[ \u00a0\u202f-]?\d{4}){6})(?!\d)/g
const TIME_RANGE_RE =
  /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/g

const ROLE_DATE_HINTS: Record<string, RegExp> = {
  wedding_date: /ślub|ceremon|wydarzen|w dniu|data\s+ślub|reportaż/i,
  payment_due_date: /najpóźniej|zapłaci|pozostał|wynagrodzen|dopłat/i,
  final_payment_due_date: /najpóźniej|zapłaci|pozostał|wynagrodzen|dopłat/i,
  contract_execution_date: /zawarta|zawarcia|podpisania|umowy/i,
  contract_date: /zawarta|zawarcia|podpisania|umowy/i,
}

const ROLE_MONEY_HINTS: Record<string, RegExp> = {
  contract_value: /wynagrodzen|wartość\s+umowy|cena\s+pakiet|pakiet|brutto|netto/i,
  package_price: /wynagrodzen|wartość\s+umowy|cena\s+pakiet|pakiet|brutto|netto/i,
  deposit_amount: /zadatek|zaliczk/i,
  remaining_amount: /pozostał|dopłat/i,
  package_overtime_rate: /nadgodzin|dodatkow|godzin/i,
  extra_hour_price: /nadgodzin|dodatkow|godzin/i,
}

function collapseWsLocal(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .trim()
}

function normalizeMoneyAmount(value: string): string | null {
  let v = collapseWsLocal(value).toLowerCase()
  v = v.replace(/zł|pln|zl/g, '')
  v = v.replace(/\s|\./g, '')
  v = v.replace(',', '.')
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n.toFixed(2)
}

function fromExact(
  span: SourceSpanResolution,
  strategy: TypedSpanStrategy,
  confidence: number,
  normalized: string | null,
): TypedSourceSpanResult | null {
  if (span.status !== 'exact' && span.status !== 'normalized_exact') return null
  return {
    exactSourceText: span.exactSourceText,
    normalizedValue: normalized,
    start: span.start,
    end: span.end,
    strategy,
    confidence,
  }
}

function findAllDateTokens(anchorText: string): Array<{
  text: string
  start: number
  end: number
  iso: string
}> {
  const out: Array<{ text: string; start: number; end: number; iso: string }> =
    []
  DATE_TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DATE_TOKEN_RE.exec(anchorText))) {
    const text = m[1] ?? m[0]
    const iso = parseFlexibleDate(text)
    if (!iso) continue
    out.push({
      text,
      start: m.index,
      end: m.index + text.length,
      iso,
    })
  }
  return out
}

function findAllMoneyTokens(anchorText: string): Array<{
  text: string
  start: number
  end: number
  amount: string
}> {
  const out: Array<{
    text: string
    start: number
    end: number
    amount: string
  }> = []
  MONEY_TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MONEY_TOKEN_RE.exec(anchorText))) {
    const text = m[1] ?? m[0]
    const amount = normalizeMoneyAmount(text)
    if (!amount) continue
    out.push({
      text,
      start: m.index,
      end: m.index + text.length,
      amount,
    })
  }
  return out
}

function scoreByContext(
  anchorText: string,
  start: number,
  end: number,
  role: string,
  prefix?: string | null,
  suffix?: string | null,
  kind: 'date' | 'money' = 'date',
): number {
  let score = 0
  const before = anchorText.slice(Math.max(0, start - 60), start)
  const after = anchorText.slice(end, Math.min(anchorText.length, end + 40))
  const around = `${before} ${after}`

  if (prefix?.trim()) {
    const p = collapseWsLocal(prefix)
    if (collapseWsLocal(before).endsWith(p) || collapseWsLocal(before).includes(p)) {
      score += 3
    }
  }
  if (suffix?.trim()) {
    const s = collapseWsLocal(suffix)
    if (
      collapseWsLocal(after).startsWith(s) ||
      collapseWsLocal(after).includes(s)
    ) {
      score += 2
    }
  }

  const hints =
    kind === 'money' ? ROLE_MONEY_HINTS[role] : ROLE_DATE_HINTS[role]
  if (hints?.test(around) || hints?.test(anchorText)) score += 2

  return score
}

/**
 * Resolve a typed value span inside a single anchor.
 */
export function resolveTypedSourceSpan(input: {
  anchorId: string
  anchorText: string
  semanticRole: string
  valueKind: 'date' | 'money' | 'text' | string
  proposedSourceText: string
  prefixContext?: string | null
  suffixContext?: string | null
  runStart?: number
  runEnd?: number
}): TypedSourceSpanResult | null {
  const flat = flattenAnchorText({
    text: input.anchorText,
    runStart: input.runStart,
    runEnd: input.runEnd,
    anchorId: input.anchorId,
  })
  const anchor = flat.text
  const proposed = input.proposedSourceText?.trim() ?? ''
  if (!anchor) return null

  const localTyped = resolveLocalTypedEvidence({
    anchorText: anchor,
    semanticRole: input.semanticRole,
    proposedSourceText: proposed,
  })
  if (localTyped && (!proposed || input.valueKind === 'text')) return localTyped
  if (!proposed) return null

  // 1) Exact literal
  const exact = resolveExactSourceSpan(anchor, proposed, {
    prefixContext: input.prefixContext,
    suffixContext: input.suffixContext,
  })
  if (exact.status === 'exact') {
    return fromExact(
      exact,
      'exact_literal',
      1,
      input.valueKind === 'date'
        ? parseFlexibleDate(exact.exactSourceText)
        : input.valueKind === 'money'
          ? normalizeMoneyAmount(exact.exactSourceText)
          : collapseWsLocal(exact.exactSourceText),
    )
  }

  // 2–3) Unicode / whitespace normalized (resolver already does this)
  if (exact.status === 'normalized_exact') {
    return fromExact(
      exact,
      exact.normalizationUsed?.includes('nfc')
        ? 'unicode_normalized'
        : 'whitespace_normalized',
      0.98,
      input.valueKind === 'date'
        ? parseFlexibleDate(exact.exactSourceText)
        : input.valueKind === 'money'
          ? normalizeMoneyAmount(exact.exactSourceText)
          : collapseWsLocal(exact.exactSourceText),
    )
  }

  // 4) Typed token match — dates
  if (
    input.valueKind === 'date' ||
    /_date$|deadline|execution/.test(input.semanticRole)
  ) {
    const targetIso =
      parseFlexibleDate(proposed) ??
      (/^\d{4}-\d{2}-\d{2}$/.test(proposed) ? proposed : null)
    if (targetIso) {
      const tokens = findAllDateTokens(anchor)
      const matching = tokens.filter((t) => t.iso === targetIso)
      if (matching.length === 1) {
        const t = matching[0]!
        return {
          exactSourceText: t.text,
          normalizedValue: t.iso,
          start: t.start,
          end: t.end,
          strategy: 'typed_date_match',
          confidence: 0.96,
        }
      }
      if (matching.length > 1) {
        // 5) Context-constrained
        let best = matching[0]!
        let bestScore = -1
        for (const t of matching) {
          const s = scoreByContext(
            anchor,
            t.start,
            t.end,
            input.semanticRole,
            input.prefixContext,
            input.suffixContext,
            'date',
          )
          if (s > bestScore) {
            bestScore = s
            best = t
          }
        }
        if (bestScore > 0) {
          return {
            exactSourceText: best.text,
            normalizedValue: best.iso,
            start: best.start,
            end: best.end,
            strategy: 'context_constrained',
            confidence: 0.93,
          }
        }
      }
      // Fallback: any date token if proposed failed literal but one date exists
      if (tokens.length === 1 && targetIso) {
        const t = tokens[0]!
        if (t.iso === targetIso) {
          return {
            exactSourceText: t.text,
            normalizedValue: t.iso,
            start: t.start,
            end: t.end,
            strategy: 'typed_date_match',
            confidence: 0.94,
          }
        }
      }
    }
  }

  // 4) Typed token match — money
  if (
    input.valueKind === 'money' ||
    /price|amount|deposit|remaining|value/.test(input.semanticRole)
  ) {
    const targetAmount = normalizeMoneyAmount(proposed)
    if (targetAmount) {
      const tokens = findAllMoneyTokens(anchor)
      const matching = tokens.filter((t) => t.amount === targetAmount)
      if (matching.length === 1) {
        const t = matching[0]!
        return {
          exactSourceText: t.text,
          normalizedValue: t.amount,
          start: t.start,
          end: t.end,
          strategy: 'typed_money_match',
          confidence: 0.96,
        }
      }
      if (matching.length > 1) {
        let best = matching[0]!
        let bestScore = -1
        for (const t of matching) {
          const s = scoreByContext(
            anchor,
            t.start,
            t.end,
            input.semanticRole,
            input.prefixContext,
            input.suffixContext,
            'money',
          )
          if (s > bestScore) {
            bestScore = s
            best = t
          }
        }
        if (bestScore > 0) {
          return {
            exactSourceText: best.text,
            normalizedValue: best.amount,
            start: best.start,
            end: best.end,
            strategy: 'context_constrained',
            confidence: 0.93,
          }
        }
      }
      if (tokens.length === 1 && tokens[0]!.amount === targetAmount) {
        const t = tokens[0]!
        return {
          exactSourceText: t.text,
          normalizedValue: t.amount,
          start: t.start,
          end: t.end,
          strategy: 'typed_money_match',
          confidence: 0.94,
        }
      }
    }
  }

  // Try locating via locate map with stripped punctuation variants
  if (input.valueKind === 'date') {
    const variants = [
      proposed.replace(/\s*r\.?\s*$/i, ''),
      `${proposed.replace(/\s*r\.?\s*$/i, '')}r.`,
      `${proposed.replace(/\s*r\.?\s*$/i, '')} r.`,
    ]
    for (const v of variants) {
      if (!v || v === proposed) continue
      const span = resolveExactSourceSpan(anchor, v, {
        prefixContext: input.prefixContext,
        suffixContext: input.suffixContext,
      })
      const hit = fromExact(
        span,
        'typed_date_match',
        0.92,
        parseFlexibleDate(v),
      )
      if (hit) return hit
    }
  }

  if (localTyped) return localTyped

  void buildLocateMap // keep import used for future run mapping
  return null
}

export function resolveBankAccountEvidence(anchorText: string): {
  bankName: string | null
  bankNameStart: number | null
  account: TypedSourceSpanResult
} | null {
  NRB_TOKEN_RE.lastIndex = 0
  const matches = [...anchorText.matchAll(new RegExp(NRB_TOKEN_RE.source, 'g'))]
  if (matches.length !== 1) return null
  const match = matches[0]!
  const text = match[1] ?? match[0]
  const start = match.index ?? anchorText.indexOf(text)
  const digits = text.replace(/\D/g, '')
  if (digits.length !== 26) return null
  const before = anchorText.slice(0, start).trim().replace(/[:,-]\s*$/u, '').trim()
  const bankName =
    before && /^[\p{L}\p{N} .&'-]{2,80}$/u.test(before) ? before : null
  return {
    bankName,
    bankNameStart: bankName == null ? null : anchorText.indexOf(bankName),
    account: {
      exactSourceText: text,
      normalizedValue: digits,
      start,
      end: start + text.length,
      strategy: 'typed_account_match',
      confidence: 0.98,
    },
  }
}

export function resolveWorkingHoursRange(
  anchorText: string,
): TypedSourceSpanResult | null {
  TIME_RANGE_RE.lastIndex = 0
  const matches = [...anchorText.matchAll(new RegExp(TIME_RANGE_RE.source, 'g'))]
  if (matches.length !== 1) return null
  const match = matches[0]!
  const exactSourceText = match[0]
  const start = match.index ?? anchorText.indexOf(exactSourceText)
  return {
    exactSourceText,
    normalizedValue: `${match[1]!.padStart(2, '0')}:${match[2]}-${match[3]!.padStart(2, '0')}:${match[4]}`,
    start,
    end: start + exactSourceText.length,
    strategy: 'typed_time_range',
    confidence: 0.97,
  }
}

export function resolveLocalTypedEvidence(input: {
  anchorText: string
  semanticRole: string
  proposedSourceText?: string | null
}): TypedSourceSpanResult | null {
  const role = input.semanticRole
  const proposed = input.proposedSourceText?.trim() ?? ''

  if (role === 'bank_account') {
    return resolveBankAccountEvidence(input.anchorText)?.account ?? null
  }

  if (
    role === 'working_hours' ||
    role === 'coverage_time_range' ||
    role === 'coverage_start_time' ||
    role === 'coverage_end_time'
  ) {
    const range = resolveWorkingHoursRange(input.anchorText)
    if (!range) return null
    if (role === 'coverage_start_time' || role === 'coverage_end_time') {
      const endpoint =
        role === 'coverage_start_time'
          ? /^([0-2]?\d[:.][0-5]\d)/.exec(range.exactSourceText)?.[1]
          : /([0-2]?\d[:.][0-5]\d)$/.exec(range.exactSourceText)?.[1]
      if (!endpoint) return null
      const start =
        role === 'coverage_start_time'
          ? range.start
          : range.end - endpoint.length
      return {
        ...range,
        exactSourceText: endpoint,
        normalizedValue: endpoint.replace('.', ':').padStart(5, '0'),
        start,
        end: start + endpoint.length,
      }
    }
    return range
  }

  if (
    (role === 'contract_value' || role === 'package_price') &&
    /wynagrodzen|wartość\s+umowy|łączn\w*\s+kwot/i.test(input.anchorText)
  ) {
    const tokens = findAllMoneyTokens(input.anchorText)
    if (tokens.length === 1) {
      const token = tokens[0]!
      return {
        exactSourceText: token.text,
        normalizedValue: token.amount,
        start: token.start,
        end: token.end,
        strategy: 'typed_money_match',
        confidence: role === 'contract_value' ? 0.97 : 0.85,
      }
    }
  }

  if (role === 'package_item' || role === 'package_contents') {
    const candidates: Array<{ re: RegExp; cue: RegExp }> = [
      { re: /\bFILM\b/i, cue: /\bfilm\b/i },
      {
        re: /\bplik(?:u|iem)?\s+cyfrow(?:y|ego|ym)\b/i,
        cue: /plik|cyfrow|elektroniczn|online/i,
      },
      {
        re: /\bdo\s+\d+\s+minut\w*\b/i,
        cue: /minut|czas|trwa|duration/i,
      },
    ]
    for (const candidate of candidates) {
      if (proposed && !candidate.cue.test(proposed)) continue
      const match = candidate.re.exec(input.anchorText)
      if (!match?.[0] || match.index == null) continue
      return {
        exactSourceText: match[0],
        normalizedValue: collapseWsLocal(match[0]).toLowerCase(),
        start: match.index,
        end: match.index + match[0].length,
        strategy: 'typed_package_attribute',
        confidence: 0.94,
      }
    }
  }
  return null
}

const PL_MONTHS_GEN = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
] as const

/**
 * Format a canonical ISO date like the source style.
 */
export function formatDateLikeSource(input: {
  canonicalDate: string
  sourceText: string
  locale?: 'pl-PL'
}): string {
  const iso = parseFlexibleDate(input.canonicalDate) ?? input.canonicalDate
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return input.canonicalDate
  const y = m[1]!
  const mo = Number(m[2])
  const d = Number(m[3])
  const dd = String(d).padStart(2, '0')
  const mm = String(mo).padStart(2, '0')
  const src = input.sourceText.trim()

  const hasRTight = /\d{4}\s*r\.\s*$/i.test(src) && !/\d{4}\s+r\.\s*$/i.test(src)
  const hasRSpace = /\d{4}\s+r\.\s*$/i.test(src)
  const hasRBare = /\d{4}\s*r\s*$/i.test(src) && !/\./.test(src.slice(-3))

  // Long Polish form
  if (/\d{1,2}\s+[A-Za-ząćęłńóśźż]+\s+\d{4}/i.test(src)) {
    const month = PL_MONTHS_GEN[mo - 1] ?? mm
    let out = `${d} ${month} ${y}`
    if (hasRSpace || /r\.\s*$/i.test(src)) out += ' r.'
    else if (hasRBare) out += ' r'
    return out
  }

  // ISO source
  if (/^\d{4}-\d{2}-\d{2}/.test(src)) {
    return `${y}-${mm}-${dd}`
  }

  // Slash / dash separators
  if (src.includes('/')) {
    let out = `${dd}/${mm}/${y}`
    if (hasRSpace) out += ' r.'
    else if (hasRTight) out += 'r.'
    return out
  }
  if (/\d-\d/.test(src) && !src.includes('.')) {
    let out = `${dd}-${mm}-${y}`
    if (hasRSpace) out += ' r.'
    else if (hasRTight) out += 'r.'
    return out
  }

  // Default dotted
  let out = `${dd}.${mm}.${y}`
  if (hasRSpace) out += ' r.'
  else if (hasRTight) out += 'r.'
  else if (/r\.\s*$/i.test(src)) out += 'r.'
  return out
}

/**
 * Format money like the source span style.
 * Rule: if source includes zł/PLN, replacement includes it; spacing follows source.
 */
export function formatMoneyLikeSource(input: {
  canonicalAmount: number | string
  sourceText: string
}): string {
  const n =
    typeof input.canonicalAmount === 'number'
      ? input.canonicalAmount
      : Number(
          String(input.canonicalAmount)
            .replace(/zł|pln|zl/gi, '')
            .replace(/\s/g, '')
            .replace(',', '.'),
        )
  if (!Number.isFinite(n)) return String(input.canonicalAmount)

  const src = input.sourceText
  const hasCurrency = /zł|pln|zl/i.test(src)
  const currencyMatch = src.match(/(zł|pln|zl)/i)
  const currency = currencyMatch ? currencyMatch[1]! : 'zł'
  const noSpaceBeforeCurrency = /\d(?:zł|pln|zl)/i.test(src)

  const intPart = Math.floor(Math.abs(n))
  const useGrouped = /[\s\u00a0.]\d{3}/.test(src) || intPart >= 1000
  const grouped = useGrouped
    ? String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    : String(intPart)

  const hasDecimals = /[.,]\d{2}/.test(src)
  const frac = Math.round((Math.abs(n) % 1) * 100)
  const amount = hasDecimals
    ? `${grouped},${frac.toString().padStart(2, '0')}`
    : grouped

  if (!hasCurrency) return amount
  if (noSpaceBeforeCurrency) return `${amount}${currency}`
  return `${amount} ${currency}`
}
