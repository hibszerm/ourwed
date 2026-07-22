/**
 * Heuristic field suggestions for contracts without placeholders.
 * Registry keys only — no AI, no external APIs.
 */

import {
  getVariableDef,
  isKnownVariableKey,
} from '@/features/documents/registry/variableRegistry'
import type { DetectedField } from '../types'
import type { DocumentStructure } from '../preview/documentNodes'

export type SuggestionConfidence = 'high' | 'medium' | 'low'

export interface SuggestedField {
  /** Exact substring found in the document. */
  text: string
  /** Must be a Variable Registry key. */
  suggestedKey: string
  confidence: SuggestionConfidence
  offsets: { start: number; end: number }
  /** Short Polish reason for the suggestion. */
  reason: string
}

export interface SuggestDocumentFieldsInput {
  plainText: string
  structure?: DocumentStructure | null
  /** Ranges already claimed by placeholder detection (priority). */
  occupiedRanges?: { start: number; end: number }[]
}

function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function isOccupied(
  range: { start: number; end: number },
  occupied: { start: number; end: number }[],
): boolean {
  return occupied.some((o) => overlaps(range, o))
}

function contextWindow(
  text: string,
  start: number,
  end: number,
  radius = 48,
): string {
  return text.slice(
    Math.max(0, start - radius),
    Math.min(text.length, end + radius),
  )
}

function pushUnique(
  out: SuggestedField[],
  occupied: { start: number; end: number }[],
  candidate: SuggestedField,
) {
  if (!isKnownVariableKey(candidate.suggestedKey)) return
  if (!getVariableDef(candidate.suggestedKey)) return
  if (isOccupied(candidate.offsets, occupied)) return
  if (
    out.some(
      (s) =>
        overlaps(s.offsets, candidate.offsets) ||
        (s.suggestedKey === candidate.suggestedKey &&
          s.text === candidate.text),
    )
  ) {
    return
  }
  out.push(candidate)
  occupied.push(candidate.offsets)
}

function suggestDates(
  plainText: string,
  occupied: { start: number; end: number }[],
  out: SuggestedField[],
) {
  const patterns: { re: RegExp; confidence: SuggestionConfidence }[] = [
    { re: /\b(\d{1,2}[./]\d{1,2}[./]\d{4})\b/g, confidence: 'high' },
    { re: /\b(\d{4}-\d{2}-\d{2})\b/g, confidence: 'high' },
  ]

  for (const { re, confidence } of patterns) {
    let match: RegExpExecArray | null
    const local = new RegExp(re.source, 'g')
    while ((match = local.exec(plainText)) !== null) {
      const text = match[1] ?? match[0]
      const start = match.index
      const end = start + text.length
      const ctx = contextWindow(plainText, start, end).toLowerCase()
      const boosted =
        /ślub|slub|ceremon|wesel|umow|data/.test(ctx) ? 'high' : confidence
      pushUnique(out, occupied, {
        text,
        suggestedKey: 'wedding.date',
        confidence: boosted,
        offsets: { start, end },
        reason: 'Wykryto datę w treści umowy',
      })
    }
  }
}

function suggestMoney(
  plainText: string,
  occupied: { start: number; end: number }[],
  out: SuggestedField[],
) {
  const re =
    /\b(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)\s*(zł|zl|PLN)\b/gi
  let match: RegExpExecArray | null
  let priceTaken = false
  let depositTaken = false
  let remainingTaken = false

  while ((match = re.exec(plainText)) !== null) {
    const text = match[0]
    const start = match.index
    const end = start + text.length
    const ctx = contextWindow(plainText, start, end).toLowerCase()

    let suggestedKey = 'package.price'
    let reason = 'Wykryto kwotę w PLN'
    let confidence: SuggestionConfidence = 'medium'

    if (/zadat|zalicz|wpłat|wplat/.test(ctx) && !depositTaken) {
      suggestedKey = 'package.deposit'
      reason = 'Kwota w kontekście zadatku'
      confidence = 'high'
      depositTaken = true
    } else if (/pozosta|do zapłat|do zaplat|reszt/.test(ctx) && !remainingTaken) {
      suggestedKey = 'package.remaining'
      reason = 'Kwota w kontekście pozostałej należności'
      confidence = 'medium'
      remainingTaken = true
    } else if (priceTaken) {
      continue
    } else {
      priceTaken = true
      if (/wartość|wartosc|cen[ay]|wynagrod|pakiet|umow/.test(ctx)) {
        confidence = 'high'
      }
    }

    pushUnique(out, occupied, {
      text,
      suggestedKey,
      confidence,
      offsets: { start, end },
      reason,
    })
  }
}

