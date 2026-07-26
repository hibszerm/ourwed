/**
 * Narrow Phase A source spans to value-only substrings.
 * Never patch legal wording / full clauses.
 */

import {
  resolveExactSourceSpan,
  type SourceSpanResolution,
} from '@/features/ai-contract-lab/resolveExactSourceSpan'
import { parseFlexibleDate } from '@/features/ai-contract-lab/semanticValueEquality'

export type SemanticValueType =
  | 'date'
  | 'phone'
  | 'money'
  | 'percent'
  | 'duration'
  | 'hours'
  | 'time_of_day'
  | 'account'
  | 'nip'
  | 'regon'
  | 'package_name'
  | 'location'
  | 'text'
  | 'legal_reference'

export type NarrowSpanStrategy =
  | 'provider_exact'
  | 'typed_value_extract'
  | 'context_narrowed'
  | 'manual_required'

export type NarrowedValueSpan = {
  exactSourceText: string
  start: number
  end: number
  confidence: number
  strategy: NarrowSpanStrategy
}

const DATE_RE =
  /\b(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})(?:\s*r\.?)?\b/gi
const TIME_RE = /\b(\d{1,2}[.:]\d{2})\b/g
const PHONE_RE =
  /(?:\+48[\s-]?)?(?:\d[\s-]?){9}\d|\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g
const MONEY_RE =
  /\b\d{1,3}(?:[ \u00a0]?\d{3})*(?:[.,]\d{2})?\s*(?:zł|pln|zl)\b|\b\d+[.,]\d{2}\s*(?:zł|pln)?\b/gi
const DURATION_NUM_RE =
  /\b(\d+)\s*(?:miesi[ęe]c\w*|dni|dzie[ńn]|tygodn\w*|tyg\.?|godzin\w*|godz\.?)/i
const HOURS_ONLY_RE = /\b(\d+)\s*(?:godzin\w*|godz\.?)\b/i
const NIP_RE = /\b\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b|\b\d{10}\b/g
const REGON_RE = /\b\d{9}(?:\d{5})?\b/g
const NRB_RE = /(?<!\d)(\d{2}(?:[ \u00a0\u202f-]?\d{4}){6})(?!\d)/g
const TIME_RANGE_RE =
  /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/
const PACKAGE_LABEL_RE =
  /\b(?:pakiecie|pakiet|tzw\.?\s*pakiecie|tzw\.?\s*pakiet)\s+/i

const LEGAL_PHRASE_HINTS =
  /\b(zawarta w dniu|najpóźniej w dniu|do godziny|czas pracy|wynosi maksymalnie|w terminie|od daty|zwrotu zadatku|dwukrotnej|pomniejszoną|zgodnie z|niniejsz)/i

function locateInAnchor(
  anchorText: string,
  exact: string,
): { start: number; end: number } | null {
  const idx = anchorText.indexOf(exact)
  if (idx < 0) return null
  if (anchorText.indexOf(exact, idx + 1) >= 0) return null
  return { start: idx, end: idx + exact.length }
}

function locatePreferred(
  anchorText: string,
  exact: string,
  prefix?: string | null,
  suffix?: string | null,
): { start: number; end: number } | null {
  const resolved = resolveExactSourceSpan(anchorText, exact, {
    prefixContext: prefix,
    suffixContext: suffix,
  })
  if (
    resolved.status === 'exact' ||
    resolved.status === 'normalized_exact'
  ) {
    return { start: resolved.start, end: resolved.end }
  }
  return locateInAnchor(anchorText, exact)
}

function extractFirst(
  text: string,
  re: RegExp,
): string | null {
  re.lastIndex = 0
  const m = re.exec(text)
  return m ? (m[1] ?? m[0]) : null
}

function stripDateTrailingR(value: string): string {
  return value.replace(/\s*r\.?\s*$/i, '').trim()
}

/**
 * Narrow a proposed source span to the editable value only.
 */