function captureAfterLabel(
  plainText: string,
  labelRe: RegExp,
  maxLen: number,
): { text: string; start: number; end: number } | null {
  const match = labelRe.exec(plainText)
  if (!match) return null
  const searchFrom = match.index + match[0].length
  const after = plainText.slice(searchFrom)
  const valueMatch = after.match(/^\s*[:–—-]?\s*([^\n;]{3,100})/)
  if (!valueMatch?.[1]) return null
  let text = valueMatch[1].trim()
  // Cut at sentence / clause boundary
  text = text.split(/\s{2,}|\.(?=\s)|,(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])/)[0]?.trim() ?? text
  if (text.length < 3 || text.length > maxLen) return null
  const absStart = plainText.indexOf(text, searchFrom)
  if (absStart < 0) return null
  return { text, start: absStart, end: absStart + text.length }
}

function suggestLocations(
  plainText: string,
  occupied: { start: number; end: number }[],
  out: SuggestedField[],
) {
  const rules: {
    label: RegExp
    key: string
    reason: string
    confidence: SuggestionConfidence
  }[] = [
    {
      label: /(?:miejsce\s+)?ceremonii?|lokalizacja\s+ceremon/i,
      key: 'location.ceremony',
      reason: 'Etykieta związana z ceremonią',
      confidence: 'medium',
    },
    {
      label: /(?:miejsce\s+)?przyj[eę]cia|wesela|lokalizacja\s+przyj/i,
      key: 'location.reception',
      reason: 'Etykieta związana z przyjęciem',
      confidence: 'medium',
    },
    {
      label: /przygotowa[nń]|miejsce\s+przygot/i,
      key: 'location.preparation',
      reason: 'Etykieta związana z przygotowaniami',
      confidence: 'medium',
    },
  ]

  const usedKeys = new Set<string>()
  for (const rule of rules) {
    if (usedKeys.has(rule.key)) continue
    const captured = captureAfterLabel(
      plainText,
      new RegExp(rule.label.source, 'i'),
      80,
    )
    if (!captured) continue
    if (/^(ceremonia|przyjęcie|przyjecie|data|pakiet)/i.test(captured.text)) {
      continue
    }
    pushUnique(out, occupied, {
      text: captured.text,
      suggestedKey: rule.key,
      confidence: rule.confidence,
      offsets: captured,
      reason: rule.reason,
    })
    usedKeys.add(rule.key)
  }
}

function suggestParties(
  plainText: string,
  occupied: { start: number; end: number }[],
  out: SuggestedField[],
) {
  const betweenRe =
    /zawart[ay]\s+pomi[eę]dzy\s+(.{5,70}?)\s+(?:a|i)\s+(.{5,70}?)(?=\s*\(|\s*,|\s*\n|\s+zwan|$)/i
  const between = betweenRe.exec(plainText)
  if (between && between.index != null) {
    const left = between[1].trim()
    const right = between[2].trim()
    const spanStart = between.index + between[0].indexOf(left)
    const spanEnd =
      between.index + between[0].lastIndexOf(right) + right.length
    pushUnique(out, occupied, {
      text: `${left} i ${right}`,
      suggestedKey: 'wedding.coupleNames',
      confidence: 'medium',
      offsets: { start: spanStart, end: spanEnd },
      reason: 'Fraza „zawarta pomiędzy” — dane pary',
    })
  }

  const para = captureAfterLabel(
    plainText,
    /par[ay]\s+młod[ayeiy]|par[ay]\s+mlod/i,
    60,
  )
  if (para && !/^(zwana|zwani)/i.test(para.text)) {
    pushUnique(out, occupied, {
      text: para.text,
      suggestedKey: 'wedding.coupleNames',
      confidence: 'medium',
      offsets: para,
      reason: 'Etykieta „Para Młoda”',
    })
  }

  // "Pani Anna Kowalska" / "Pan Tomasz Kowalski"
  const personRe =
    /\b(Pan(?:i)?)\s+([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?)/g
  let match: RegExpExecArray | null
  let brideTaken = false
  let groomTaken = false
  while ((match = personRe.exec(plainText)) !== null) {
    const title = match[1]
    const name = match[2]
    const start = match.index
    const isFemale = /^Pani$/i.test(title)
    const parts = name.split(/\s+/)

    if (isFemale && !brideTaken) {
      const firstStart = plainText.indexOf(parts[0], start)
      if (firstStart < 0) continue
      pushUnique(out, occupied, {
        text: parts[0],
        suggestedKey: 'bride.firstName',
        confidence: 'medium',
        offsets: {
          start: firstStart,
          end: firstStart + parts[0].length,
        },
        reason: 'Forma „Pani” — imię panny młodej',
      })
      if (parts[1]) {
        const lastStart = plainText.indexOf(parts[1], start)
        if (lastStart >= 0) {
          pushUnique(out, occupied, {
            text: parts[1],
            suggestedKey: 'bride.lastName',
            confidence: 'medium',
            offsets: { start: lastStart, end: lastStart + parts[1].length },
            reason: 'Forma „Pani” — nazwisko panny młodej',
          })
        }
      }
      brideTaken = true
    } else if (!isFemale && !groomTaken) {
      const firstStart = plainText.indexOf(parts[0], start)
      if (firstStart < 0) continue
      pushUnique(out, occupied, {
        text: parts[0],
        suggestedKey: 'groom.firstName',
        confidence: 'medium',
        offsets: {
          start: firstStart,
          end: firstStart + parts[0].length,
        },
        reason: 'Forma „Pan” — imię pana młodego',
      })
      if (parts[1]) {
        const lastStart = plainText.indexOf(parts[1], start)
        if (lastStart >= 0) {
          pushUnique(out, occupied, {
            text: parts[1],
            suggestedKey: 'groom.lastName',
            confidence: 'medium',
            offsets: { start: lastStart, end: lastStart + parts[1].length },
            reason: 'Forma „Pan” — nazwisko pana młodego',
          })
        }
      }
      groomTaken = true
    }
  }
}

/**
 * Suggest dynamic areas from real contract prose.
 * Does not auto-connect — caller presents Accept / Ignore.
 */
export function suggestDocumentFields(
  input: SuggestDocumentFieldsInput,
): SuggestedField[] {
  const plainText = input.plainText
  if (!plainText.trim()) return []

  // Reserved for paragraph-aware heuristics later
  void input.structure

  const occupied = [...(input.occupiedRanges ?? [])]
  const out: SuggestedField[] = []

  suggestDates(plainText, occupied, out)
  suggestMoney(plainText, occupied, out)
  suggestLocations(plainText, occupied, out)
  suggestParties(plainText, occupied, out)

  const rank = { high: 0, medium: 1, low: 2 }
  return out.sort(
    (a, b) =>
      rank[a.confidence] - rank[b.confidence] ||
      a.offsets.start - b.offsets.start,
  )
}

/** Convert heuristic suggestions into DetectedField rows (not connected). */
export function suggestionsToDetectedFields(
  suggestions: SuggestedField[],
): DetectedField[] {
  return suggestions.map((s, i) => {
    const def = getVariableDef(s.suggestedKey)
    return {
      id: `suggest-${i}-${s.offsets.start}`,
      label: def?.labelPl ?? s.suggestedKey,
      rawToken: s.text,
      suggestedKey: s.suggestedKey,
      mappedKey: null,
      status: 'needs_configuration',
      offsets: s.offsets,
      origin: 'heuristic',
      confidence: s.confidence,
      suggestionReason: s.reason,
    }
  })
}