export function narrowSemanticValueSpan(input: {
  semanticRole: string
  anchorText: string
  proposedSourceText: string
  prefixContext?: string | null
  suffixContext?: string | null
  valueType: SemanticValueType
}): NarrowedValueSpan | null {
  const anchor = input.anchorText
  const proposed = input.proposedSourceText?.trim() ?? ''
  if (!anchor || !proposed) return null

  const region = buildSearchRegion(anchor, proposed, input.prefixContext)

  if (input.valueType === 'account' || input.semanticRole === 'bank_account') {
    NRB_RE.lastIndex = 0
    const matches = [...anchor.matchAll(new RegExp(NRB_RE.source, 'g'))]
    if (matches.length === 1) {
      const match = matches[0]!
      const value = match[1] ?? match[0]
      const start = match.index ?? anchor.indexOf(value)
      return {
        exactSourceText: value,
        start,
        end: start + value.length,
        confidence: 0.98,
        strategy: 'typed_value_extract',
      }
    }
  }

  if (
    input.semanticRole === 'working_hours' ||
    input.semanticRole === 'coverage_time_range'
  ) {
    const match = TIME_RANGE_RE.exec(anchor)
    if (match?.[0] && match.index != null) {
      return {
        exactSourceText: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.97,
        strategy: 'typed_value_extract',
      }
    }
  }

  if (
    (input.semanticRole === 'package_item' ||
      input.semanticRole === 'package_contents') &&
    (anchor.indexOf(proposed) < 0 ||
      proposed.length > 40 ||
      LEGAL_PHRASE_HINTS.test(proposed))
  ) {
    const packageCandidates: Array<{ re: RegExp; cue: RegExp }> = [
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
    for (const candidate of packageCandidates) {
      if (!candidate.cue.test(proposed)) continue
      const match = candidate.re.exec(anchor)
      if (!match?.[0] || match.index == null) continue
      return {
        exactSourceText: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.94,
        strategy: 'context_narrowed',
      }
    }
  }

  // Duration / hours: always prefer the bare number (never "4 miesięcy" as patch span)
  if (
    input.valueType === 'duration' ||
    input.valueType === 'hours' ||
    input.semanticRole === 'coverage_hours' ||
    input.semanticRole === 'delivery_deadline' ||
    input.semanticRole === 'deposit_due_date' ||
    input.semanticRole === 'preview_deadline'
  ) {
    const search = `${proposed} ${region}`
    const numMatch = search.match(DURATION_NUM_RE) || search.match(/\b(\d+)\b/)
    const bare = numMatch?.[1]
    if (bare) {
      const candidates: number[] = []
      let from = 0
      while (from < anchor.length) {
        const i = anchor.indexOf(bare, from)
        if (i < 0) break
        candidates.push(i)
        from = i + 1
      }
      for (const i of candidates) {
        const window = anchor.slice(i, Math.min(anchor.length, i + 28))
        if (
          /miesi|dn|godzin|tyg|dzie/i.test(window) ||
          candidates.length === 1
        ) {
          return {
            exactSourceText: bare,
            start: i,
            end: i + bare.length,
            confidence: 0.92,
            strategy: 'typed_value_extract',
          }
        }
      }
      if (candidates.length === 1) {
        return {
          exactSourceText: bare,
          start: candidates[0]!,
          end: candidates[0]! + bare.length,
          confidence: 0.85,
          strategy: 'typed_value_extract',
        }
      }
    }
  }

  // Already a tight value? Prefer provider exact if it locates uniquely.
  const providerLoc = locatePreferred(
    anchor,
    proposed,
    input.prefixContext,
    input.suffixContext,
  )
  const providerLooksLegal =
    LEGAL_PHRASE_HINTS.test(proposed) ||
    proposed.length > 40 ||
    /\b(zawarta|najpóźniej|maksymalnie|pakiecie|godziny|terminie)\b/i.test(
      proposed,
    )

  if (
    providerLoc &&
    !providerLooksLegal &&
    isValueShaped(proposed, input.valueType) &&
    input.valueType !== 'duration' &&
    input.valueType !== 'hours'
  ) {
    return {
      exactSourceText: proposed,
      start: providerLoc.start,
      end: providerLoc.end,
      confidence: 0.95,
      strategy: 'provider_exact',
    }
  }

  // Typed extraction from proposed, then from anchor region around proposed
  const extracted = extractTypedValue(region, input.valueType, input.semanticRole)
  if (extracted) {
    const loc = locatePreferred(
      anchor,
      extracted,
      input.prefixContext,
      input.suffixContext,
    )
    if (loc) {
      return {
        exactSourceText: extracted,
        start: loc.start,
        end: loc.end,
        confidence: 0.9,
        strategy: 'typed_value_extract',
      }
    }
  }

  // Context-narrowed: if proposed contains a typed value substring
  const fromProposed = extractTypedValue(
    proposed,
    input.valueType,
    input.semanticRole,
  )
  if (fromProposed && fromProposed !== proposed) {
    const loc = locatePreferred(
      anchor,
      fromProposed,
      input.prefixContext,
      input.suffixContext,
    )
    if (loc) {
      return {
        exactSourceText: fromProposed,
        start: loc.start,
        end: loc.end,
        confidence: 0.85,
        strategy: 'context_narrowed',
      }
    }
  }

  // Package name: strip grammatical "Pakiecie "
  if (input.valueType === 'package_name' || input.semanticRole === 'package_name') {
    const stripped = proposed.replace(PACKAGE_LABEL_RE, '').trim()
    if (stripped && stripped !== proposed) {
      const loc = locatePreferred(anchor, stripped, input.prefixContext, input.suffixContext)
      if (loc) {
        return {
          exactSourceText: stripped,
          start: loc.start,
          end: loc.end,
          confidence: 0.88,
          strategy: 'context_narrowed',
        }
      }
    }
  }

  // Duration / hours: prefer the number only
  if (
    input.valueType === 'duration' ||
    input.valueType === 'hours' ||
    input.semanticRole === 'coverage_hours' ||
    input.semanticRole === 'delivery_deadline' ||
    input.semanticRole === 'deposit_due_date'
  ) {
    const num =
      extractFirst(proposed, DURATION_NUM_RE) ||
      extractFirst(region, DURATION_NUM_RE)
    if (num) {
      const loc = locatePreferred(anchor, num, input.prefixContext, input.suffixContext)
      // Prefer locating the bare number near the unit
      const bare = num.match(/^(\d+)/)?.[1]
      if (bare) {
        const unitIdx = region.search(
          new RegExp(`${bare}\\s*(?:miesi|dn|godzin|tyg)`, 'i'),
        )
        if (unitIdx >= 0) {
          // find bare number occurrence in anchor near that phrase
          const phrase = region.slice(Math.max(0, unitIdx - 5), unitIdx + 30)
          const inPhrase = phrase.match(new RegExp(`\\b${bare}\\b`))
          if (inPhrase) {
            // safer: search all bare occurrences and pick one near duration wording
            const candidates: number[] = []
            let from = 0
            while (from < anchor.length) {
              const i = anchor.indexOf(bare, from)
              if (i < 0) break
              candidates.push(i)
              from = i + 1
            }
            for (const i of candidates) {
              const window = anchor.slice(i, i + 24)
              if (
                /miesi|dn|godzin|tyg|dzie/i.test(window) ||
                candidates.length === 1
              ) {
                return {
                  exactSourceText: bare,
                  start: i,
                  end: i + bare.length,
                  confidence: 0.87,
                  strategy: 'typed_value_extract',
                }
              }
            }
          }
        }
      }
      if (loc) {
        const bareOnly = (num.match(/^(\d+)/) ?? [null, num])[1]!
        const bareLoc = locatePreferred(
          anchor,
          bareOnly,
          input.prefixContext,
          input.suffixContext,
        )
        if (bareLoc) {
          return {
            exactSourceText: bareOnly,
            start: bareLoc.start,
            end: bareLoc.end,
            confidence: 0.8,
            strategy: 'typed_value_extract',
          }
        }
      }
    }
  }

  // Time of day
  if (
    input.valueType === 'time_of_day' ||
    input.semanticRole === 'coverage_start_time' ||
    input.semanticRole === 'coverage_end_time'
  ) {
    const range = TIME_RANGE_RE.exec(anchor)
    const endpoint =
      input.semanticRole === 'coverage_start_time'
        ? range?.[0].match(/^([0-2]?\d[:.][0-5]\d)/)?.[1]
        : input.semanticRole === 'coverage_end_time'
          ? range?.[0].match(/([0-2]?\d[:.][0-5]\d)$/)?.[1]
          : null
    const t =
      endpoint ||
      extractFirst(proposed, TIME_RE) ||
      extractFirst(region, TIME_RE)
    if (t) {
      const loc = locatePreferred(anchor, t, input.prefixContext, input.suffixContext)
      if (loc) {
        return {
          exactSourceText: t,
          start: loc.start,
          end: loc.end,
          confidence: 0.9,
          strategy: 'typed_value_extract',
        }
      }
    }
  }

  // Date
  if (input.valueType === 'date' || /_date$|deadline|execution/.test(input.semanticRole)) {
    DATE_RE.lastIndex = 0
    let dateMatch = DATE_RE.exec(proposed)
    if (!dateMatch) {
      DATE_RE.lastIndex = 0
      dateMatch = DATE_RE.exec(region)
    }
    if (dateMatch) {
      const raw = dateMatch[1] ?? dateMatch[0]
      const cleaned = stripDateTrailingR(raw)
      // Prefer span without trailing "r." when present separately
      const loc =
        locatePreferred(anchor, cleaned, input.prefixContext, input.suffixContext) ??
        locatePreferred(anchor, raw, input.prefixContext, input.suffixContext)
      if (loc) {
        // If anchor has "30.10.2024 r." but we want only date digits part
        const slice = anchor.slice(loc.start, loc.end)
        const onlyDate = stripDateTrailingR(slice)
        if (onlyDate !== slice && anchor.includes(onlyDate)) {
          const dLoc = locatePreferred(
            anchor,
            onlyDate,
            input.prefixContext,
            input.suffixContext,
          )
          if (dLoc) {
            return {
              exactSourceText: onlyDate,
              start: dLoc.start,
              end: dLoc.end,
              confidence: 0.92,
              strategy: 'context_narrowed',
            }
          }
        }
        return {
          exactSourceText: cleaned,
          start: loc.start,
          end: loc.end,
          confidence: 0.9,
          strategy: 'typed_value_extract',
        }
      }
    }
  }

  if (providerLoc && !providerLooksLegal) {
    return {
      exactSourceText: proposed,
      start: providerLoc.start,
      end: providerLoc.end,
      confidence: 0.7,
      strategy: 'provider_exact',
    }
  }

  return null
}

function buildSearchRegion(
  anchor: string,
  proposed: string,
  prefix?: string | null,
): string {
  const idx = anchor.indexOf(proposed)
  if (idx >= 0) {
    return anchor.slice(Math.max(0, idx - 40), Math.min(anchor.length, idx + proposed.length + 40))
  }
  if (prefix?.trim()) {
    const p = anchor.indexOf(prefix.trim())
    if (p >= 0) return anchor.slice(p, Math.min(anchor.length, p + 120))
  }
  return anchor
}

function extractTypedValue(
  text: string,
  valueType: SemanticValueType,
  role: string,
): string | null {
  switch (valueType) {
    case 'date': {
      DATE_RE.lastIndex = 0
      const m = DATE_RE.exec(text)
      return m ? stripDateTrailingR(m[1] ?? m[0]) : null
    }
    case 'time_of_day':
      return extractFirst(text, TIME_RE)
    case 'account': {
      NRB_RE.lastIndex = 0
      const m = NRB_RE.exec(text)
      return m ? m[1] ?? m[0] : null
    }
    case 'phone': {
      PHONE_RE.lastIndex = 0
      const m = PHONE_RE.exec(text)
      return m ? m[0].trim() : null
    }
    case 'money': {
      MONEY_RE.lastIndex = 0
      const m = MONEY_RE.exec(text)
      return m ? m[0].trim() : null
    }
    case 'hours': {
      const m = text.match(HOURS_ONLY_RE)
      return m?.[1] ?? null
    }
    case 'duration': {
      const m = text.match(DURATION_NUM_RE)
      return m?.[1] ?? null
    }
    case 'nip': {
      NIP_RE.lastIndex = 0
      const m = NIP_RE.exec(text)
      return m ? m[0].replace(/\s|-/g, '') : null
    }
    case 'regon': {
      REGON_RE.lastIndex = 0
      const m = REGON_RE.exec(text)
      return m ? m[0] : null
    }
    case 'package_name': {
      const stripped = text.replace(PACKAGE_LABEL_RE, '').trim()
      // Prefer last token after Pakiecie
      const after = text.match(PACKAGE_LABEL_RE)
      if (after && after.index != null) {
        const rest = text.slice(after.index + after[0].length).trim()
        const name = rest.split(/[\s,.;]+/)[0]
        if (name) return name
      }
      return stripped && stripped.length < 40 ? stripped : null
    }
    case 'location':
    case 'text':
    default: {
      if (role === 'package_name') {
        return extractTypedValue(text, 'package_name', role)
      }
      return null
    }
  }
}

function isValueShaped(text: string, valueType: SemanticValueType): boolean {
  const t = text.trim()
  if (!t) return false
  if (LEGAL_PHRASE_HINTS.test(t) && t.length > 20) return false
  switch (valueType) {
    case 'date':
      return parseFlexibleDate(t) != null || DATE_RE.test(t)
    case 'time_of_day':
      return /^\d{1,2}[.:]\d{2}$/.test(t)
    case 'phone':
      return digitsOnlyCount(t) >= 9
    case 'money':
      return /\d/.test(t) && /(zł|pln|,|\.)/i.test(t)
    case 'hours':
    case 'duration':
      return /^\d+$/.test(t) || DURATION_NUM_RE.test(t)
    case 'nip':
      return digitsOnlyCount(t) === 10
    case 'regon':
      return digitsOnlyCount(t) === 9 || digitsOnlyCount(t) === 14
    case 'package_name':
      return !PACKAGE_LABEL_RE.test(t) && t.split(/\s+/).length <= 4
    default:
      return t.length <= 60 && !LEGAL_PHRASE_HINTS.test(t)
  }
}

function digitsOnlyCount(value: string): number {
  return value.replace(/\D/g, '').length
}

export function sourceSpanIsValueOnly(
  exactSourceText: string,
  valueType: SemanticValueType,
): boolean {
  if (!exactSourceText.trim()) return false
  if (LEGAL_PHRASE_HINTS.test(exactSourceText) && exactSourceText.length > 24) {
    return false
  }
  if (valueType === 'duration' || valueType === 'hours') {
    return /^\d+$/.test(exactSourceText.trim())
  }
  return isValueShaped(exactSourceText, valueType)
}

export function valueTypeForRole(role: string): SemanticValueType {
  switch (role) {
    case 'contract_date':
    case 'contract_execution_date':
    case 'wedding_date':
    case 'payment_due_date':
    case 'preview_deadline':
      return 'date'
    case 'delivery_deadline':
    case 'deposit_due_date':
      return 'duration'
    case 'company_phone':
    case 'bride_phone':
    case 'groom_phone':
    case 'client_phone':
      return 'phone'
    case 'contract_value':
    case 'package_price':
    case 'deposit_amount':
    case 'remaining_amount':
    case 'package_overtime_rate':
    case 'extra_hour_price':
      return 'money'
    case 'package_duration':
    case 'coverage_hours':
    case 'working_hours':
      return 'hours'
    case 'coverage_start_time':
    case 'coverage_end_time':
      return 'time_of_day'
    case 'company_tax_id':
    case 'company_nip':
      return 'nip'
    case 'company_registration_number':
    case 'company_regon':
      return 'regon'
    case 'bank_account':
      return 'account'
    case 'package_name':
      return 'package_name'
    case 'package_item':
    case 'package_contents':
      return 'text'
    case 'preparation_location':
    case 'ceremony_location':
    case 'reception_location':
    case 'church':
    case 'civil_office':
      return 'location'
    case 'deposit_refund_multiplier':
    case 'deposit_forfeiture_clause':
    case 'amount_reference_without_literal_value':
    case 'legal_clause_reference':
      return 'legal_reference'
    default:
      return 'text'
  }
}

/** Re-export resolve helper status check */
export function isResolvedSpan(
  span: SourceSpanResolution | NarrowedValueSpan | null,
): span is NarrowedValueSpan {
  return span != null && 'exactSourceText' in span && 'strategy' in span
}
